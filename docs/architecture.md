# IMS — Architecture Deep Dive

## Why Go?

Go is the dominant language for infrastructure tooling in 2024-2026 (Kubernetes, Prometheus, Grafana, Terraform, Datadog Agent — all Go). Its goroutine model is a natural fit for the concurrency requirements here: a bounded channel buffer with 20 worker goroutines maps directly to the problem statement. Memory overhead per goroutine is ~2-8KB vs ~1MB for OS threads, making 10,000 concurrent in-flight signals practical.

---

## Ingestion Pipeline

### Rate Limiter

Token bucket per IP address. Each bucket starts full (200 tokens = burst capacity) and refills at 100 tokens/second (sustained rate). A background goroutine sweeps the bucket map every 5 minutes and evicts entries that haven't been used in 10 minutes, preventing unbounded memory growth under IP churn.

### Debounce — Two-Layer Design

The debounce layer has two levels of state:

1. **sync.Map (in-process, zero-allocation reads)** — checked first. If a `componentID` has an active entry, it returns immediately with no network hop. This is the hot path for the 99% case where a burst of signals arrives for the same component.

2. **Redis (durable, TTL-managed)** — checked on sync.Map miss. This handles the case where the backend restarts mid-window (the 10s TTL persists in Redis). It also handles multi-instance deployments where two backend pods might receive signals for the same component.

The Redis TTL is set to 15 seconds (5s longer than the 10s window) to account for clock skew between the first signal arrival and the Redis write.

### Bounded Channel — Backpressure Boundary

This is the most critical design decision. The channel separates two concerns with different throughput characteristics:

- **Producer (ingestion HTTP handler)**: Must respond in <10ms — driven by client SLA
- **Consumer (worker pool → databases)**: Throughput limited by DB write latency (~5-50ms)

Without the buffer, a DB slowdown would immediately stall HTTP handlers. With a 50,000-item buffer and 20 workers writing at 5ms each, the system can absorb 4,000 signals/sec of sustained write throughput while handling bursts of up to 50,000 queued signals before returning 429.

---

## Data Separation

| Store | What lives here | Why |
|---|---|---|
| **MongoDB** | Raw `Signal` documents — every inbound event verbatim | Schema-flexible (metadata varies per component type). Fast indexed reads by `work_item_id`. Natural fit for append-heavy audit log. |
| **PostgreSQL** | `WorkItem`, `RCA` tables — structured, relational, transactional | ACID guarantees for state transitions. Foreign key from RCA to WorkItem enforced at DB level. `mttr_minutes` computed and stored on close. |
| **TimescaleDB hypertable** | `signal_timeseries` — minute-bucket aggregates | Enables time-range queries (`signals per minute per component`) without scanning MongoDB. Continuous aggregate view pre-computes `signals_per_minute`. |
| **Redis** | Dashboard state cache (30s TTL), debounce windows (15s TTL), per-second signal counters | Eliminates Postgres queries on every UI refresh. Sub-millisecond reads. |

---

## Workflow Engine

### State Pattern Implementation

Each state is a singleton struct (registered in `stateRegistry`) that implements the `State` interface. The `Machine.Transition()` method:

1. Fetches the current WorkItem from Postgres
2. Calls `stateFor(wi.State).CanTransitionTo(toState)` — the state object decides
3. If moving to `CLOSED`, fetches the RCA and calls `rca.Validate()` — rejects if missing or incomplete
4. Calls `postgres.UpdateWorkItemState()` which sets the appropriate timestamp column
5. Invalidates the Redis dashboard cache

The `RCA.Validate()` method enforces minimum field lengths (20 chars for root cause, 10 for fix/prevention) in addition to presence checks. This mirrors what the frontend enforces client-side, creating defence-in-depth.

### MTTR Calculation

```
MTTR = rca.IncidentEnd − rca.IncidentStart (in minutes)
```

This is stored as `mttr_minutes DOUBLE PRECISION` on the `work_items` table on close. It reflects the actual incident duration as reported in the RCA, not the wall-clock time from signal arrival to close button — which gives engineering teams control over when they mark the start time (e.g. first customer impact, not first signal).

---

## Observability Stack

### Prometheus Metrics

All metrics registered at package init via `promauto`:

| Metric | Type | Description |
|---|---|---|
| `ims_signals_ingested_total` | Counter | Total signals accepted by queue |
| `ims_signals_dropped_total` | Counter | Total signals dropped (backpressure) |
| `ims_signals_per_second` | Gauge | Rolling 5s average from Redis buckets |
| `ims_active_incidents` | Gauge | OPEN + INVESTIGATING count |
| `ims_work_items_by_state` | GaugeVec | Count per state label |
| `ims_queue_fill_ratio` | Gauge | 0.0–1.0 channel fill fraction |
| `ims_websocket_clients` | Gauge | Connected WebSocket clients |
| `ims_http_request_duration_seconds` | HistogramVec | Per method+path+status |

### Grafana Dashboard

Auto-provisioned via `grafana/provisioning/`. The dashboard opens as the Grafana home page without any manual configuration. The pre-built JSON includes:

- Stat panels for key SLIs (signals/sec, active incidents, queue fill, WS clients)
- Time series for signal throughput and HTTP p95 latency
- Donut chart for Work Items by state
- Red time series for dropped signals (backpressure visibility)

---

## WebSocket Hub

The hub uses a single goroutine to manage the client map (`map[*websocket.Conn]bool`). This means the map itself never needs locking during the write path — only the `register`/`unregister` channels are buffered. When broadcasting, a `sync.RWMutex` allows concurrent reads (all clients write simultaneously) while blocking only on connect/disconnect events, which are rare.

The 30-second heartbeat detects stale connections. If a client's write fails during broadcast, the disconnect is queued (not processed inline) to avoid modifying the map during range iteration.

---

## Auto-Escalation

The escalator runs as a background goroutine on a 60-second ticker. It queries `ListActiveWorkItems()` (returns only OPEN + INVESTIGATING) and applies:

```
P2 + age >= 30min → P1
P1 + age >= 60min → P0
```

P0 is the ceiling — no further escalation. Each escalation invalidates the Redis dashboard cache and logs a structured warning that includes the age and both old/new severities. This is visible in the Grafana `Work Items by State` panel as severity distribution shifts.

---

## Security Architecture

- JWT secret injected via environment variable, not hardcoded
- bcrypt cost factor 10 for password hashing (demo users)
- Rate limiter prevents a single client from overwhelming ingestion
- Input validation (enum checks on component_type + severity) prevents garbage data from reaching the DB layer
- Non-root containers (UID 1000) in both Dockerfile and Helm chart
- Helm chart sets `readOnlyRootFilesystem: true` and drops all Linux capabilities
- CORS headers restrict origins (set to `*` for local dev — should be tightened in production via env var)
