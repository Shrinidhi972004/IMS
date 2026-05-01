package store

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
	"github.com/shrinidhi972004/ims/internal/models"
)

// PostgresStore handles all transactional WorkItem and RCA persistence.
type PostgresStore struct {
	pool *pgxpool.Pool
}

// NewPostgresStore creates a connection pool with exponential backoff retry.
func NewPostgresStore(ctx context.Context, dsn string) (*PostgresStore, error) {
	var pool *pgxpool.Pool
	var err error

	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("postgres: parse config: %w", err)
	}
	cfg.MaxConns = 20
	cfg.MinConns = 2
	cfg.MaxConnLifetime = 30 * time.Minute
	cfg.MaxConnIdleTime = 5 * time.Minute

	// Retry with exponential backoff — resilience requirement
	for attempt := 1; attempt <= 5; attempt++ {
		pool, err = pgxpool.NewWithConfig(ctx, cfg)
		if err == nil {
			if pingErr := pool.Ping(ctx); pingErr == nil {
				log.Info().Str("component", "postgres").Msg("connected successfully")
				return &PostgresStore{pool: pool}, nil
			}
		}
		wait := time.Duration(math.Pow(2, float64(attempt))) * time.Second
		log.Warn().
			Str("component", "postgres").
			Int("attempt", attempt).
			Dur("retry_in", wait).
			Msg("connection failed, retrying")
		time.Sleep(wait)
	}
	return nil, fmt.Errorf("postgres: failed to connect after 5 attempts: %w", err)
}

// Close shuts down the connection pool gracefully.
func (s *PostgresStore) Close() {
	s.pool.Close()
}

// Pool exposes the underlying pgxpool for advanced queries (e.g. timeseries upserts).
func (s *PostgresStore) Pool() *pgxpool.Pool {
	return s.pool
}

// ---------------------------------------------------------------------------
// WorkItem operations
// ---------------------------------------------------------------------------

