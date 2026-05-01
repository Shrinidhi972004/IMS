-- Migration: 001_init_schema.sql
-- Run on startup via the backend's migrate step

-- Enable TimescaleDB extension for timeseries aggregations
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- ---------------------------------------------------------------------------
-- work_items — source of truth for all incidents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_items (
    id              TEXT PRIMARY KEY,
    component_id    TEXT        NOT NULL,
    component_type  TEXT        NOT NULL,
    title           TEXT        NOT NULL,
    severity        TEXT        NOT NULL CHECK (severity IN ('P0', 'P1', 'P2')),
    state           TEXT        NOT NULL DEFAULT 'OPEN'
                                CHECK (state IN ('OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED')),
    signal_count    INTEGER     NOT NULL DEFAULT 1,
    assigned_to     TEXT        NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ,
    closed_at       TIMESTAMPTZ,
    mttr_minutes    DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS idx_work_items_state    ON work_items (state);
CREATE INDEX IF NOT EXISTS idx_work_items_severity ON work_items (severity);
CREATE INDEX IF NOT EXISTS idx_work_items_component ON work_items (component_id);
CREATE INDEX IF NOT EXISTS idx_work_items_created  ON work_items (created_at DESC);

-- ---------------------------------------------------------------------------
-- rcas — root cause analysis records (1:1 with work_items)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rcas (
    id                   TEXT PRIMARY KEY,
    work_item_id         TEXT        NOT NULL UNIQUE REFERENCES work_items(id) ON DELETE CASCADE,
    incident_start       TIMESTAMPTZ NOT NULL,
    incident_end         TIMESTAMPTZ NOT NULL,
    root_cause_category  TEXT        NOT NULL,
    root_cause_detail    TEXT        NOT NULL,
    fix_applied          TEXT        NOT NULL,
    prevention_steps     TEXT        NOT NULL,
    submitted_by         TEXT        NOT NULL DEFAULT '',
    submitted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT rca_end_after_start CHECK (incident_end > incident_start)
);

CREATE INDEX IF NOT EXISTS idx_rcas_work_item ON rcas (work_item_id);

-- ---------------------------------------------------------------------------
-- signal_timeseries — lightweight timeseries for aggregations (TimescaleDB)
-- Only stores counts per component+severity per minute bucket, not raw payloads.
-- Raw payloads live in MongoDB.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS signal_timeseries (
    bucket          TIMESTAMPTZ NOT NULL,
    component_id    TEXT        NOT NULL,
    component_type  TEXT        NOT NULL,
    severity        TEXT        NOT NULL,
    signal_count    INTEGER     NOT NULL DEFAULT 1,
    PRIMARY KEY (bucket, component_id, severity)
);

-- Convert to a TimescaleDB hypertable partitioned by time
SELECT create_hypertable('signal_timeseries', 'bucket', if_not_exists => TRUE);

-- Continuous aggregate view: signals per minute
CREATE MATERIALIZED VIEW IF NOT EXISTS signals_per_minute
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 minute', bucket) AS minute,
    component_id,
    severity,
    SUM(signal_count) AS total
FROM signal_timeseries
GROUP BY minute, component_id, severity
WITH NO DATA;
