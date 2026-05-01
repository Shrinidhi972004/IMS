package alerting

import (
	"context"
	"fmt"

	"github.com/rs/zerolog/log"
	"github.com/shrinidhi972004/ims/internal/models"
)

// componentSeverityMap defines the default severity for each component type.
// This drives strategy selection — a RDBMS failure is always P0,
// a Cache failure is always P2, etc.
var componentSeverityMap = map[models.ComponentType]models.Severity{
	models.ComponentRDBMS:   models.SeverityP0, // database outage = critical
	models.ComponentQueue:   models.SeverityP0, // message queue failure = critical
	models.ComponentAPI:     models.SeverityP1, // API degradation = high
	models.ComponentNoSQL:   models.SeverityP1, // nosql issue = high
	models.ComponentMCPHost: models.SeverityP1, // MCP host = high
	models.ComponentCache:   models.SeverityP2, // cache miss = low
}

// strategyRegistry maps severity to its concrete AlertStrategy.
// Adding a new severity level only requires registering it here —
// no other code changes needed (Open/Closed principle).
var strategyRegistry = map[models.Severity]AlertStrategy{
	models.SeverityP0: &P0Strategy{},
	models.SeverityP1: &P1Strategy{},
	models.SeverityP2: &P2Strategy{},
}

// Dispatcher selects and executes the correct AlertStrategy for a WorkItem.
type Dispatcher struct{}

// NewDispatcher creates an alert Dispatcher.
func NewDispatcher() *Dispatcher {
	return &Dispatcher{}
}

// Dispatch selects the appropriate AlertStrategy based on the WorkItem's
// component type and severity, then executes it.
//
// The severity on the WorkItem takes precedence (it may have been escalated).
// If no strategy is found for the severity, it defaults to P2.
func (d *Dispatcher) Dispatch(ctx context.Context, wi *models.WorkItem) (*models.Alert, error) {
	// Use the WorkItem's current severity (may have been auto-escalated)
	severity := wi.Severity

	// Override with component-default if WorkItem severity is not set
	if severity == "" {
		var ok bool
		severity, ok = componentSeverityMap[wi.ComponentType]
		if !ok {
			severity = models.SeverityP2 // safe default
		}
	}

	strategy, ok := strategyRegistry[severity]
	if !ok {
		log.Warn().
			Str("severity", string(severity)).
			Str("work_item_id", wi.ID).
			Msg("dispatcher: no strategy for severity, falling back to P2")
		strategy = strategyRegistry[models.SeverityP2]
	}

	log.Info().
		Str("work_item_id", wi.ID).
		Str("component_type", string(wi.ComponentType)).
		Str("severity", string(severity)).
		Str("strategy", fmt.Sprintf("%T", strategy)).
		Str("channel", strategy.Channel()).
		Msg("dispatcher: executing alert strategy")

	return strategy.Execute(ctx, wi)
}

// SeverityForComponent returns the default severity for a component type.
// Used by the ingestion layer to set initial WorkItem severity.
func SeverityForComponent(ct models.ComponentType) models.Severity {
	if s, ok := componentSeverityMap[ct]; ok {
		return s
	}
	return models.SeverityP2
}
