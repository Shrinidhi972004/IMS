package ingestion

import (
	"context"
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"github.com/shrinidhi972004/ims/internal/models"
	"github.com/shrinidhi972004/ims/internal/queue"
	"github.com/shrinidhi972004/ims/internal/alerting"
	"github.com/shrinidhi972004/ims/internal/store"
)

// Handler handles signal ingestion HTTP requests.
type Handler struct {
	queue       *queue.SignalQueue
	debouncer   *Debouncer
	rateLimiter *RateLimiter
	postgres    *store.PostgresStore
	redis       *store.RedisStore
	dispatcher  *alerting.Dispatcher
}

// NewHandler constructs the ingestion handler with all dependencies.
func NewHandler(
	q *queue.SignalQueue,
	pg *store.PostgresStore,
	rd *store.RedisStore,
) *Handler {
	return &Handler{
		queue:     q,
		debouncer: NewDebouncer(rd),
		// 200 burst capacity, 100 sustained requests/sec per IP
		rateLimiter: NewRateLimiter(200, 100),
		postgres:    pg,
		redis:       rd,
		dispatcher:  alerting.NewDispatcher(),
	}
}

// IngestSignal handles POST /api/v1/signals
//
// Flow:
//  1. Rate limit check (token bucket per IP)
//  2. Parse + validate request body
//  3. Construct Signal struct
//  4. Debounce: find or create WorkItem for this component
//  5. Push signal onto bounded channel queue (non-blocking)
//  6. Increment Redis throughput counter
//  7. Return 202 Accepted
func (h *Handler) IngestSignal(c *fiber.Ctx) error {
	// -------------------------------------------------------------------------
	// 1. Rate limiting
	// -------------------------------------------------------------------------
	ip := c.IP()
	allowed, remaining, resetIn := h.rateLimiter.Allow(ip)

	// Always set rate limit headers
	c.Set("X-RateLimit-Limit", "100")
	c.Set("X-RateLimit-Remaining", fmt.Sprintf("%d", remaining))
	c.Set("X-RateLimit-Reset", fmt.Sprintf("%d", time.Now().Add(resetIn).Unix()))

	if !allowed {
		log.Warn().
			Str("ip", ip).
			Str("component", "ingestion").
			Msg("rate limit exceeded")
		return c.Status(fiber.StatusTooManyRequests).JSON(models.ErrorResponse{
			Error: models.ErrRateLimitExceeded.Error(),
		})
	}

	// -------------------------------------------------------------------------
	// 2. Parse and validate request body
	// -------------------------------------------------------------------------
	var req models.IngestRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(models.ErrorResponse{
			Error: "invalid request body: " + err.Error(),
		})
	}

	if err := validateIngestRequest(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(models.ErrorResponse{
			Error: err.Error(),
		})
	}

	// -------------------------------------------------------------------------
	// 3. Construct Signal
	// -------------------------------------------------------------------------
	signal := models.NewSignal(
		req.ComponentID,
		req.ComponentType,
		req.Message,
		req.Severity,
		req.Metadata,
	)

	// -------------------------------------------------------------------------
	// 4. Debounce: resolve WorkItem
	// -------------------------------------------------------------------------
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	workItemID, isNew, err := h.debouncer.Resolve(ctx, signal, func() (*models.WorkItem, error) {
		wi := models.NewWorkItem(signal)
		// Set severity based on component type via alerting dispatcher mapping
		wi.Severity = alerting.SeverityForComponent(signal.ComponentType)
		signal.Severity = wi.Severity // keep signal in sync
		if err := h.postgres.CreateWorkItem(ctx, wi); err != nil {
			return nil, fmt.Errorf("create work item: %w", err)
		}
		// Dispatch alert asynchronously — non-blocking
		go func() {
			if _, err := h.dispatcher.Dispatch(context.Background(), wi); err != nil {
				log.Error().Err(err).Str("work_item_id", wi.ID).Msg("ingestion: alert dispatch failed")
			}
		}()
		// Invalidate dashboard cache so next UI refresh shows the new incident
		_ = h.redis.InvalidateDashboard(ctx)
		return wi, nil
	})
	if err != nil {
		log.Error().Err(err).Str("component_id", req.ComponentID).
			Msg("ingestion: failed to resolve work item")
		return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse{
			Error: "failed to process signal: " + err.Error(),
		})
	}

	// Link signal to its WorkItem
	signal.WorkItemID = workItemID

	// -------------------------------------------------------------------------
	// 5. Enqueue signal (non-blocking)
	// -------------------------------------------------------------------------
	if !h.queue.TryEnqueue(signal) {
		return c.Status(fiber.StatusTooManyRequests).JSON(models.ErrorResponse{
			Error: models.ErrQueueFull.Error(),
		})
	}

	// -------------------------------------------------------------------------
	// 6. Increment throughput counter (best-effort, non-blocking)
	// -------------------------------------------------------------------------
	go func() {
		_ = h.redis.IncrementSignalCounter(context.Background())
	}()

	// -------------------------------------------------------------------------
	// 7. Respond 202 Accepted
	// -------------------------------------------------------------------------
	log.Debug().
		Str("signal_id", signal.ID).
		Str("work_item_id", workItemID).
		Bool("is_new_work_item", isNew).
		Str("component_id", req.ComponentID).
		Msg("signal accepted")

	return c.Status(fiber.StatusAccepted).JSON(models.IngestResponse{
		SignalID:   signal.ID,
		WorkItemID: workItemID,
		Debounced:  !isNew,
	})
}

