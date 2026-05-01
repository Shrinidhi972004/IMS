package models

import (
	"time"

	"github.com/google/uuid"
)

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

type Severity string

const (
	SeverityP0 Severity = "P0"
	SeverityP1 Severity = "P1"
	SeverityP2 Severity = "P2"
)

type ComponentType string

const (
	ComponentRDBMS    ComponentType = "RDBMS"
	ComponentNoSQL    ComponentType = "NOSQL"
	ComponentCache    ComponentType = "CACHE"
	ComponentQueue    ComponentType = "QUEUE"
	ComponentAPI      ComponentType = "API"
	ComponentMCPHost  ComponentType = "MCP_HOST"
)

type WorkItemState string

const (
	StateOpen          WorkItemState = "OPEN"
	StateInvestigating WorkItemState = "INVESTIGATING"
	StateResolved      WorkItemState = "RESOLVED"
	StateClosed        WorkItemState = "CLOSED"
)

type RootCauseCategory string

const (
	RCACategoryInfrastructure RootCauseCategory = "INFRASTRUCTURE"
	RCACategoryApplication    RootCauseCategory = "APPLICATION"
	RCACategoryNetwork        RootCauseCategory = "NETWORK"
	RCACategoryDatabase       RootCauseCategory = "DATABASE"
	RCACategoryThirdParty     RootCauseCategory = "THIRD_PARTY"
	RCACategoryHuman          RootCauseCategory = "HUMAN_ERROR"
	RCACategoryUnknown        RootCauseCategory = "UNKNOWN"
)

// ---------------------------------------------------------------------------
// Signal — raw event ingested from external systems
// Stored in MongoDB as the audit log
// ---------------------------------------------------------------------------

type Signal struct {
	ID          string        `json:"id"           bson:"_id"`
	ComponentID string        `json:"component_id" bson:"component_id"`
	ComponentType ComponentType `json:"component_type" bson:"component_type"`
	Message     string        `json:"message"      bson:"message"`
	Severity    Severity      `json:"severity"     bson:"severity"`
	Metadata    map[string]any `json:"metadata"    bson:"metadata"`
	WorkItemID  string        `json:"work_item_id" bson:"work_item_id"` // linked after debounce
	ReceivedAt  time.Time     `json:"received_at"  bson:"received_at"`
}

// NewSignal constructs a Signal with a generated ID and current timestamp.
func NewSignal(componentID string, componentType ComponentType, message string, severity Severity, metadata map[string]any) *Signal {
	return &Signal{
		ID:            uuid.New().String(),
		ComponentID:   componentID,
		ComponentType: componentType,
		Message:       message,
		Severity:      severity,
		Metadata:      metadata,
		ReceivedAt:    time.Now().UTC(),
	}
}

// ---------------------------------------------------------------------------
// WorkItem — structured incident record
// Stored in PostgreSQL (transactional source of truth)
// ---------------------------------------------------------------------------

type WorkItem struct {
	ID          string        `json:"id"           db:"id"`
	ComponentID string        `json:"component_id" db:"component_id"`
	ComponentType ComponentType `json:"component_type" db:"component_type"`
	Title       string        `json:"title"        db:"title"`
	Severity    Severity      `json:"severity"     db:"severity"`
	State       WorkItemState `json:"state"        db:"state"`
	SignalCount  int           `json:"signal_count" db:"signal_count"`
	AssignedTo  string        `json:"assigned_to"  db:"assigned_to"`
	CreatedAt   time.Time     `json:"created_at"   db:"created_at"`
	UpdatedAt   time.Time     `json:"updated_at"   db:"updated_at"`
	ResolvedAt  *time.Time    `json:"resolved_at"  db:"resolved_at"`
	ClosedAt    *time.Time    `json:"closed_at"    db:"closed_at"`
	MTTR        *float64      `json:"mttr_minutes" db:"mttr_minutes"` // calculated on close
}

// NewWorkItem constructs a WorkItem from the first signal of a component.
func NewWorkItem(signal *Signal) *WorkItem {
	return &WorkItem{
		ID:            uuid.New().String(),
		ComponentID:   signal.ComponentID,
		ComponentType: signal.ComponentType,
		Title:         "Incident: " + string(signal.ComponentType) + " failure on " + signal.ComponentID,
		Severity:      signal.Severity,
		State:         StateOpen,
		SignalCount:   1,
		CreatedAt:     time.Now().UTC(),
		UpdatedAt:     time.Now().UTC(),
	}
}

