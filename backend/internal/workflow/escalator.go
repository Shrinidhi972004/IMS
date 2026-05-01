package workflow

import (
	"context"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/shrinidhi972004/ims/internal/models"
	"github.com/shrinidhi972004/ims/internal/store"
)

const (
	escalationInterval  = 60 * time.Second
	p1EscalationAfter   = 30 * time.Minute // P2 → P1 after 30 min unresolved
	p0EscalationAfter   = 60 * time.Minute // P1 → P0 after 60 min unresolved
)

// Escalator is a background goroutine that auto-escalates severity of
// WorkItems that have been INVESTIGATING for too long without resolution.
//
// SLO-driven escalation:
//   P2 → P1 after 30 minutes in INVESTIGATING
//   P1 → P0 after 60 minutes in INVESTIGATING
//
// This is a bonus feature that demonstrates SLO-aware operations.
type Escalator struct {
	postgres *store.PostgresStore
	redis    *store.RedisStore
}

// NewEscalator creates an Escalator.
func NewEscalator(pg *store.PostgresStore, rd *store.RedisStore) *Escalator {
	return &Escalator{postgres: pg, redis: rd}
}

// Start launches the escalation loop. Runs until ctx is cancelled.
func (e *Escalator) Start(ctx context.Context) {
	log.Info().
		Dur("interval", escalationInterval).
		Msg("escalator: starting auto-escalation loop")

	ticker := time.NewTicker(escalationInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Info().Msg("escalator: stopping")
			return
		case <-ticker.C:
			e.runEscalationCheck(ctx)
		}
	}
}

// runEscalationCheck fetches all INVESTIGATING WorkItems and escalates as needed.
func (e *Escalator) runEscalationCheck(ctx context.Context) {
	items, err := e.postgres.ListActiveWorkItems(ctx)
	if err != nil {
		log.Error().Err(err).Msg("escalator: failed to list active work items")
		return
	}

	now := time.Now().UTC()
	escalated := 0

	for _, wi := range items {
		if wi.State != models.StateInvestigating {
			continue
		}

		age := now.Sub(wi.CreatedAt)
		newSeverity := e.computeEscalation(wi.Severity, age)

		if newSeverity == wi.Severity {
			continue // no escalation needed
		}

		if err := e.postgres.UpdateWorkItemSeverity(ctx, wi.ID, newSeverity); err != nil {
			log.Error().
				Err(err).
				Str("work_item_id", wi.ID).
				Msg("escalator: failed to update severity")
			continue
		}

		// Invalidate dashboard cache so the UI reflects the escalation
		_ = e.redis.InvalidateDashboard(ctx)

		escalated++
		log.Warn().
			Str("work_item_id", wi.ID).
			Str("component_id", wi.ComponentID).
			Str("old_severity", string(wi.Severity)).
			Str("new_severity", string(newSeverity)).
			Dur("age_minutes", age).
			Msg("escalator: severity auto-escalated")
	}

	if escalated > 0 {
		log.Info().
			Int("escalated", escalated).
			Int("checked", len(items)).
			Msg("escalator: cycle complete")
	}
}

// computeEscalation returns the new severity based on age and current severity.
func (e *Escalator) computeEscalation(current models.Severity, age time.Duration) models.Severity {
	switch current {
	case models.SeverityP2:
		if age >= p1EscalationAfter {
			return models.SeverityP1
		}
	case models.SeverityP1:
		if age >= p0EscalationAfter {
			return models.SeverityP0
		}
	}
	return current // P0 is already max, or age threshold not met
}
