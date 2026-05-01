package workflow

import (
	"context"
	"fmt"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/shrinidhi972004/ims/internal/models"
	"github.com/shrinidhi972004/ims/internal/store"
)

// Machine orchestrates WorkItem state transitions.
// It enforces:
//   - Valid transition paths (via State pattern)
//   - Mandatory RCA before CLOSED transition
//   - Automatic MTTR calculation on close
//   - Dashboard cache invalidation after every transition
type Machine struct {
	postgres *store.PostgresStore
	redis    *store.RedisStore
}

// NewMachine creates a workflow Machine.
func NewMachine(pg *store.PostgresStore, rd *store.RedisStore) *Machine {
	return &Machine{postgres: pg, redis: rd}
}

// Transition attempts to move a WorkItem from its current state to `toState`.
//
// Rules enforced:
//  1. WorkItem must exist
//  2. Transition must be valid per the State pattern
//  3. CLOSED transition requires a complete, validated RCA
//  4. MTTR is automatically calculated and persisted on CLOSED
func (m *Machine) Transition(ctx context.Context, workItemID string, toState models.WorkItemState) (*models.WorkItem, error) {
	// -------------------------------------------------------------------------
	// 1. Fetch current WorkItem
	// -------------------------------------------------------------------------
	wi, err := m.postgres.GetWorkItem(ctx, workItemID)
	if err != nil {
		return nil, err
	}

	// -------------------------------------------------------------------------
	// 2. Validate transition via State pattern
	// -------------------------------------------------------------------------
	currentState := stateFor(wi.State)
	if !currentState.CanTransitionTo(toState) {
		return nil, fmt.Errorf("%w: %s → %s (valid: %v)",
			models.ErrInvalidTransition,
			wi.State, toState,
			currentState.ValidTransitions(),
		)
	}

	// -------------------------------------------------------------------------
	// 3. CLOSED pre-condition: RCA must exist and be valid
	// -------------------------------------------------------------------------
	var mttr *float64
	if toState == models.StateClosed {
		rca, err := m.postgres.GetRCAByWorkItemID(ctx, workItemID)
		if err != nil {
			return nil, fmt.Errorf("workflow: fetch RCA: %w", err)
		}
		if rca == nil {
			return nil, models.ErrRCARequiredForClose
		}
		if err := rca.Validate(); err != nil {
			return nil, fmt.Errorf("%w: %s", models.ErrRCARequiredForClose, err.Error())
		}
		// Calculate MTTR from RCA timestamps
		minutes := rca.MTTRMinutes()
		mttr = &minutes

		log.Info().
			Str("work_item_id", workItemID).
			Float64("mttr_minutes", minutes).
			Msg("workflow: MTTR calculated")
	}

	// -------------------------------------------------------------------------
	// 4. Persist the transition
	// -------------------------------------------------------------------------
	if err := m.postgres.UpdateWorkItemState(ctx, workItemID, toState, mttr); err != nil {
		return nil, fmt.Errorf("workflow: persist transition: %w", err)
	}

	// -------------------------------------------------------------------------
	// 5. Invalidate dashboard cache
	// -------------------------------------------------------------------------
	if err := m.redis.InvalidateDashboard(ctx); err != nil {
		log.Warn().Err(err).Msg("workflow: failed to invalidate dashboard cache")
	}

	// -------------------------------------------------------------------------
	// 6. Return updated WorkItem
	// -------------------------------------------------------------------------
	updated, err := m.postgres.GetWorkItem(ctx, workItemID)
	if err != nil {
		return nil, err
	}

	log.Info().
		Str("work_item_id", workItemID).
		Str("from", string(wi.State)).
		Str("to", string(toState)).
		Msg("workflow: state transition complete")

	return updated, nil
}

// SubmitRCA validates and persists an RCA record for a WorkItem.
// The WorkItem must be in RESOLVED state before an RCA can be submitted.
func (m *Machine) SubmitRCA(ctx context.Context, rca *models.RCA) error {
	// Validate RCA fields
	if err := rca.Validate(); err != nil {
		return err
	}

	// WorkItem must exist
	wi, err := m.postgres.GetWorkItem(ctx, rca.WorkItemID)
	if err != nil {
		return err
	}

	// RCA can only be submitted when incident is RESOLVED or INVESTIGATING
	// (allow submission during INVESTIGATING so teams can document as they go)
	if wi.State == models.StateOpen || wi.State == models.StateClosed {
		return fmt.Errorf("workflow: RCA can only be submitted when state is INVESTIGATING or RESOLVED, current state: %s", wi.State)
	}

	// Check if RCA already exists
	existing, err := m.postgres.GetRCAByWorkItemID(ctx, rca.WorkItemID)
	if err != nil {
		return fmt.Errorf("workflow: check existing RCA: %w", err)
	}
	if existing != nil {
		return fmt.Errorf("workflow: RCA already submitted for work item %s", rca.WorkItemID)
	}

	rca.SubmittedAt = time.Now().UTC()

	if err := m.postgres.CreateRCA(ctx, rca); err != nil {
		return fmt.Errorf("workflow: persist RCA: %w", err)
	}

	log.Info().
		Str("work_item_id", rca.WorkItemID).
		Str("category", string(rca.RootCauseCategory)).
		Float64("mttr_minutes", rca.MTTRMinutes()).
		Msg("workflow: RCA submitted successfully")

	return nil
}

// GetValidTransitions returns the list of valid next states for a WorkItem.
// Used by the frontend to enable/disable transition buttons.
func (m *Machine) GetValidTransitions(ctx context.Context, workItemID string) ([]models.WorkItemState, error) {
	wi, err := m.postgres.GetWorkItem(ctx, workItemID)
	if err != nil {
		return nil, err
	}
	return stateFor(wi.State).ValidTransitions(), nil
}

// GetValidTransitionsSync returns valid next states without needing a DB lookup.
// Used by the API layer when the WorkItem is already in memory.
func (m *Machine) GetValidTransitionsSync(state models.WorkItemState) []models.WorkItemState {
	return stateFor(state).ValidTransitions()
}