// ---------------------------------------------------------------------------
// RCA — Root Cause Analysis record
// Stored in PostgreSQL, linked 1:1 with a WorkItem
// Required before WorkItem can transition to CLOSED
// ---------------------------------------------------------------------------

type RCA struct {
	ID               string            `json:"id"                db:"id"`
	WorkItemID       string            `json:"work_item_id"      db:"work_item_id"`
	IncidentStart    time.Time         `json:"incident_start"    db:"incident_start"`
	IncidentEnd      time.Time         `json:"incident_end"      db:"incident_end"`
	RootCauseCategory RootCauseCategory `json:"root_cause_category" db:"root_cause_category"`
	RootCauseDetail  string            `json:"root_cause_detail" db:"root_cause_detail"`
	FixApplied       string            `json:"fix_applied"       db:"fix_applied"`
	PreventionSteps  string            `json:"prevention_steps"  db:"prevention_steps"`
	SubmittedBy      string            `json:"submitted_by"      db:"submitted_by"`
	SubmittedAt      time.Time         `json:"submitted_at"      db:"submitted_at"`
}

// Validate ensures all mandatory fields are present before allowing CLOSED transition.
func (r *RCA) Validate() error {
	if r.WorkItemID == "" {
		return ErrRCAMissingWorkItemID
	}
	if r.IncidentStart.IsZero() {
		return ErrRCAMissingStartTime
	}
	if r.IncidentEnd.IsZero() {
		return ErrRCAMissingEndTime
	}
	if !r.IncidentEnd.After(r.IncidentStart) {
		return ErrRCAEndBeforeStart
	}
	if r.RootCauseCategory == "" {
		return ErrRCAMissingCategory
	}
	if len(r.RootCauseDetail) < 20 {
		return ErrRCARootCauseTooShort
	}
	if len(r.FixApplied) < 10 {
		return ErrRCAFixTooShort
	}
	if len(r.PreventionSteps) < 10 {
		return ErrRCAPreventionTooShort
	}
	return nil
}

// MTTRMinutes calculates the mean time to repair in minutes.
func (r *RCA) MTTRMinutes() float64 {
	return r.IncidentEnd.Sub(r.IncidentStart).Minutes()
}

// ---------------------------------------------------------------------------
// Alert — notification payload dispatched by the alerting strategy
// ---------------------------------------------------------------------------

type Alert struct {
	ID         string        `json:"id"`
	WorkItemID string        `json:"work_item_id"`
	Severity   Severity      `json:"severity"`
	Channel    string        `json:"channel"`  // e.g. "pagerduty", "slack", "email"
	Message    string        `json:"message"`
	SentAt     time.Time     `json:"sent_at"`
}

// ---------------------------------------------------------------------------
// DashboardState — cached in Redis for hot-path UI reads
// ---------------------------------------------------------------------------

type DashboardState struct {
	TotalOpen          int            `json:"total_open"`
	TotalInvestigating int            `json:"total_investigating"`
	TotalResolved      int            `json:"total_resolved"`
	TotalClosed        int            `json:"total_closed"`
	SignalsPerSecond    float64        `json:"signals_per_second"`
	ActiveIncidents    []*WorkItem    `json:"active_incidents"`
	UpdatedAt          time.Time      `json:"updated_at"`
}

// ---------------------------------------------------------------------------
// HTTP request/response types
// ---------------------------------------------------------------------------

type IngestRequest struct {
	ComponentID   string         `json:"component_id"`
	ComponentType ComponentType  `json:"component_type"`
	Message       string         `json:"message"`
	Severity      Severity       `json:"severity"`
	Metadata      map[string]any `json:"metadata"`
}

type IngestResponse struct {
	SignalID    string `json:"signal_id"`
	WorkItemID string `json:"work_item_id"`
	Debounced  bool   `json:"debounced"` // true if linked to existing Work Item
}

type TransitionRequest struct {
	ToState WorkItemState `json:"to_state"`
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Token string `json:"token"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}
