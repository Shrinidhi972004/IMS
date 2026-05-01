package alerting

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"github.com/shrinidhi972004/ims/internal/models"
)

// ---------------------------------------------------------------------------
// AlertStrategy — the Strategy Pattern interface
//
// Different component failures require different alerting behavior.
// The Dispatcher selects the correct strategy at runtime based on
// the component type, then calls Execute. New strategies can be added
// without modifying existing code (Open/Closed principle).
// ---------------------------------------------------------------------------

type AlertStrategy interface {
	// Execute sends the alert for the given WorkItem.
	Execute(ctx context.Context, wi *models.WorkItem) (*models.Alert, error)

	// Severity returns the severity this strategy is designed for.
	Severity() models.Severity

	// Channel returns the notification channel this strategy targets.
	Channel() string
}

// ---------------------------------------------------------------------------
// P0Strategy — critical failures (RDBMS, Message Queue)
// Simulates PagerDuty escalation with immediate on-call page.
// ---------------------------------------------------------------------------

type P0Strategy struct{}

func (s *P0Strategy) Severity() models.Severity { return models.SeverityP0 }
func (s *P0Strategy) Channel() string           { return "pagerduty" }

func (s *P0Strategy) Execute(ctx context.Context, wi *models.WorkItem) (*models.Alert, error) {
	alert := &models.Alert{
		ID:         uuid.New().String(),
		WorkItemID: wi.ID,
		Severity:   models.SeverityP0,
		Channel:    s.Channel(),
		Message: fmt.Sprintf(
			"[P0 CRITICAL] %s on %s — immediate response required. Work Item: %s",
			wi.ComponentType, wi.ComponentID, wi.ID,
		),
		SentAt: time.Now().UTC(),
	}

	// In production this would call PagerDuty API.
	// We log as structured JSON to simulate the dispatch.
	log.Error().
		Str("alert_id", alert.ID).
		Str("channel", alert.Channel).
		Str("work_item_id", wi.ID).
		Str("component_id", wi.ComponentID).
		Str("component_type", string(wi.ComponentType)).
		Str("severity", string(alert.Severity)).
		Str("message", alert.Message).
		Msg("ALERT DISPATCHED — PagerDuty on-call escalation")

	return alert, nil
}

// ---------------------------------------------------------------------------
// P1Strategy — high severity failures (API services, NoSQL)
// Simulates Slack #incidents channel notification.
// ---------------------------------------------------------------------------

type P1Strategy struct{}

func (s *P1Strategy) Severity() models.Severity { return models.SeverityP1 }
func (s *P1Strategy) Channel() string           { return "slack" }

func (s *P1Strategy) Execute(ctx context.Context, wi *models.WorkItem) (*models.Alert, error) {
	alert := &models.Alert{
		ID:         uuid.New().String(),
		WorkItemID: wi.ID,
		Severity:   models.SeverityP1,
		Channel:    s.Channel(),
		Message: fmt.Sprintf(
			"[P1 HIGH] %s degraded on %s — investigate within 15 minutes. Work Item: %s",
			wi.ComponentType, wi.ComponentID, wi.ID,
		),
		SentAt: time.Now().UTC(),
	}

	log.Warn().
		Str("alert_id", alert.ID).
		Str("channel", alert.Channel).
		Str("work_item_id", wi.ID).
		Str("component_id", wi.ComponentID).
		Str("component_type", string(wi.ComponentType)).
		Str("severity", string(alert.Severity)).
		Str("message", alert.Message).
		Msg("ALERT DISPATCHED — Slack #incidents")

	return alert, nil
}

// ---------------------------------------------------------------------------
// P2Strategy — low severity failures (Cache misses, minor degradation)
// Simulates email notification to the on-duty team.
// ---------------------------------------------------------------------------

type P2Strategy struct{}

func (s *P2Strategy) Severity() models.Severity { return models.SeverityP2 }
func (s *P2Strategy) Channel() string           { return "email" }

func (s *P2Strategy) Execute(ctx context.Context, wi *models.WorkItem) (*models.Alert, error) {
	alert := &models.Alert{
		ID:         uuid.New().String(),
		WorkItemID: wi.ID,
		Severity:   models.SeverityP2,
		Channel:    s.Channel(),
		Message: fmt.Sprintf(
			"[P2 LOW] %s issue detected on %s — review within 4 hours. Work Item: %s",
			wi.ComponentType, wi.ComponentID, wi.ID,
		),
		SentAt: time.Now().UTC(),
	}

	log.Info().
		Str("alert_id", alert.ID).
		Str("channel", alert.Channel).
		Str("work_item_id", wi.ID).
		Str("component_id", wi.ComponentID).
		Str("component_type", string(wi.ComponentType)).
		Str("severity", string(alert.Severity)).
		Str("message", alert.Message).
		Msg("ALERT DISPATCHED — Email notification")

	return alert, nil
}
