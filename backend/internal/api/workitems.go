package api

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/shrinidhi972004/ims/internal/models"
	"github.com/shrinidhi972004/ims/internal/store"
	"github.com/shrinidhi972004/ims/internal/workflow"
)

// WorkItemHandler handles all WorkItem and RCA REST endpoints.
type WorkItemHandler struct {
	stores  *store.Stores
	machine *workflow.Machine
}

// NewWorkItemHandler constructs the handler.
func NewWorkItemHandler(stores *store.Stores, machine *workflow.Machine) *WorkItemHandler {
	return &WorkItemHandler{stores: stores, machine: machine}
}

// ---------------------------------------------------------------------------
// GET /api/v1/workitems
// Returns all work items sorted by severity then created_at desc.
// Tries Redis cache first; falls back to Postgres on cache miss.
// ---------------------------------------------------------------------------
func (h *WorkItemHandler) ListWorkItems(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Always query Postgres for full list
	items, err := h.stores.Postgres.ListWorkItems(ctx)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse{
			Error: "failed to fetch work items: " + err.Error(),
		})
	}

	// Rebuild and cache dashboard state
	go h.rebuildDashboardCache(items)

	return c.JSON(fiber.Map{
		"data":       items,
		"from_cache": false,
	})
}

// ---------------------------------------------------------------------------
// GET /api/v1/workitems/:id
// Returns a single WorkItem with its linked raw signals from MongoDB.
// ---------------------------------------------------------------------------
func (h *WorkItemHandler) GetWorkItem(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(models.ErrorResponse{Error: "id is required"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	wi, err := h.stores.Postgres.GetWorkItem(ctx, id)
	if err != nil {
		if err == models.ErrWorkItemNotFound {
			return c.Status(fiber.StatusNotFound).JSON(models.ErrorResponse{Error: err.Error()})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse{Error: err.Error()})
	}

	// Fetch raw signals from MongoDB (audit log)
	signals, err := h.stores.Mongo.GetSignalsByWorkItemID(ctx, id)
	if err != nil {
		signals = []*models.Signal{} // non-fatal — return work item without signals
	}

	// Fetch RCA if exists
	rca, _ := h.stores.Postgres.GetRCAByWorkItemID(ctx, id)

	// Get valid transitions for UI button rendering
	validTransitions := h.machine.GetValidTransitionsSync(wi.State)

	return c.JSON(fiber.Map{
		"work_item":         wi,
		"signals":           signals,
		"signal_count":      len(signals),
		"rca":               rca,
		"valid_transitions": validTransitions,
	})
}

// ---------------------------------------------------------------------------
// PATCH /api/v1/workitems/:id/transition
// Transitions a WorkItem to a new state.
// Body: { "to_state": "INVESTIGATING" }
// ---------------------------------------------------------------------------
func (h *WorkItemHandler) TransitionWorkItem(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(models.ErrorResponse{Error: "id is required"})
	}

	var req models.TransitionRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(models.ErrorResponse{
			Error: "invalid request body: " + err.Error(),
		})
	}
	if req.ToState == "" {
		return c.Status(fiber.StatusBadRequest).JSON(models.ErrorResponse{
			Error: "to_state is required",
		})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	updated, err := h.machine.Transition(ctx, id, req.ToState)
	if err != nil {
		switch err {
		case models.ErrWorkItemNotFound:
			return c.Status(fiber.StatusNotFound).JSON(models.ErrorResponse{Error: err.Error()})
		case models.ErrRCARequiredForClose:
			return c.Status(fiber.StatusUnprocessableEntity).JSON(models.ErrorResponse{Error: err.Error()})
		default:
			// Check if it's an invalid transition error
			if isInvalidTransition(err) {
				return c.Status(fiber.StatusConflict).JSON(models.ErrorResponse{Error: err.Error()})
			}
			return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse{Error: err.Error()})
		}
	}

	return c.JSON(fiber.Map{
		"work_item": updated,
		"message":   "transition successful",
	})
}

