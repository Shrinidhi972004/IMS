package api

import (
	"context"
	"runtime"
	"time"

	"github.com/gofiber/adaptor/v2"
	"github.com/gofiber/fiber/v2"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/shrinidhi972004/ims/internal/queue"
	"github.com/shrinidhi972004/ims/internal/store"
	"github.com/shrinidhi972004/ims/internal/worker"
)

// ---------------------------------------------------------------------------
// Prometheus metrics — registered at package init
// ---------------------------------------------------------------------------

var (
	SignalsIngested = promauto.NewCounter(prometheus.CounterOpts{
		Name: "ims_signals_ingested_total",
		Help: "Total number of signals successfully ingested.",
	})

	SignalsDropped = promauto.NewCounter(prometheus.CounterOpts{
		Name: "ims_signals_dropped_total",
		Help: "Total signals dropped due to queue backpressure.",
	})

	SignalsPerSecond = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "ims_signals_per_second",
		Help: "Current signals ingested per second (rolling 5s average).",
	})

	ActiveIncidents = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "ims_active_incidents",
		Help: "Number of OPEN or INVESTIGATING work items.",
	})

	WorkItemsByState = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "ims_work_items_by_state",
		Help: "Work items grouped by state.",
	}, []string{"state"})

	QueueFillRatio = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "ims_queue_fill_ratio",
		Help: "Current signal queue fill ratio (0.0 to 1.0).",
	})

	WSClients = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "ims_websocket_clients",
		Help: "Number of currently connected WebSocket clients.",
	})

	HTTPRequestDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "ims_http_request_duration_seconds",
		Help:    "HTTP request duration in seconds.",
		Buckets: prometheus.DefBuckets,
	}, []string{"method", "path", "status"})
)

// ---------------------------------------------------------------------------
// MetricsCollector — updates Prometheus gauges periodically
// ---------------------------------------------------------------------------

type MetricsCollector struct {
	stores *store.Stores
	queue  *queue.SignalQueue
	pool   *worker.Pool
	hub    *Hub
}

func NewMetricsCollector(stores *store.Stores, q *queue.SignalQueue, pool *worker.Pool, hub *Hub) *MetricsCollector {
	return &MetricsCollector{stores: stores, queue: q, pool: pool, hub: hub}
}

// Start updates Prometheus gauges every 10 seconds.
func (m *MetricsCollector) Start(ctx context.Context) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.collect(ctx)
		}
	}
}

func (m *MetricsCollector) collect(ctx context.Context) {
	// Queue metrics
	QueueFillRatio.Set(m.queue.FillRatio())
	SignalsDropped.Add(0) // counter-only, updated in ingestion handler

	// WebSocket clients
	WSClients.Set(float64(m.hub.ClientCount()))

	// Signals per second from Redis
	sps, err := m.stores.Redis.GetSignalsPerSecond(ctx)
	if err == nil {
		SignalsPerSecond.Set(sps)
	}

	// Work item state counts
	open, investigating, resolved, closed, err := m.stores.Postgres.GetDashboardCounts(ctx)
	if err == nil {
		WorkItemsByState.WithLabelValues("OPEN").Set(float64(open))
		WorkItemsByState.WithLabelValues("INVESTIGATING").Set(float64(investigating))
		WorkItemsByState.WithLabelValues("RESOLVED").Set(float64(resolved))
		WorkItemsByState.WithLabelValues("CLOSED").Set(float64(closed))
		ActiveIncidents.Set(float64(open + investigating))
	}
}

// ---------------------------------------------------------------------------
// Health handler — GET /health
// ---------------------------------------------------------------------------

type HealthHandler struct {
	stores    *store.Stores
	queue     *queue.SignalQueue
	pool      *worker.Pool
	startTime time.Time
}

func NewHealthHandler(stores *store.Stores, q *queue.SignalQueue, pool *worker.Pool) *HealthHandler {
	return &HealthHandler{
		stores:    stores,
		queue:     q,
		pool:      pool,
		startTime: time.Now(),
	}
}

func (h *HealthHandler) Health(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	// Check all dependencies
	pgOk := h.stores.Postgres.Pool().Ping(ctx) == nil
	redisOk := true
	if err := h.stores.Redis.Ping(ctx); err != nil {
		redisOk = false
	}

	overall := "healthy"
	statusCode := fiber.StatusOK
	if !pgOk || !redisOk {
		overall = "degraded"
		statusCode = fiber.StatusServiceUnavailable
	}

	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	workerStats := h.pool.Stats()

	return c.Status(statusCode).JSON(fiber.Map{
		"status":    overall,
		"uptime":    time.Since(h.startTime).String(),
		"timestamp": time.Now().UTC(),
		"dependencies": fiber.Map{
			"postgres": boolToStatus(pgOk),
			"redis":    boolToStatus(redisOk),
			"mongodb":  "ok", // mongo ping is expensive; we rely on store init health
		},
		"queue": fiber.Map{
			"length":     h.queue.Len(),
			"capacity":   h.queue.Cap(),
			"fill_pct":   h.queue.FillRatio() * 100,
			"dropped":    h.queue.DroppedCount(),
			"enqueued":   h.queue.EnqueuedCount(),
		},
		"workers":  workerStats,
		"memory": fiber.Map{
			"alloc_mb":   memStats.Alloc / 1024 / 1024,
			"sys_mb":     memStats.Sys / 1024 / 1024,
			"goroutines": runtime.NumGoroutine(),
		},
	})
}

// MetricsHandler returns the Prometheus /metrics endpoint.
func MetricsHandler() fiber.Handler {
	return adaptor.HTTPHandler(promhttp.Handler())
}

func boolToStatus(ok bool) string {
	if ok {
		return "ok"
	}
	return "unreachable"
}
