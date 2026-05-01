package models_test

import (
	"strings"
	"testing"
	"time"

	"github.com/shrinidhi972004/ims/internal/models"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// validRCA returns a fully populated, valid RCA for use as a baseline.
func validRCA() models.RCA {
	now := time.Now().UTC()
	return models.RCA{
		ID:               "test-rca-001",
		WorkItemID:       "test-wi-001",
		IncidentStart:    now.Add(-90 * time.Minute),
		IncidentEnd:      now,
		RootCauseCategory: models.RCACategoryDatabase,
		RootCauseDetail:  "Connection pool exhausted due to slow query in deploy v2.4.1",
		FixApplied:       "Rolled back deploy v2.4.1",
		PreventionSteps:  "Add query timeout and pool monitoring",
		SubmittedBy:      "admin",
		SubmittedAt:      now,
	}
}

// ---------------------------------------------------------------------------
// TestRCAValidate_ValidRCA — happy path
// ---------------------------------------------------------------------------

func TestRCAValidate_ValidRCA(t *testing.T) {
	rca := validRCA()
	if err := rca.Validate(); err != nil {
		t.Errorf("expected valid RCA to pass, got error: %v", err)
	}
}

// ---------------------------------------------------------------------------
// TestRCAValidate_MissingWorkItemID
// ---------------------------------------------------------------------------

func TestRCAValidate_MissingWorkItemID(t *testing.T) {
	rca := validRCA()
	rca.WorkItemID = ""

	err := rca.Validate()
	if err == nil {
		t.Fatal("expected error for missing WorkItemID, got nil")
	}
	if err != models.ErrRCAMissingWorkItemID {
		t.Errorf("expected ErrRCAMissingWorkItemID, got: %v", err)
	}
}

// ---------------------------------------------------------------------------
// TestRCAValidate_MissingIncidentStart
// ---------------------------------------------------------------------------

func TestRCAValidate_MissingIncidentStart(t *testing.T) {
	rca := validRCA()
	rca.IncidentStart = time.Time{} // zero value

	err := rca.Validate()
	if err == nil {
		t.Fatal("expected error for missing IncidentStart, got nil")
	}
	if err != models.ErrRCAMissingStartTime {
		t.Errorf("expected ErrRCAMissingStartTime, got: %v", err)
	}
}

// ---------------------------------------------------------------------------
// TestRCAValidate_MissingIncidentEnd
// ---------------------------------------------------------------------------

func TestRCAValidate_MissingIncidentEnd(t *testing.T) {
	rca := validRCA()
	rca.IncidentEnd = time.Time{} // zero value

	err := rca.Validate()
	if err == nil {
		t.Fatal("expected error for missing IncidentEnd, got nil")
	}
	if err != models.ErrRCAMissingEndTime {
		t.Errorf("expected ErrRCAMissingEndTime, got: %v", err)
	}
}

// ---------------------------------------------------------------------------
// TestRCAValidate_EndBeforeStart
// ---------------------------------------------------------------------------

func TestRCAValidate_EndBeforeStart(t *testing.T) {
	rca := validRCA()
	// Swap start and end so end is before start
	rca.IncidentEnd = rca.IncidentStart.Add(-1 * time.Minute)

	err := rca.Validate()
	if err == nil {
		t.Fatal("expected error when IncidentEnd is before IncidentStart, got nil")
	}
	if err != models.ErrRCAEndBeforeStart {
		t.Errorf("expected ErrRCAEndBeforeStart, got: %v", err)
	}
}

// ---------------------------------------------------------------------------
// TestRCAValidate_EndEqualToStart
// Boundary: end == start means zero duration — should be rejected
// ---------------------------------------------------------------------------

func TestRCAValidate_EndEqualToStart(t *testing.T) {
	rca := validRCA()
	rca.IncidentEnd = rca.IncidentStart // exactly equal

	err := rca.Validate()
	if err == nil {
		t.Fatal("expected error when IncidentEnd equals IncidentStart, got nil")
	}
	if err != models.ErrRCAEndBeforeStart {
		t.Errorf("expected ErrRCAEndBeforeStart for equal times, got: %v", err)
	}
}

// ---------------------------------------------------------------------------
// TestRCAValidate_MissingRootCauseCategory
// ---------------------------------------------------------------------------

func TestRCAValidate_MissingRootCauseCategory(t *testing.T) {
	rca := validRCA()
	rca.RootCauseCategory = ""

	err := rca.Validate()
	if err == nil {
		t.Fatal("expected error for missing RootCauseCategory, got nil")
	}
	if err != models.ErrRCAMissingCategory {
		t.Errorf("expected ErrRCAMissingCategory, got: %v", err)
	}
}

// ---------------------------------------------------------------------------
// TestRCAValidate_AllRootCauseCategories
// Ensures every valid category is accepted
// ---------------------------------------------------------------------------

func TestRCAValidate_AllRootCauseCategories(t *testing.T) {
	categories := []models.RootCauseCategory{
		models.RCACategoryInfrastructure,
		models.RCACategoryApplication,
		models.RCACategoryNetwork,
		models.RCACategoryDatabase,
		models.RCACategoryThirdParty,
		models.RCACategoryHuman,
		models.RCACategoryUnknown,
	}

	for _, cat := range categories {
		t.Run(string(cat), func(t *testing.T) {
			rca := validRCA()
			rca.RootCauseCategory = cat
			if err := rca.Validate(); err != nil {
				t.Errorf("category %q should be valid, got error: %v", cat, err)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// TestRCAValidate_RootCauseDetailTooShort
// ---------------------------------------------------------------------------

func TestRCAValidate_RootCauseDetailTooShort(t *testing.T) {
	cases := []struct {
		name   string
		detail string
	}{
		{"empty", ""},
		{"one char", "x"},
		{"exactly 19 chars", strings.Repeat("x", 19)},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rca := validRCA()
			rca.RootCauseDetail = tc.detail

			err := rca.Validate()
			if err == nil {
				t.Fatalf("expected error for root_cause_detail %q (len=%d), got nil",
					tc.detail, len(tc.detail))
			}
			if err != models.ErrRCARootCauseTooShort {
				t.Errorf("expected ErrRCARootCauseTooShort, got: %v", err)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// TestRCAValidate_RootCauseDetailAtMinimum
// Boundary: exactly 20 characters should pass
// ---------------------------------------------------------------------------

func TestRCAValidate_RootCauseDetailAtMinimum(t *testing.T) {
	rca := validRCA()
	rca.RootCauseDetail = strings.Repeat("x", 20) // exactly 20

	if err := rca.Validate(); err != nil {
		t.Errorf("root_cause_detail of exactly 20 chars should pass, got: %v", err)
	}
}

// ---------------------------------------------------------------------------
// TestRCAValidate_FixAppliedTooShort
// ---------------------------------------------------------------------------

func TestRCAValidate_FixAppliedTooShort(t *testing.T) {
	cases := []struct {
		name string
		fix  string
	}{
		{"empty", ""},
		{"one char", "x"},
		{"exactly 9 chars", strings.Repeat("x", 9)},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rca := validRCA()
			rca.FixApplied = tc.fix

			err := rca.Validate()
			if err == nil {
				t.Fatalf("expected error for fix_applied %q (len=%d), got nil",
					tc.fix, len(tc.fix))
			}
			if err != models.ErrRCAFixTooShort {
				t.Errorf("expected ErrRCAFixTooShort, got: %v", err)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// TestRCAValidate_FixAppliedAtMinimum
// Boundary: exactly 10 characters should pass
// ---------------------------------------------------------------------------

func TestRCAValidate_FixAppliedAtMinimum(t *testing.T) {
	rca := validRCA()
	rca.FixApplied = strings.Repeat("x", 10) // exactly 10

	if err := rca.Validate(); err != nil {
		t.Errorf("fix_applied of exactly 10 chars should pass, got: %v", err)
	}
}

// ---------------------------------------------------------------------------
// TestRCAValidate_PreventionStepsTooShort
// ---------------------------------------------------------------------------

func TestRCAValidate_PreventionStepsTooShort(t *testing.T) {
	cases := []struct {
		name       string
		prevention string
	}{
		{"empty", ""},
		{"one char", "x"},
		{"exactly 9 chars", strings.Repeat("x", 9)},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rca := validRCA()
			rca.PreventionSteps = tc.prevention

			err := rca.Validate()
			if err == nil {
				t.Fatalf("expected error for prevention_steps %q (len=%d), got nil",
					tc.prevention, len(tc.prevention))
			}
			if err != models.ErrRCAPreventionTooShort {
				t.Errorf("expected ErrRCAPreventionTooShort, got: %v", err)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// TestRCAValidate_PreventionStepsAtMinimum
// Boundary: exactly 10 characters should pass
// ---------------------------------------------------------------------------

func TestRCAValidate_PreventionStepsAtMinimum(t *testing.T) {
	rca := validRCA()
	rca.PreventionSteps = strings.Repeat("x", 10) // exactly 10

	if err := rca.Validate(); err != nil {
		t.Errorf("prevention_steps of exactly 10 chars should pass, got: %v", err)
	}
}

// ---------------------------------------------------------------------------
// TestRCAValidate_ValidationOrder
// Ensures validation fails at the first missing field (not all at once)
// WorkItemID is checked before IncidentStart — verify ordering is consistent
// ---------------------------------------------------------------------------

func TestRCAValidate_ValidationOrder(t *testing.T) {
	// All fields missing — should fail on WorkItemID first
	rca := models.RCA{}

	err := rca.Validate()
	if err == nil {
		t.Fatal("expected error for completely empty RCA, got nil")
	}
	if err != models.ErrRCAMissingWorkItemID {
		t.Errorf("expected ErrRCAMissingWorkItemID as first error, got: %v", err)
	}
}

// ---------------------------------------------------------------------------
// TestRCAMTTRMinutes
// Verifies MTTR calculation is correct
// ---------------------------------------------------------------------------

func TestRCAMTTRMinutes(t *testing.T) {
	cases := []struct {
		name         string
		startOffset  time.Duration
		endOffset    time.Duration
		expectedMTTR float64
	}{
		{"30 minutes", -30 * time.Minute, 0, 30.0},
		{"90 minutes", -90 * time.Minute, 0, 90.0},
		{"1 minute", -1 * time.Minute, 0, 1.0},
		{"2.5 hours", -150 * time.Minute, 0, 150.0},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			now := time.Now().UTC()
			rca := models.RCA{
				IncidentStart: now.Add(tc.startOffset),
				IncidentEnd:   now.Add(tc.endOffset),
			}

			got := rca.MTTRMinutes()
			// Allow 1 second of floating point tolerance
			tolerance := 1.0 / 60.0
			diff := got - tc.expectedMTTR
			if diff < 0 {
				diff = -diff
			}
			if diff > tolerance {
				t.Errorf("MTTRMinutes() = %.4f, want %.4f (tolerance %.4f)",
					got, tc.expectedMTTR, tolerance)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// TestRCAValidate_LongValidInputs
// Ensures very long field values are accepted (no upper bound)
// ---------------------------------------------------------------------------

func TestRCAValidate_LongValidInputs(t *testing.T) {
	rca := validRCA()
	rca.RootCauseDetail = strings.Repeat("detail ", 100)   // 700 chars
	rca.FixApplied = strings.Repeat("fix step. ", 50)      // 500 chars
	rca.PreventionSteps = strings.Repeat("prevent. ", 50)  // 450 chars

	if err := rca.Validate(); err != nil {
		t.Errorf("long valid inputs should pass validation, got: %v", err)
	}
}
