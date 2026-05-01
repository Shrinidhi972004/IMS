package workflow

import (
	"github.com/shrinidhi972004/ims/internal/models"
)

// ---------------------------------------------------------------------------
// State interface — the State Pattern
//
// Each concrete state encapsulates:
//   - Which transitions are valid FROM this state
//   - Any pre-conditions that must be met before transitioning
//
// The WorkItemMachine never switches state directly — it delegates to the
// current state object, which either permits or rejects the transition.
// ---------------------------------------------------------------------------

type State interface {
	// Name returns the WorkItemState enum value for this state.
	Name() models.WorkItemState

	// CanTransitionTo returns true if moving to `next` is a valid transition.
	CanTransitionTo(next models.WorkItemState) bool

	// ValidTransitions returns all states reachable from this state.
	ValidTransitions() []models.WorkItemState
}

// ---------------------------------------------------------------------------
// Concrete state implementations
// ---------------------------------------------------------------------------

// openState — initial state when a WorkItem is first created.
type openState struct{}

func (s *openState) Name() models.WorkItemState { return models.StateOpen }
func (s *openState) CanTransitionTo(next models.WorkItemState) bool {
	return next == models.StateInvestigating
}
func (s *openState) ValidTransitions() []models.WorkItemState {
	return []models.WorkItemState{models.StateInvestigating}
}

// investigatingState — an engineer has acknowledged and is working the incident.
type investigatingState struct{}

func (s *investigatingState) Name() models.WorkItemState { return models.StateInvestigating }
func (s *investigatingState) CanTransitionTo(next models.WorkItemState) bool {
	return next == models.StateResolved
}
func (s *investigatingState) ValidTransitions() []models.WorkItemState {
	return []models.WorkItemState{models.StateResolved}
}

// resolvedState — the immediate fix has been applied, awaiting RCA.
type resolvedState struct{}

func (s *resolvedState) Name() models.WorkItemState { return models.StateResolved }
func (s *resolvedState) CanTransitionTo(next models.WorkItemState) bool {
	return next == models.StateClosed
}
func (s *resolvedState) ValidTransitions() []models.WorkItemState {
	return []models.WorkItemState{models.StateClosed}
}

// closedState — terminal state. No further transitions allowed.
type closedState struct{}

func (s *closedState) Name() models.WorkItemState { return models.StateClosed }
func (s *closedState) CanTransitionTo(_ models.WorkItemState) bool {
	return false // terminal — no exit
}
func (s *closedState) ValidTransitions() []models.WorkItemState {
	return []models.WorkItemState{}
}

// ---------------------------------------------------------------------------
// State registry — maps WorkItemState enum → State implementation
// ---------------------------------------------------------------------------

var stateRegistry = map[models.WorkItemState]State{
	models.StateOpen:          &openState{},
	models.StateInvestigating: &investigatingState{},
	models.StateResolved:      &resolvedState{},
	models.StateClosed:        &closedState{},
}

// stateFor returns the State implementation for a given WorkItemState.
// Panics on unknown state — this is a programmer error, not a runtime error.
func stateFor(s models.WorkItemState) State {
	impl, ok := stateRegistry[s]
	if !ok {
		panic("workflow: unknown state: " + string(s))
	}
	return impl
}
