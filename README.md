# ◈ IMS — Incident Management System

> A production-grade, mission-critical incident management platform built for SRE teams.
> Ingests up to **10,000 signals/sec**, debounces them into structured Work Items, alerts the right responders, and tracks incidents through a mandatory RCA workflow.

[![CI](https://github.com/Shrinidhi972004/ims/actions/workflows/ci.yml/badge.svg)](https://github.com/Shrinidhi972004/ims/actions)

---

## Table of Contents

1. [Architecture](#architecture)
2. [Tech Stack](#tech-stack)
3. [Quick Start (Docker Compose)](#quick-start)
4. [How Backpressure Works](#backpressure)
5. [Design Patterns](#design-patterns)
6. [API Reference](#api-reference)
7. [Bonus Features](#bonus-features)
8. [Helm (Kubernetes)](#helm)
9. [CI/CD](#cicd)
10. [Simulate a Failure](#simulate)
11. [Security](#security)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         INGESTION LAYER                                 │
│                                                                         │
│  POST /api/v1/signals ──► Rate Limiter (token bucket, 100 req/s/IP)    │
│                               │                                         │
│                               ▼                                         │
│                    Debounce Layer (sync.Map + Redis)                    │
│                    10s window per component_id                          │
│                    100 signals → 1 Work Item                            │
│                               │                                         │
│                               ▼                                         │
│              ┌────────────────────────────────┐                        │
│              │  In-Memory Channel Buffer       │                        │
│              │  Capacity: 50,000 signals       │◄── BACKPRESSURE       │
│              │  Non-blocking TryEnqueue        │    BOUNDARY            │
│              │  Full → HTTP 429               │                        │
│              └──────────────┬─────────────────┘                        │
└─────────────────────────────┼───────────────────────────────────────────┘
                              │
                              ▼ (20 goroutine workers)
┌─────────────────────────────────────────────────────────────────────────┐
│                         PERSISTENCE LAYER                               │
│                                                                         │
│    ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐   │
│    │   MongoDB    │    │  PostgreSQL  │    │  TimescaleDB         │   │
│    │  (raw audit) │    │  (WorkItems  │    │  (signal_timeseries  │   │
│    │  data lake   │    │   RCA, MTTR) │    │   hypertable)        │   │
│    └──────────────┘    └──────────────┘    └──────────────────────┘   │
│                               │                                         │
│                         ┌─────▼──────┐                                 │
│                         │   Redis    │                                  │
│                         │  hot-path  │                                  │
│                         │  cache     │                                  │
│                         └─────┬──────┘                                 │
└───────────────────────────────┼─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         WORKFLOW ENGINE                                 │
│                                                                         │
│   State Machine                   Alert Strategy (Strategy Pattern)     │
│   ───────────                     ──────────────────────────────────    │
│   OPEN                            RDBMS / QUEUE  → P0 → PagerDuty      │
│    └─► INVESTIGATING              API / NOSQL    → P1 → Slack           │
│          └─► RESOLVED             CACHE          → P2 → Email           │
│                └─► CLOSED*                                              │
│                                                                         │
│   *CLOSED requires complete RCA (validated, all fields present)         │
│   *MTTR auto-calculated: rca.incident_end − rca.incident_start         │
│                                                                         │
│   Auto-Escalator (background goroutine, 60s interval)                  │
│   P2 → P1 after 30min INVESTIGATING                                     │
│   P1 → P0 after 60min INVESTIGATING                                     │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            API + FRONTEND                               │
│                                                                         │
│   REST API (Fiber/Go)           React Frontend (Vite + Nginx)          │
│   ────────────────              ──────────────────────────             │
│   POST /api/v1/signals          Login (JWT)                            │
│   GET  /api/v1/workitems        Live Feed (WebSocket)                  │
│   GET  /api/v1/workitems/:id    Incident Detail + Raw Signals          │
│   PATCH .../transition          RCA Form (datetime + dropdown)         │
│   POST .../rca                                                         │
│   GET  /ws/incidents ─────────► WebSocket Hub (broadcast)             │
│   GET  /health                                                         │
│   GET  /metrics ──────────────► Prometheus ──► Grafana NOC Dashboard  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Backend | **Go 1.22 + Fiber** | Native goroutines for 10k signals/sec; low memory overhead |
| In-memory buffer | **Go channels** | Zero-dependency, native backpressure |
| Source of truth | **PostgreSQL + TimescaleDB** | ACID transactions for WorkItems/RCA; hypertable for timeseries |
| Audit log | **MongoDB** | Schema-flexible raw signal storage; fast indexed reads |
| Cache | **Redis** | Sub-millisecond dashboard reads; debounce TTL tracking |
| Frontend | **React 18 + Vite** | Fast dev, small bundle, modern ecosystem |
| Observability | **Prometheus + Grafana** | Industry-standard; pre-wired NOC dashboard |
| Container | **Docker Compose + Helm** | Local dev via Compose; production via Helm on k8s |
| CI/CD | **GitHub Actions + GHCR** | Build, test, push on every merge to main |

---

## Quick Start

### Prerequisites

- Docker >= 24
- Docker Compose >= 2.24
- 4GB RAM free (all 7 services)

### Run

```bash
git clone https://github.com/Shrinidhi972004/ims.git
cd ims

docker compose up --build
```

That's it. All services start in dependency order.

### Service URLs

| Service | URL | Credentials |
|---|---|---|
| **Frontend** | http://localhost:3000 | admin / admin123 |
| **Backend API** | http://localhost:8080 | — |
| **Grafana** | http://localhost:3001 | admin / admin |
| **Prometheus** | http://localhost:9090 | — |
| **Health** | http://localhost:8080/health | — |
| **Metrics** | http://localhost:8080/metrics | — |

### Get a JWT token

```bash
curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' | jq -r .token
```

---

## Backpressure

This is the most important resilience property of the system. Here is exactly how it works:

### The Problem

The persistence layer (Postgres + MongoDB + Redis) has finite throughput. At 10,000 signals/sec, a naive system that writes synchronously on the HTTP handler thread will either:
- Block the handler (destroying latency)
- OOM the process (unbounded in-memory accumulation)
- Cascade-fail the databases (thundering herd)

### Our Solution: Bounded Channel + Non-blocking Enqueue

```
HTTP Handler
    │
    ├── Rate limiter check (100 req/s per IP)
    │
    ├── Debounce resolution (Redis + sync.Map)
    │
    └── TryEnqueue() — NON-BLOCKING
             │
             ├── Queue has space → signal accepted → HTTP 202
             │
             └── Queue is FULL → signal DROPPED → HTTP 429
                     (caller must retry — system stays alive)
```

The channel is **bounded at 50,000 signals**. The `TryEnqueue` call uses Go's `select/default` pattern — it never blocks:

```go
select {
case q.ch <- signal:
    return true   // accepted
default:
    return false  // full — 429 to caller
}
```

**20 worker goroutines** consume from the channel concurrently and fan out writes to all three stores. If a store is slow, the channel fills up. If it fills past **80%**, a structured warning is logged. If it fills completely, the ingestion API returns 429 until workers drain it.

The system **never crashes** due to a slow persistence layer. The persistence layer is the thing that yields — not the ingestion layer.

### Rate Limiting

Each IP gets a **token bucket**: 200 burst capacity, 100 sustained req/sec. Every response includes:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1714567890
```

### Throughput Metrics

Every 5 seconds the worker pool logs to console:

```json
{"level":"info","component":"throughput","signals_last_5s":4821,
 "signals_per_sec":964.2,"queue_fill_pct":12.4,"total_dropped":0}
```

---

## Design Patterns

### State Pattern — WorkItem Lifecycle

Each state is a concrete struct implementing the `State` interface. The machine never switches state directly — it asks the current state if the transition is valid:

```
OPEN → INVESTIGATING → RESOLVED → CLOSED*
```

`CLOSED` is a terminal state. No transitions out. The `closedState.CanTransitionTo()` always returns false.

*Attempting to CLOSE without a valid RCA returns HTTP 422 Unprocessable Entity.*

### Strategy Pattern — Alerting

The `AlertStrategy` interface has three concrete implementations selected at runtime based on component type:

| Component | Default Severity | Strategy | Channel |
|---|---|---|---|
| RDBMS, QUEUE | P0 | P0Strategy | PagerDuty |
| API, NOSQL, MCP_HOST | P1 | P1Strategy | Slack |
| CACHE | P2 | P2Strategy | Email |

Adding a new component type requires only a single line in `componentSeverityMap`. No existing code changes.

---

## API Reference

All `/api/v1/*` routes require `Authorization: Bearer <token>`.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/auth/login` | Get JWT token |
| `POST` | `/api/v1/signals` | Ingest a signal |
| `POST` | `/api/v1/signals/batch` | Ingest up to 100 signals |
| `GET` | `/api/v1/workitems` | List all work items |
| `GET` | `/api/v1/workitems/:id` | Get work item + signals + RCA |
| `PATCH` | `/api/v1/workitems/:id/transition` | Transition state |
| `POST` | `/api/v1/workitems/:id/rca` | Submit RCA |
| `GET` | `/api/v1/workitems/:id/rca` | Get RCA |
| `GET` | `/api/v1/dashboard` | Dashboard state (cache-first) |
| `GET` | `/ws/incidents` | WebSocket live feed |
| `GET` | `/health` | Health check |
| `GET` | `/metrics` | Prometheus metrics |

### Ingest a signal

```bash
curl -X POST http://localhost:8080/api/v1/signals \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "component_id":   "RDBMS_PRIMARY",
    "component_type": "RDBMS",
    "severity":       "P0",
    "message":        "Connection pool exhausted",
    "metadata":       {"host": "db-01.internal"}
  }'
```

### Transition a work item

```bash
curl -X PATCH http://localhost:8080/api/v1/workitems/<id>/transition \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{"to_state": "INVESTIGATING"}'
```

### Submit RCA

```bash
curl -X POST http://localhost:8080/api/v1/workitems/<id>/rca \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "incident_start":       "2024-05-01T10:00:00Z",
    "incident_end":         "2024-05-01T11:30:00Z",
    "root_cause_category":  "DATABASE",
    "root_cause_detail":    "Connection pool limit of 500 was reached due to a slow query introduced in deploy v2.4.1 that held connections open for 45s instead of releasing immediately after use.",
    "fix_applied":          "Rolled back deploy v2.4.1. Increased max_connections to 750 temporarily.",
    "prevention_steps":     "Add connection timeout to all ORM queries. Add alerting at 80% pool utilization. Code review checklist item for connection handling."
  }'
```

---

## Bonus Features

| Feature | Description |
|---|---|
| **WebSocket Live Feed** | All connected clients receive real-time incident updates via WebSocket hub |
| **Prometheus + Grafana** | Pre-built NOC dashboard with 9 panels — opens automatically at localhost:3001 |
| **JWT Authentication** | HS256-signed tokens, 24h expiry, protects all API routes |
| **Auto-Escalation** | Background goroutine: P2→P1 after 30min, P1→P0 after 60min in INVESTIGATING |
| **Rate Limit Headers** | `X-RateLimit-Limit/Remaining/Reset` on every ingestion response |
| **zerolog** | Structured JSON logging throughout — every log line has level, component, trace context |
| **Helm Chart** | Production k8s packaging with HPA, PDB, pod anti-affinity, security contexts |
| **GitHub Actions CI** | go test + go vet on every PR; Docker images pushed to GHCR on merge to main |
| **TimescaleDB** | Timeseries hypertable + continuous aggregate for signals/minute view |
| **Batch Ingestion** | `POST /api/v1/signals/batch` accepts up to 100 signals per request |

---

## Helm

Deploy to any Kubernetes cluster:

```bash
# Install with defaults
helm install ims ./helm/ims

# Override values
helm install ims ./helm/ims \
  --set jwt.secret="your-secret-here" \
  --set replicaCount=3 \
  --set backend.autoscaling.maxReplicas=20

# Upgrade
helm upgrade ims ./helm/ims --set image.backend.tag=abc1234
```

The chart includes:
- HPA (2–10 replicas, scales on CPU)
- PodDisruptionBudget (minAvailable: 1)
- Pod anti-affinity across nodes
- Non-root security context, readOnlyRootFilesystem, drop ALL capabilities
- Liveness + readiness probes

---

## CI/CD

GitHub Actions pipeline (`.github/workflows/ci.yml`):

```
Push to main
    │
    ├── Job 1: test-backend
    │     ├── go mod download
    │     ├── go test -race ./...
    │     └── go vet ./...
    │
    └── Job 2: build-push (requires test-backend success)
          ├── docker build backend → ghcr.io/<owner>/ims-backend:<sha>
          └── docker build frontend → ghcr.io/<owner>/ims-frontend:<sha>
```

Images are tagged with: git SHA (immutable), branch name, and `latest` on main.

---

## Simulate a Failure

```bash
# Run the full simulation (auto-authenticates)
./scripts/simulate_failure.sh http://localhost:8080

# Or with an existing token
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' | jq -r .token)

./scripts/simulate_failure.sh http://localhost:8080 $TOKEN
```

The script fires:
- **150 signals** for `RDBMS_PRIMARY` in 8 seconds → **1 P0 WorkItem** + PagerDuty alert
- **50 signals** for `MCP_HOST_02` in 3 seconds → **1 P1 WorkItem** + Slack alert
- **30 signals** for `CACHE_CLUSTER_01` → **1 P2 WorkItem** + Email alert

230 signals → 3 Work Items. Debounce working.

---

## Security

- **JWT (HS256)** — all API routes protected, 24h token expiry
- **bcrypt** password hashing for demo users
- **Non-root containers** — both backend and frontend run as unprivileged users
- **Rate limiting** — 100 req/s per IP prevents ingestion abuse
- **Input validation** — component type and severity enums validated before queue entry
- **No secrets in code** — JWT_SECRET injected via environment variable (Helm Secret in k8s)
- **CORS** — configurable allowed origins (defaults to `*` for local dev — tighten in production)
- **ReadOnlyRootFilesystem** — backend container cannot write to its own filesystem (Helm only)

---

## Repository Structure

```
ims/
├── backend/
│   ├── cmd/server/main.go          # Entrypoint, graceful shutdown
│   ├── internal/
│   │   ├── models/                 # Domain structs + errors
│   │   ├── store/                  # Postgres, Mongo, Redis clients
│   │   ├── queue/                  # Bounded channel buffer
│   │   ├── ingestion/              # HTTP handler, rate limiter, debounce
│   │   ├── worker/                 # Goroutine pool, throughput logger
│   │   ├── workflow/               # State machine, escalator
│   │   ├── alerting/               # Strategy pattern (P0/P1/P2)
│   │   └── api/                    # REST handlers, WebSocket hub, auth
│   ├── migrations/                 # PostgreSQL schema + TimescaleDB
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/             # TopBar, LiveFeed
│   │   ├── pages/                  # LoginPage, IncidentDetail, RCAForm
│   │   ├── hooks/                  # useWebSocket
│   │   └── lib/                    # API client
│   ├── nginx.conf
│   └── Dockerfile
├── helm/ims/                       # Production Kubernetes chart
├── grafana/                        # Pre-provisioned NOC dashboard
├── scripts/
│   ├── simulate_failure.sh         # End-to-end failure simulation
│   └── sample_events.json          # Sample signal payloads
├── prometheus.yml
├── docker-compose.yml
└── docs/
    ├── architecture.md
    ├── prompts.md
    └── spec.md
```
