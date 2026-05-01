package worker

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/shrinidhi972004/ims/internal/models"
	"github.com/shrinidhi972004/ims/internal/queue"
	"github.com/shrinidhi972004/ims/internal/store"
)

const (
	DefaultWorkerCount    = 20
	throughputLogInterval = 5 * time.Second
)

// Pool is a fixed-size goroutine pool that consumes signals from the queue
// and fans out to MongoDB (raw audit log) and PostgreSQL (signal count update).
type Pool struct {
	workers     int
	queue       *queue.SignalQueue
	stores      *store.Stores
	processed   atomic.Int64
	errors      atomic.Int64
	wg          sync.WaitGroup
}

// New creates a worker Pool.
func New(workerCount int, q *queue.SignalQueue, stores *store.Stores) *Pool {
	if workerCount <= 0 {
		workerCount = DefaultWorkerCount
	}
	return &Pool{
		workers: workerCount,
		queue:   q,
		stores:  stores,
	}
}

// Start launches all worker goroutines and the throughput logger.
// It returns immediately; workers run until ctx is cancelled.
func (p *Pool) Start(ctx context.Context) {
	log.Info().
		Int("workers", p.workers).
		Int("queue_cap", p.queue.Cap()).
		Msg("worker pool starting")

	for i := 0; i < p.workers; i++ {
		p.wg.Add(1)
		go p.runWorker(ctx, i)
	}

	// Throughput logger — prints signals/sec every 5 seconds to console
	go p.logThroughput(ctx)

	log.Info().Int("workers", p.workers).Msg("worker pool started")
}

// Wait blocks until all workers have exited (called during graceful shutdown).
func (p *Pool) Wait() {
	p.wg.Wait()
	log.Info().Msg("worker pool stopped")
}

// runWorker is the main loop for a single worker goroutine.
func (p *Pool) runWorker(ctx context.Context, id int) {
	defer p.wg.Done()
	log.Debug().Int("worker_id", id).Msg("worker started")

	for {
		select {
		case <-ctx.Done():
			log.Debug().Int("worker_id", id).Msg("worker stopping")
			return

		case signal, ok := <-p.queue.Consume():
			if !ok {
				return
			}
			p.processSignal(ctx, signal, id)
		}
	}
}

// processSignal fans out a signal to all persistence targets.
// Errors are logged but never crash the worker — resilience first.
func (p *Pool) processSignal(ctx context.Context, signal *models.Signal, workerID int) {
	logger := log.With().
		Str("signal_id", signal.ID).
		Str("component_id", signal.ComponentID).
		Str("work_item_id", signal.WorkItemID).
		Int("worker_id", workerID).
		Logger()

	writeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	// Fan out to MongoDB and PostgreSQL concurrently
	var wg sync.WaitGroup
	var mongoErr, pgErr error

	// 1. Write raw signal to MongoDB (audit log / data lake)
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := p.stores.Mongo.InsertSignal(writeCtx, signal); err != nil {
			logger.Error().Err(err).Msg("worker: failed to insert signal into mongo")
			mongoErr = err
		}
	}()

	// 2. Increment signal count on the WorkItem in PostgreSQL
	wg.Add(1)
	go func() {
		defer wg.Done()
		if signal.WorkItemID != "" {
			if err := p.stores.Postgres.IncrementSignalCount(writeCtx, signal.WorkItemID); err != nil {
				logger.Error().Err(err).Msg("worker: failed to increment signal count in postgres")
				pgErr = err
			}
		}
	}()

	// 3. Write to TimescaleDB timeseries bucket (best-effort, non-blocking)
	wg.Add(1)
	go func() {
		defer wg.Done()
		p.writeTimeseries(writeCtx, signal)
	}()

	wg.Wait()

	if mongoErr != nil || pgErr != nil {
		p.errors.Add(1)
		logger.Warn().
			Bool("mongo_ok", mongoErr == nil).
			Bool("pg_ok", pgErr == nil).
			Msg("worker: signal processed with errors")
		return
	}

	p.processed.Add(1)
	logger.Debug().Msg("worker: signal processed successfully")
}

// writeTimeseries upserts a count into the signal_timeseries table.
// Uses minute-level bucketing for aggregation.
func (p *Pool) writeTimeseries(ctx context.Context, signal *models.Signal) {
	bucket := time.Now().UTC().Truncate(time.Minute)
	_, err := p.stores.Postgres.Pool().Exec(ctx, `
		INSERT INTO signal_timeseries (bucket, component_id, component_type, severity, signal_count)
		VALUES ($1, $2, $3, $4, 1)
		ON CONFLICT (bucket, component_id, severity)
		DO UPDATE SET signal_count = signal_timeseries.signal_count + 1`,
		bucket, signal.ComponentID, signal.ComponentType, signal.Severity,
	)
	if err != nil {
		log.Debug().Err(err).Msg("worker: timeseries write failed (non-critical)")
	}
}

// logThroughput prints processed signal metrics every 5 seconds.
// This satisfies the assignment requirement for console throughput metrics.
func (p *Pool) logThroughput(ctx context.Context) {
	ticker := time.NewTicker(throughputLogInterval)
	defer ticker.Stop()

	var lastProcessed int64

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			current := p.processed.Load()
			delta := current - lastProcessed
			lastProcessed = current

			sps, err := p.stores.Redis.GetSignalsPerSecond(ctx)
			if err != nil {
				sps = 0
			}

			log.Info().
				Str("component", "throughput").
				Int64("signals_last_5s", delta).
				Float64("signals_per_sec", float64(delta)/throughputLogInterval.Seconds()).
				Float64("redis_signals_per_sec", sps).
				Int64("total_processed", current).
				Int64("total_errors", p.errors.Load()).
				Int("queue_len", p.queue.Len()).
				Float64("queue_fill_pct", p.queue.FillRatio()*100).
				Int64("total_dropped", p.queue.DroppedCount()).
				Msg("throughput metrics")
		}
	}
}

// Stats returns current worker pool statistics.
func (p *Pool) Stats() map[string]any {
	return map[string]any{
		"workers":         p.workers,
		"total_processed": p.processed.Load(),
		"total_errors":    p.errors.Load(),
		"queue_len":       p.queue.Len(),
		"queue_capacity":  p.queue.Cap(),
		"queue_fill_pct":  p.queue.FillRatio() * 100,
		"total_dropped":   p.queue.DroppedCount(),
	}
}
