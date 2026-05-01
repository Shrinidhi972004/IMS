package models

import "errors"

// RCA validation errors
var (
	ErrRCAMissingWorkItemID   = errors.New("RCA: work_item_id is required")
	ErrRCAMissingStartTime    = errors.New("RCA: incident_start is required")
	ErrRCAMissingEndTime      = errors.New("RCA: incident_end is required")
	ErrRCAEndBeforeStart      = errors.New("RCA: incident_end must be after incident_start")
	ErrRCAMissingCategory     = errors.New("RCA: root_cause_category is required")
	ErrRCARootCauseTooShort   = errors.New("RCA: root_cause_detail must be at least 20 characters")
	ErrRCAFixTooShort         = errors.New("RCA: fix_applied must be at least 10 characters")
	ErrRCAPreventionTooShort  = errors.New("RCA: prevention_steps must be at least 10 characters")
)

// WorkItem state machine errors
var (
	ErrInvalidTransition    = errors.New("workflow: invalid state transition")
	ErrRCARequiredForClose  = errors.New("workflow: RCA must be submitted and complete before closing")
	ErrWorkItemNotFound     = errors.New("workflow: work item not found")
)

// Ingestion errors
var (
	ErrQueueFull            = errors.New("ingestion: signal queue is full, try again later")
	ErrRateLimitExceeded    = errors.New("ingestion: rate limit exceeded")
	ErrInvalidSignal        = errors.New("ingestion: invalid signal payload")
)

// Auth errors
var (
	ErrInvalidCredentials   = errors.New("auth: invalid username or password")
	ErrUnauthorized         = errors.New("auth: unauthorized")
)