// IngestBatch handles POST /api/v1/signals/batch
// Accepts up to 100 signals in a single request for high-throughput clients.
func (h *Handler) IngestBatch(c *fiber.Ctx) error {
	ip := c.IP()
	allowed, remaining, resetIn := h.rateLimiter.Allow(ip)
	c.Set("X-RateLimit-Limit", "100")
	c.Set("X-RateLimit-Remaining", fmt.Sprintf("%d", remaining))
	c.Set("X-RateLimit-Reset", fmt.Sprintf("%d", time.Now().Add(resetIn).Unix()))

	if !allowed {
		return c.Status(fiber.StatusTooManyRequests).JSON(models.ErrorResponse{
			Error: models.ErrRateLimitExceeded.Error(),
		})
	}

	var reqs []models.IngestRequest
	if err := c.BodyParser(&reqs); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(models.ErrorResponse{
			Error: "invalid batch request body: " + err.Error(),
		})
	}
	if len(reqs) > 100 {
		return c.Status(fiber.StatusBadRequest).JSON(models.ErrorResponse{
			Error: "batch size exceeds maximum of 100 signals",
		})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	type result struct {
		SignalID   string `json:"signal_id"`
		WorkItemID string `json:"work_item_id"`
		Debounced  bool   `json:"debounced"`
		Error      string `json:"error,omitempty"`
	}
	results := make([]result, 0, len(reqs))

	for _, req := range reqs {
		if err := validateIngestRequest(&req); err != nil {
			results = append(results, result{Error: err.Error()})
			continue
		}

		signal := models.NewSignal(req.ComponentID, req.ComponentType, req.Message, req.Severity, req.Metadata)

		workItemID, isNew, err := h.debouncer.Resolve(ctx, signal, func() (*models.WorkItem, error) {
			wi := models.NewWorkItem(signal)
			if err := h.postgres.CreateWorkItem(ctx, wi); err != nil {
				return nil, err
			}
			_ = h.redis.InvalidateDashboard(ctx)
			return wi, nil
		})
		if err != nil {
			results = append(results, result{Error: err.Error()})
			continue
		}

		signal.WorkItemID = workItemID
		if !h.queue.TryEnqueue(signal) {
			results = append(results, result{Error: models.ErrQueueFull.Error()})
			continue
		}

		go func() { _ = h.redis.IncrementSignalCounter(context.Background()) }()

		results = append(results, result{
			SignalID:   signal.ID,
			WorkItemID: workItemID,
			Debounced:  !isNew,
		})
	}

	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{"results": results})
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

func validateIngestRequest(req *models.IngestRequest) error {
	if req.ComponentID == "" {
		return fmt.Errorf("%w: component_id is required", models.ErrInvalidSignal)
	}
	if req.ComponentType == "" {
		return fmt.Errorf("%w: component_type is required", models.ErrInvalidSignal)
	}
	if req.Message == "" {
		return fmt.Errorf("%w: message is required", models.ErrInvalidSignal)
	}
	if req.Severity == "" {
		return fmt.Errorf("%w: severity is required", models.ErrInvalidSignal)
	}
	switch req.Severity {
	case models.SeverityP0, models.SeverityP1, models.SeverityP2:
	default:
		return fmt.Errorf("%w: severity must be P0, P1, or P2", models.ErrInvalidSignal)
	}
	switch req.ComponentType {
	case models.ComponentRDBMS, models.ComponentNoSQL, models.ComponentCache,
		models.ComponentQueue, models.ComponentAPI, models.ComponentMCPHost:
	default:
		return fmt.Errorf("%w: invalid component_type", models.ErrInvalidSignal)
	}
	if req.Metadata == nil {
		req.Metadata = map[string]any{"signal_id": uuid.New().String()}
	}
	return nil
}