// CreateWorkItem inserts a new WorkItem transactionally.
func (s *PostgresStore) CreateWorkItem(ctx context.Context, wi *models.WorkItem) error {
	return s.withRetry(ctx, "CreateWorkItem", func(ctx context.Context) error {
		_, err := s.pool.Exec(ctx, `
			INSERT INTO work_items (
				id, component_id, component_type, title, severity,
				state, signal_count, assigned_to, created_at, updated_at
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
			wi.ID, wi.ComponentID, wi.ComponentType, wi.Title, wi.Severity,
			wi.State, wi.SignalCount, wi.AssignedTo, wi.CreatedAt, wi.UpdatedAt,
		)
		return err
	})
}

// GetWorkItem fetches a WorkItem by ID.
func (s *PostgresStore) GetWorkItem(ctx context.Context, id string) (*models.WorkItem, error) {
	var wi models.WorkItem
	err := s.pool.QueryRow(ctx, `
		SELECT id, component_id, component_type, title, severity,
		       state, signal_count, assigned_to, created_at, updated_at,
		       resolved_at, closed_at, mttr_minutes
		FROM work_items WHERE id = $1`, id).
		Scan(
			&wi.ID, &wi.ComponentID, &wi.ComponentType, &wi.Title, &wi.Severity,
			&wi.State, &wi.SignalCount, &wi.AssignedTo, &wi.CreatedAt, &wi.UpdatedAt,
			&wi.ResolvedAt, &wi.ClosedAt, &wi.MTTR,
		)
	if err == pgx.ErrNoRows {
		return nil, models.ErrWorkItemNotFound
	}
	return &wi, err
}

// UpdateWorkItemState transitions state and sets timestamps appropriately.
// This is called by the workflow state machine.
func (s *PostgresStore) UpdateWorkItemState(ctx context.Context, id string, state models.WorkItemState, mttr *float64) error {
	return s.withRetry(ctx, "UpdateWorkItemState", func(ctx context.Context) error {
		now := time.Now().UTC()
		switch state {
		case models.StateResolved:
			_, err := s.pool.Exec(ctx, `
				UPDATE work_items SET state=$1, resolved_at=$2, updated_at=$3 WHERE id=$4`,
				state, now, now, id)
			return err
		case models.StateClosed:
			_, err := s.pool.Exec(ctx, `
				UPDATE work_items SET state=$1, closed_at=$2, updated_at=$3, mttr_minutes=$4 WHERE id=$5`,
				state, now, now, mttr, id)
			return err
		default:
			_, err := s.pool.Exec(ctx, `
				UPDATE work_items SET state=$1, updated_at=$2 WHERE id=$3`,
				state, now, id)
			return err
		}
	})
}


// UpdateWorkItemSeverity updates the severity of a WorkItem (used by auto-escalation).
func (s *PostgresStore) UpdateWorkItemSeverity(ctx context.Context, id string, severity models.Severity) error {
	return s.withRetry(ctx, "UpdateWorkItemSeverity", func(ctx context.Context) error {
		_, err := s.pool.Exec(ctx, `
			UPDATE work_items SET severity=$1, updated_at=$2 WHERE id=$3`,
			severity, time.Now().UTC(), id)
		return err
	})
}
// IncrementSignalCount atomically increments the signal counter for a WorkItem.
func (s *PostgresStore) IncrementSignalCount(ctx context.Context, workItemID string) error {
	return s.withRetry(ctx, "IncrementSignalCount", func(ctx context.Context) error {
		_, err := s.pool.Exec(ctx, `
			UPDATE work_items SET signal_count = signal_count + 1, updated_at = $1 WHERE id = $2`,
			time.Now().UTC(), workItemID)
		return err
	})
}

// ListWorkItems returns all WorkItems ordered by severity then created_at desc.
func (s *PostgresStore) ListWorkItems(ctx context.Context) ([]*models.WorkItem, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, component_id, component_type, title, severity,
		       state, signal_count, assigned_to, created_at, updated_at,
		       resolved_at, closed_at, mttr_minutes
		FROM work_items
		ORDER BY
			CASE severity WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 END ASC,
			created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []*models.WorkItem
	for rows.Next() {
		var wi models.WorkItem
		if err := rows.Scan(
			&wi.ID, &wi.ComponentID, &wi.ComponentType, &wi.Title, &wi.Severity,
			&wi.State, &wi.SignalCount, &wi.AssignedTo, &wi.CreatedAt, &wi.UpdatedAt,
			&wi.ResolvedAt, &wi.ClosedAt, &wi.MTTR,
		); err != nil {
			return nil, err
		}
		items = append(items, &wi)
	}
	return items, rows.Err()
}

// ListActiveWorkItems returns OPEN + INVESTIGATING items for the dashboard.
func (s *PostgresStore) ListActiveWorkItems(ctx context.Context) ([]*models.WorkItem, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, component_id, component_type, title, severity,
		       state, signal_count, assigned_to, created_at, updated_at,
		       resolved_at, closed_at, mttr_minutes
		FROM work_items
		WHERE state IN ('OPEN', 'INVESTIGATING')
		ORDER BY
			CASE severity WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 END ASC,
			created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []*models.WorkItem
	for rows.Next() {
		var wi models.WorkItem
		if err := rows.Scan(
			&wi.ID, &wi.ComponentID, &wi.ComponentType, &wi.Title, &wi.Severity,
			&wi.State, &wi.SignalCount, &wi.AssignedTo, &wi.CreatedAt, &wi.UpdatedAt,
			&wi.ResolvedAt, &wi.ClosedAt, &wi.MTTR,
		); err != nil {
			return nil, err
		}
		items = append(items, &wi)
	}
	return items, rows.Err()
}

// GetDashboardCounts returns counts grouped by state.
func (s *PostgresStore) GetDashboardCounts(ctx context.Context) (open, investigating, resolved, closed int, err error) {
	rows, err := s.pool.Query(ctx, `
		SELECT state, COUNT(*) FROM work_items GROUP BY state`)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var state models.WorkItemState
		var count int
		if err = rows.Scan(&state, &count); err != nil {
			return
		}
		switch state {
		case models.StateOpen:
			open = count
		case models.StateInvestigating:
			investigating = count
		case models.StateResolved:
			resolved = count
		case models.StateClosed:
			closed = count
		}
	}
	return
}

// ---------------------------------------------------------------------------
// RCA operations
// ---------------------------------------------------------------------------

// CreateRCA inserts an RCA record transactionally.
func (s *PostgresStore) CreateRCA(ctx context.Context, rca *models.RCA) error {
	return s.withRetry(ctx, "CreateRCA", func(ctx context.Context) error {
		_, err := s.pool.Exec(ctx, `
			INSERT INTO rcas (
				id, work_item_id, incident_start, incident_end,
				root_cause_category, root_cause_detail,
				fix_applied, prevention_steps, submitted_by, submitted_at
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
			rca.ID, rca.WorkItemID, rca.IncidentStart, rca.IncidentEnd,
			rca.RootCauseCategory, rca.RootCauseDetail,
			rca.FixApplied, rca.PreventionSteps, rca.SubmittedBy, rca.SubmittedAt,
		)
		return err
	})
}

// GetRCAByWorkItemID fetches the RCA for a given WorkItem.
func (s *PostgresStore) GetRCAByWorkItemID(ctx context.Context, workItemID string) (*models.RCA, error) {
	var rca models.RCA
	err := s.pool.QueryRow(ctx, `
		SELECT id, work_item_id, incident_start, incident_end,
		       root_cause_category, root_cause_detail,
		       fix_applied, prevention_steps, submitted_by, submitted_at
		FROM rcas WHERE work_item_id = $1`, workItemID).
		Scan(
			&rca.ID, &rca.WorkItemID, &rca.IncidentStart, &rca.IncidentEnd,
			&rca.RootCauseCategory, &rca.RootCauseDetail,
			&rca.FixApplied, &rca.PreventionSteps, &rca.SubmittedBy, &rca.SubmittedAt,
		)
	if err == pgx.ErrNoRows {
		return nil, nil // no RCA yet is a valid state
	}
	return &rca, err
}

// ---------------------------------------------------------------------------
// Internal retry helper — exponential backoff for transient DB errors
// ---------------------------------------------------------------------------

func (s *PostgresStore) withRetry(ctx context.Context, op string, fn func(context.Context) error) error {
	var err error
	for attempt := 1; attempt <= 3; attempt++ {
		err = fn(ctx)
		if err == nil {
			return nil
		}
		wait := time.Duration(math.Pow(2, float64(attempt))) * 100 * time.Millisecond
		log.Warn().
			Str("component", "postgres").
			Str("operation", op).
			Int("attempt", attempt).
			Err(err).
			Dur("retry_in", wait).
			Msg("db operation failed, retrying")
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(wait):
		}
	}
	return fmt.Errorf("postgres: %s failed after 3 attempts: %w", op, err)
}