// ---------------------------------------------------------------------------
// POST /api/v1/workitems/:id/rca
// Submits an RCA for a WorkItem.
// ---------------------------------------------------------------------------
func (h *WorkItemHandler) SubmitRCA(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(models.ErrorResponse{Error: "id is required"})
	}

	var rca models.RCA
	if err := c.BodyParser(&rca); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(models.ErrorResponse{
			Error: "invalid RCA body: " + err.Error(),
		})
	}

	// Force work_item_id from URL param — prevents spoofing
	rca.WorkItemID = id
	rca.ID = uuid.New().String()
	rca.SubmittedAt = time.Now().UTC()

	// Extract submitter from JWT claims if available
	if user := c.Locals("user"); user != nil {
		if claims, ok := user.(fiber.Map); ok {
			if sub, ok := claims["sub"].(string); ok {
				rca.SubmittedBy = sub
			}
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := h.machine.SubmitRCA(ctx, &rca); err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(models.ErrorResponse{
			Error: err.Error(),
		})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"rca":     rca,
		"message": "RCA submitted successfully",
	})
}

// ---------------------------------------------------------------------------
// GET /api/v1/workitems/:id/rca
// Returns the RCA for a WorkItem.
// ---------------------------------------------------------------------------
func (h *WorkItemHandler) GetRCA(c *fiber.Ctx) error {
	id := c.Params("id")
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	rca, err := h.stores.Postgres.GetRCAByWorkItemID(ctx, id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse{Error: err.Error()})
	}
	if rca == nil {
		return c.Status(fiber.StatusNotFound).JSON(models.ErrorResponse{
			Error: "no RCA submitted for this work item",
		})
	}
	return c.JSON(rca)
}

// ---------------------------------------------------------------------------
// GET /api/v1/dashboard
// Returns the real-time dashboard state (cache-first).
// ---------------------------------------------------------------------------
func (h *WorkItemHandler) GetDashboard(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Try Redis hot-path cache
	cached, err := h.stores.Redis.GetDashboardState(ctx)
	if err == nil && cached != nil {
		return c.JSON(cached)
	}

	// Cache miss — rebuild from Postgres
	items, err := h.stores.Postgres.ListActiveWorkItems(ctx)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse{Error: err.Error()})
	}

	open, investigating, resolved, closed, err := h.stores.Postgres.GetDashboardCounts(ctx)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse{Error: err.Error()})
	}

	sps, _ := h.stores.Redis.GetSignalsPerSecond(ctx)

	state := &models.DashboardState{
		TotalOpen:          open,
		TotalInvestigating: investigating,
		TotalResolved:      resolved,
		TotalClosed:        closed,
		SignalsPerSecond:    sps,
		ActiveIncidents:    items,
		UpdatedAt:          time.Now().UTC(),
	}

	// Cache for next request
	_ = h.stores.Redis.SetDashboardState(ctx, state)

	return c.JSON(state)
}

// ---------------------------------------------------------------------------
// GET /api/v1/signals/:work_item_id
// Returns raw signals from MongoDB for a given WorkItem.
// ---------------------------------------------------------------------------
func (h *WorkItemHandler) GetSignals(c *fiber.Ctx) error {
	workItemID := c.Params("work_item_id")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	signals, err := h.stores.Mongo.GetSignalsByWorkItemID(ctx, workItemID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse{Error: err.Error()})
	}

	return c.JSON(fiber.Map{
		"signals": signals,
		"count":   len(signals),
	})
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func (h *WorkItemHandler) rebuildDashboardCache(items []*models.WorkItem) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	open, investigating, resolved, closed, err := h.stores.Postgres.GetDashboardCounts(ctx)
	if err != nil {
		return
	}

	sps, _ := h.stores.Redis.GetSignalsPerSecond(ctx)

	// Filter to active only for dashboard
	var active []*models.WorkItem
	for _, wi := range items {
		if wi.State == models.StateOpen || wi.State == models.StateInvestigating {
			active = append(active, wi)
		}
	}

	state := &models.DashboardState{
		TotalOpen:          open,
		TotalInvestigating: investigating,
		TotalResolved:      resolved,
		TotalClosed:        closed,
		SignalsPerSecond:    sps,
		ActiveIncidents:    active,
		UpdatedAt:          time.Now().UTC(),
	}

	_ = h.stores.Redis.SetDashboardState(ctx, state)
}

func isInvalidTransition(err error) bool {
	if err == nil {
		return false
	}
	return contains(err.Error(), "invalid state transition")
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(s) > 0 && containsAt(s, sub))
}

func containsAt(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
