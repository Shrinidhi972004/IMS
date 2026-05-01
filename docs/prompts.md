# Prompts, Specs & Plans — IMS Assignment

> This document fulfils the submission requirement:
> *"All markdowns and prompts used to create this repository should be checked in."*

---

## How AI Was Used

This project was built using Claude (Anthropic) as an AI pair programmer across a structured, phase-by-phase build process. The AI was used as a force multiplier — not as a replacement for engineering judgment.

**What AI generated:**
- Boilerplate Go structs and method signatures
- SQL migration DDL
- Docker Compose service wiring
- Helm chart YAML templates
- React component scaffolding and CSS

**What I decided (engineering judgment):**
- Tech stack selection (Go over Python/Node for concurrency model fit)
- Two-layer debounce design (sync.Map hot path + Redis durable backing)
- Bounded channel as the backpressure boundary (not a mutex-protected queue)
- Data separation rationale (MongoDB for audit log, Postgres for transactional WorkItems, Redis for hot-path)
- State pattern vs. simple if/else for the workflow engine
- Strategy pattern for alerting (allows new component types without modifying dispatch logic)
- TimescaleDB continuous aggregate for timeseries instead of a separate InfluxDB service
- Auto-escalation as a bonus feature (SLO-driven, not in the spec)
- NOC terminal aesthetic for the frontend (industrial, not generic SaaS)

**What I debugged and fixed manually:**
- sync.Map concurrent read/write pattern in the debouncer
- Redis TTL strategy (15s > 10s window to handle clock skew)
- WebSocket hub map modification during range iteration (queued disconnect fix)
- Nginx WebSocket upgrade headers (proxy_read_timeout for long-lived connections)
- TimescaleDB hypertable creation idempotency (`if_not_exists => TRUE`)

---

## Planning Prompts (summarised)

### Initial Architecture Discussion

> *"This is the assignment [pasted PDF]. Tech stack: Go backend, React frontend, PostgreSQL + MongoDB + Redis + TimescaleDB. Plan the full architecture before writing any code."*

AI response: Full tech stack table, data flow diagram, module build order, design pattern mapping.

### Bonus Feature Selection

> *"What extra bonus points are we doing to get extra marks? Also, no CI/CD Helm etc.?"*

Discussion led to: WebSocket live feed, Prometheus + Grafana (with pre-built dashboard), JWT auth, zerolog, severity auto-escalation, rate limit headers, Helm chart, GitHub Actions CI, simulate failure script, prompts.md.

### Phase-by-Phase Build

Each phase was a separate prompt:

```
"go for phase 1"  → models/ + store/ (Postgres, Mongo, Redis)
"go for phase 2"  → queue/ + ingestion/ + worker/
"go for phase 3"  → workflow/ (state machine) + alerting/ (strategy pattern)
"go for phase 4"  → api/ (REST, WebSocket, JWT, health, Prometheus)
"go"              → frontend (React + Vite + CSS)
"go"              → Docker Compose + Prometheus + Grafana + Helm + CI
"go"              → README + docs/
```

All complete files were generated (not partial diffs) and reviewed before proceeding to the next phase.

---

## Key Design Decisions I Made (Not AI)

### 1. Bounded Channel over Ring Buffer

A ring buffer would silently overwrite old signals. A bounded channel with 429-on-full is the correct SRE choice — the caller knows their signal was not processed and can retry or alert. Silent data loss is worse than an explicit error.

### 2. Two-Layer Debounce

Redis alone would add ~1ms latency to every signal (network hop). sync.Map alone would lose debounce state on restart. The two-layer design gives both: zero-latency hot path and crash-safe state persistence.

### 3. MTTR from RCA Timestamps, Not Wall Clock

Using `rca.incident_end - rca.incident_start` rather than `work_item.closed_at - work_item.created_at` gives engineering teams control over what they define as the incident window. A signal might arrive 30 seconds before actual customer impact. The RCA author decides the correct start time.

### 4. State Pattern as Concrete Structs, Not Enums + Switch

A switch statement on state would require modifying the switch every time a new state is added. The State pattern localises each state's rules to its own struct. Adding a new state (e.g. `ESCALATED`) only requires implementing the interface and registering in the registry.

### 5. Strategy Pattern Registered Map, Not Factory

The dispatcher uses a `map[Severity]AlertStrategy` registered at package init. This means swapping a P1 strategy (e.g. from Slack to PagerDuty) is a single-line change in the registry. No factory method, no type switch, no modification to dispatch logic.

---

## Spec Reference

Original assignment specification is stored at: `docs/spec.md`
