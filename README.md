# IMS — Incident Management System

> **Zeotap Infrastructure / SRE Intern Assignment**
> Built by Shrinidhi | [GitHub Repository](https://github.com/Shrinidhi972004/ims)

---

## Quick Navigation

- [Deployment 1 — Docker Compose (Local)](#deployment-1--docker-compose-local)
- [Deployment 2 — Production on AWS EKS (DevOps/SRE/GitOps)](#deployment-2--production-on-aws-eks-devopssregitops)

---

## Overview

IMS is a production-grade **Incident Management System** designed to monitor a complex distributed stack — APIs, MCP Hosts, Distributed Caches, Async Queues, RDBMS, and NoSQL stores — and manage failure mediation workflows end to end.

The system ingests high-volume signals, debounces them intelligently, processes them asynchronously, alerts the right responders, and provides a workflow-driven UI to track every incident from `OPEN` to `CLOSED` with a mandatory Root Cause Analysis.

---

## Requirements Coverage

| Requirement | Implementation |
|---|---|
| High-throughput signal ingestion | HTTP POST `/api/v1/signals` + batch endpoint |
| Handle bursts up to 10,000 signals/sec | Bounded channel (50k cap), 20 goroutine workers, non-blocking TryEnqueue |
| System cannot crash if persistence is slow | 429 backpressure — queue full returns error, never blocks |
| Debounce: 100 signals → 1 WorkItem | `sync.Map` (hot path) + Redis (durable), 10s window |
| All signals linked to WorkItem in NoSQL | MongoDB audit log with WorkItem reference |
| Raw signal audit log (Data Lake) | MongoDB — all raw payloads stored |
| Structured WorkItems + RCA (Source of Truth) | PostgreSQL with ACID transactions |
| Real-time dashboard cache (Hot Path) | Redis with 3s TTL |
| Timeseries aggregations | TimescaleDB hypertable + continuous aggregate |
| Alerting Strategy Pattern | P0Strategy (PagerDuty), P1Strategy (Slack), P2Strategy (Email) |
| State Pattern: OPEN→INVESTIGATING→RESOLVED→CLOSED | `workflow.Machine` with 4 concrete state structs |
| Async Processing | Goroutine pool with fan-out to all stores |
| Mandatory RCA before CLOSED | `Machine.Transition()` rejects CLOSED without valid RCA |
| MTTR Calculation | Calculated from RCA start/end timestamps |
| Live Feed sorted by severity | Dashboard + Incidents page, P0 first |
| Incident Detail with raw signals | MongoDB signals shown in timeline |
| RCA Form with datetime pickers | Section 1 with start/end pickers + future time validation |
| Rate limiting on ingestion | Token bucket, 100 req/s per IP, X-RateLimit-* headers |
| `/health` endpoint | Returns all store status + queue + worker stats |
| Throughput metrics every 5s | Worker pool logs signals/sec to console |
| Concurrency primitives | goroutines, channels, sync.Map, atomic.Int64 |
| Unit tests for RCA validation | 18 tests, all passing with `-race` flag |
| Retry logic for DB writes | 3 attempts, exponential backoff on all stores |
| README with Architecture Diagram | See below |
| Docker Compose setup | `docker compose up --build` |
| Backpressure section | See below |
| Sample data / simulate script | `scripts/simulate_failure.sh` |
| Prompts/Spec/Plans checked in | `docs/prompts.md`, `docs/spec.md` |

---

## Architecture

```
                    ┌─────────────────────────────────────────────────┐
                    │              IMS Architecture                    │
                    └─────────────────────────────────────────────────┘

  Signals (HTTP)
       │
       ▼
┌─────────────┐     Token Bucket      ┌──────────────────────┐
│  Rate       │──── Rate Limiter ────▶│  Signal Ingestion    │
│  Limiter    │     100 req/s/IP      │  POST /api/v1/signals│
└─────────────┘                       └──────────┬───────────┘
                                                  │
                                    Debounce Check (sync.Map + Redis)
                                    10s window per Component ID
                                                  │
                                       ┌──────────▼──────────┐
                                       │   Bounded Channel   │
                                       │   Queue (50k cap)   │
                                       │   Non-blocking      │
                                       │   TryEnqueue        │
                                       └──────────┬──────────┘
                                                  │
                              ┌───────────────────┼───────────────────┐
                              ▼                   ▼                   ▼
                       Worker Pool          Worker Pool          Worker Pool
                       (Goroutine 1)        (Goroutine 2)    ... (Goroutine 20)
                              │                   │                   │
                    ┌─────────┼───────────────────┼───────────────────┤
                    ▼         ▼                   ▼                   ▼
             ┌──────────┐ ┌──────────┐     ┌──────────┐       ┌──────────┐
             │ MongoDB  │ │PostgreSQL│     │TimescaleDB│      │  Redis   │
             │ Raw      │ │WorkItems │     │Timeseries │      │Dashboard │
             │ Signals  │ │RCA       │     │Aggregates │      │Cache     │
             │ Audit Log│ │Source of │     │           │      │Debounce  │
             └──────────┘ │  Truth   │     └──────────┘       └──────────┘
                          └──────────┘

                    ┌─────────────────────────────────┐
                    │         Strategy Pattern        │
                    │  P0 → PagerDuty (RDBMS/Queue)  │
                    │  P1 → Slack     (API/MCP Host) │
                    │  P2 → Email     (Cache)         │
                    └─────────────────────────────────┘

                    ┌─────────────────────────────────┐
                    │          State Machine          │
                    │  OPEN → INVESTIGATING           │
                    │       → RESOLVED               │
                    │       → CLOSED (RCA required)  │
                    └─────────────────────────────────┘

                    ┌─────────────────────────────────┐
                    │        React Frontend           │
                    │  Dashboard · Incidents · RCA    │
                    │  WebSocket live updates         │
                    │  3s polling fallback            │
                    └─────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Backend | Go 1.22 + Fiber v2 | High concurrency, low latency |
| Source of Truth | PostgreSQL + TimescaleDB | ACID transactions + timeseries |
| Audit Log | MongoDB 7.0 | Flexible schema for raw signals |
| Cache | Redis 7.2 | Sub-millisecond hot-path reads |
| Frontend | React 18 + Vite | Real-time UI with WebSocket |
| Observability | Prometheus + Grafana | Metrics and dashboards |
| Container | Docker + Docker Compose | Single-command local deployment |

---

## Backpressure Handling

When the persistence layer is slow, the signal ingestion pipeline handles backpressure at three levels:

**Level 1 — Rate Limiter**
Token bucket algorithm at 100 req/s per IP. Returns `429 Too Many Requests` with `X-RateLimit-Remaining` and `Retry-After` headers before signals even enter the system.

**Level 2 — Bounded Channel Queue**
A buffered Go channel with 50,000 capacity acts as the in-memory buffer. `TryEnqueue` is non-blocking — if the channel is full it increments `signals_dropped_total` and returns immediately. The system **never blocks** on a full queue.

**Level 3 — Debounce Window**
If 100 signals arrive for the same Component ID within 10 seconds, only 1 WorkItem is created. All subsequent signals are linked to the existing WorkItem in MongoDB. This prevents WorkItem explosion under signal storms.

```
Signal Storm (10,000 signals/sec)
         │
         ▼
Rate Limiter ──── 429 if > 100 req/s/IP
         │
         ▼
Debounce ──── Same ComponentID? Link to existing WorkItem
         │
         ▼
Queue ──── Full? Drop + increment counter
         │
         ▼
Workers ──── 20 goroutines drain queue
```

---

## Deployment 1 — Docker Compose (Local)

### Prerequisites
- Docker and Docker Compose installed
- Ports 3000, 8080, 5432, 27017, 6379 available

### Quick Start

```bash
# Clone the repository
git clone https://github.com/Shrinidhi972004/ims.git
cd ims

# Start all services
docker compose up --build
```

### Simulate a Failure

```bash
# Get auth token
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Run failure simulation
./scripts/simulate_failure.sh http://localhost:8080 $TOKEN
```

if user allready exists then use this command:

```bash
# login
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"shrinidhi","password":"sre12345"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

echo "Token: $TOKEN"

# Run failure simulation
./scripts/simulate_failure.sh http://localhost:8080 $TOKEN
```
The script simulates:
- **Phase 1:** RDBMS_PRIMARY outage — 150 signals → 1 P0 WorkItem (debounce working)
- **Phase 2:** MCP_HOST_02 cascade failure — 50 signals → 1 P1 WorkItem
- **Phase 3:** CACHE_CLUSTER_01 miss spike — 30 signals → 1 P2 WorkItem

---

### Screenshots

#### 1. Docker Compose Up + Simulate Script Running
> `docker compose up --build` followed by `./scripts/simulate_failure.sh`

![Docker Compose and Simulate](docs/screenshots/01-docker-compose-simulate.png)

---

#### 2. Login / Signup Page
> Professional split-panel login with IMS branding

![Login Page](docs/screenshots/02-login-page.png)

---

#### 3. Dashboard — Incoming Signals
> Real-time dashboard showing 3 active incidents after simulate script

![Dashboard Incoming](docs/screenshots/03-dashboard-incoming.png)

---

#### 4. Incidents Page
> All incidents sorted by severity — P0, P1, P2 with status badges

![Incidents Page](docs/screenshots/04-incidents-page.png)

---

#### 5. Incident Detail — OPEN State
> P0 incident timeline showing signals from MongoDB and state machine

![Incident Open](docs/screenshots/05-incident-open.png)

---

#### 6. Incident Detail — INVESTIGATING State
> After clicking "Move to INVESTIGATING"

![Incident Investigating](docs/screenshots/06-incident-investigating.png)

---

#### 7. RCA Form — Filling Out
> Root Cause Analysis form with datetime pickers and category selection

![RCA Form 1](docs/screenshots/07-rca-form-filling.png)

---

#### 8. RCA Form — Completed
> All sections filled — MTTR preview shows calculated repair time

![RCA Form 2](docs/screenshots/08-rca-form-completed.png)

---

#### 9. RCA Submitted Successfully
> Success screen after RCA submission

![RCA Submitted](docs/screenshots/09-rca-submitted.png)

---

#### 10. Incident Detail — RCA Summary
> Incident detail showing the submitted RCA with all fields

![RCA Summary](docs/screenshots/10-rca-summary.png)

---

#### 11. Incident — CLOSED State
> MTTR badge appears in header after closing

![Incident Closed](docs/screenshots/11-incident-closed.png)

---

#### 12. Incidents Page — Open Filter (2 remaining)
> After closing P0, only 2 incidents visible in Open filter

![Incidents Open Filter](docs/screenshots/12-incidents-open-filter.png)

---

#### 13. All Incidents Closed
> Closed tab showing all 3 incidents resolved with MTTR

![All Incidents Closed](docs/screenshots/13-all-incidents-closed.png)

---

#### 14. Settings Dashboard
> Real-time system health — all stores connected, 20 workers active, goroutine count

![Settings Dashboard](docs/screenshots/14-settings-dashboard.png)

---

### Service URLs

| Service | URL | Credentials |
|---|---|---|
| IMS Frontend | http://localhost:3000 | Register any username/password |
| IMS Backend API | http://localhost:8080 | JWT Bearer token |
| Health Check | http://localhost:8080/health | No auth required |
| Prometheus Metrics | http://localhost:8080/metrics | No auth required |

---

## Running Tests

```bash
cd backend
go test -v -race -count=1 ./internal/models/...
```

Expected output: **18 tests passing** covering RCA validation, MTTR calculation, and boundary conditions.

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/auth/signup` | Register new user |
| POST | `/api/v1/auth/login` | Login and get JWT |
| POST | `/api/v1/signals` | Ingest a signal |
| POST | `/api/v1/signals/batch` | Ingest signals in batch |
| GET | `/api/v1/workitems` | List all work items |
| GET | `/api/v1/workitems/:id` | Get work item with signals and RCA |
| PUT | `/api/v1/workitems/:id/transition` | Transition state |
| POST | `/api/v1/workitems/:id/rca` | Submit RCA |
| GET | `/api/v1/dashboard` | Get dashboard stats |
| GET | `/health` | System health check |
| GET | `/metrics` | Prometheus metrics |
| WS | `/ws` | WebSocket for live updates |

---

## Project Structure

```
ims/
├── backend/
│   ├── cmd/server/main.go
│   ├── internal/
│   │   ├── models/        # WorkItem, RCA, Signal + 18 unit tests
│   │   ├── store/         # PostgreSQL, MongoDB, Redis stores
│   │   ├── queue/         # Bounded channel queue
│   │   ├── ingestion/     # Signal ingestion handler
│   │   ├── worker/        # Goroutine worker pool
│   │   ├── workflow/      # State machine (State Pattern)
│   │   ├── alerting/      # Alert dispatcher (Strategy Pattern)
│   │   └── api/           # HTTP routes and handlers
│   └── migrations/        # SQL schema
├── frontend/
│   └── src/
│       ├── pages/         # Dashboard, Incidents, RCAForm, Settings
│       ├── components/    # Sidebar
│       ├── hooks/         # useWebSocket
│       └── lib/           # API client
├── scripts/
│   ├── simulate_failure.sh
│   └── sample_events.json
├── docs/
│   ├── architecture.md
│   ├── prompts.md
│   ├── spec.md
│   ├── runbook.md
│   ├── slo.md
│   └── screenshots/
├── helm/                  # Kubernetes Helm chart
├── argocd/                # ArgoCD GitOps manifests
├── terraform/             # AWS infrastructure (IaC)
├── docker-compose.yml
└── README.md
```

---

## Deployment 2 — Production on AWS EKS (DevOps/SRE/GitOps)

This deployment demonstrates production-grade SRE practices — infrastructure as code, GitOps, observability, and alerting — all running on AWS EKS with fully managed AWS services.

### Infrastructure Overview

```
AWS (ap-south-1)
├── VPC — 3 AZs, public + private subnets, NAT gateways
├── EKS — 3x t3.medium nodes (Kubernetes v1.31)
├── ECR — ims-backend + ims-frontend image repositories
├── RDS PostgreSQL 14 — managed, encrypted, private subnet
├── ElastiCache Redis 7 — managed, private subnet
└── DocumentDB — managed MongoDB-compatible, private subnet
```

### Prerequisites

- AWS CLI configured
- Terraform >= 1.5.0
- kubectl
- Helm 3.x
- Docker

---

### Step 1 — Provision AWS Infrastructure (Terraform)

```bash
cd terraform

# Initialize backend (S3 + DynamoDB)
terraform init

# Preview
terraform plan -var-file=environments/dev.tfvars

# Apply — takes ~20 minutes
terraform apply -var-file=environments/dev.tfvars -auto-approve
```

Terraform provisions:
- VPC with public/private subnets across 3 AZs
- EKS cluster (v1.31) with managed node group
- ECR repositories for backend and frontend
- RDS PostgreSQL (db.t3.micro)
- ElastiCache Redis (cache.t3.micro)
- DocumentDB (db.t3.medium)
- IAM roles for EKS cluster and nodes

---

### Step 2 — Configure kubectl

```bash
aws eks update-kubeconfig --region ap-south-1 --name ims-dev
kubectl get nodes
```

---

### Step 3 — Build and Push Images to ECR

```bash
# Login to ECR
aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS --password-stdin \
  009882533113.dkr.ecr.ap-south-1.amazonaws.com

# Backend
docker build -t ims-backend ./backend
docker tag ims-backend:latest \
  009882533113.dkr.ecr.ap-south-1.amazonaws.com/ims-backend:latest
docker push \
  009882533113.dkr.ecr.ap-south-1.amazonaws.com/ims-backend:latest

# Frontend
docker build -t ims-frontend ./frontend
docker tag ims-frontend:latest \
  009882533113.dkr.ecr.ap-south-1.amazonaws.com/ims-frontend:latest
docker push \
  009882533113.dkr.ecr.ap-south-1.amazonaws.com/ims-frontend:latest
```

---

### Step 4 — Deploy IMS via Helm

```bash
kubectl create namespace ims

helm install ims ./helm/ims \
  --namespace ims \
  --set postgres.enabled=false \
  --set mongodb.enabled=false \
  --set redis.enabled=false \
  --set image.backend.repository=<ECR_BACKEND_URL> \
  --set image.backend.tag=latest \
  --set image.backend.pullPolicy=Always \
  --set image.frontend.repository=<ECR_FRONTEND_URL> \
  --set image.frontend.tag=latest \
  --set image.frontend.pullPolicy=Always \
  --set postgres.host=<RDS_ENDPOINT> \
  --set postgres.username=imsadmin \
  --set "postgres.password=<PASSWORD>" \
  --set "mongo.uri=mongodb://<DOCDB_ENDPOINT>:27017/?replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false" \
  --set redis.addr=<REDIS_ENDPOINT>

# Expose frontend via AWS Load Balancer
kubectl expose service ims-frontend \
  --type=LoadBalancer --name=ims-frontend-lb \
  --port=80 --target-port=80 -n ims

kubectl get svc ims-frontend-lb -n ims
```

The Helm chart includes:
- **HPA** — backend scales 2→10 replicas at 70% CPU
- **PodDisruptionBudget** — minimum 1 replica during node drains
- **Pod Anti-Affinity** — backend pods spread across nodes
- **Security Contexts** — non-root, readOnlyRootFilesystem, drop ALL capabilities
- **Rolling Updates** — zero downtime (maxUnavailable: 0)
- **Prometheus Annotations** — auto-scrape on /metrics

---

### Step 5 — Install ArgoCD (GitOps)

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f \
  https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

kubectl wait --for=condition=available --timeout=300s \
  deployment/argocd-server -n argocd

# Get admin password
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d && echo

# Apply IMS GitOps manifests
kubectl apply -f argocd/project.yaml
kubectl apply -f argocd/application.yaml

# Expose ArgoCD UI
kubectl patch svc argocd-server -n argocd \
  -p '{"spec": {"type": "LoadBalancer"}}'
```

ArgoCD syncs automatically from `feat/bonus-enhancements` with:
- Auto-sync on every Git push
- Self-heal to revert manual drift
- Prune to remove deleted resources
- Retry with exponential backoff (5 attempts)

---

### Step 6 — Install Monitoring Stack (Helm)

```bash
helm repo add prometheus-community \
  https://prometheus-community.github.io/helm-charts
helm repo update

kubectl create namespace monitoring

helm install kube-prometheus-stack \
  prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --set grafana.adminPassword=admin \
  -f helm/monitoring/values.yaml

# Expose Grafana and Prometheus via LoadBalancer
kubectl patch svc kube-prometheus-stack-grafana -n monitoring \
  -p '{"spec": {"type": "LoadBalancer"}}'

kubectl patch svc kube-prometheus-stack-prometheus -n monitoring \
  -p '{"spec": {"type": "LoadBalancer"}}'
```

---

### Step 7 — Teardown

```bash
cd terraform
terraform destroy -var-file=environments/dev.tfvars -auto-approve
```

---

### Custom Prometheus Metrics

IMS exposes 7 custom metrics at `/metrics`:

| Metric | Type | Description |
|---|---|---|
| `ims_signals_per_second` | Timeseries | Current signal ingestion rate |
| `ims_signals_ingested_total` | Timeseries | Total signals received |
| `ims_signals_dropped_total` | Timeseries | Signals dropped due to backpressure |
| `ims_queue_fill_ratio` | Timeseries | Signal queue fill percentage (0.0 to 1.0) |
| `ims_active_incidents` | Timeseries | Number of OPEN + INVESTIGATING incidents |
| `ims_work_items_by_state` | Timeseries | WorkItems grouped by state label |
| `ims_websocket_clients` | Timeseries | Connected WebSocket clients |

**Key PromQL queries used in Grafana dashboards:**

```promql
# Live signals per second
ims_signals_per_second

# Signal ingestion rate (1m window)
rate(ims_signals_ingested_total[1m])

# Queue pressure %
ims_queue_fill_ratio * 100

# Active incidents
ims_active_incidents

# Work items by state
ims_work_items_by_state

# Node CPU usage %
100 - (avg by(node) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

# Node memory usage %
100 * (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))

# Pod restarts in IMS namespace
increase(kube_pod_container_status_restarts_total{namespace="ims"}[1h])

# IMS CPU usage
sum(rate(container_cpu_usage_seconds_total{namespace="ims"}[5m]))
```

---

### Alert Rules

| Alert | Condition | Severity | Slack Channel |
|---|---|---|---|
| IMSBackendDown | backend unreachable for 1m | critical | #incidents-critical |
| IMSHighSignalDropRate | signals dropped > 0 for 30s | critical | #incidents-critical |
| IMSQueuePressureHigh | queue fill > 80% for 1m | warning | #sre-alerts |
| IMSActiveIncidentsHigh | active incidents > 5 for 2m | warning | #sre-alerts |
| IMSHighHTTPLatency | p95 latency > 1s for 2m | warning | #sre-alerts |

---

### EKS Deployment Screenshots

#### 15. All Pods Running — ims + monitoring + argocd namespaces
> `kubectl get pods -n ims`, `kubectl get pods -n monitoring`, `kubectl get pods -n argocd`

![EKS All Pods](docs/screenshots/15-eks-pods-all-namespaces.png)

---

#### 16. Services + ArgoCD Status + Terraform Output
> LoadBalancer URLs, ArgoCD sync status, Terraform infrastructure outputs

![Services ArgoCD Terraform](docs/screenshots/16-eks-svc-argocd-terraform.png)

---

#### 17. IMS Frontend Running on AWS Load Balancer
> IMS dashboard accessible via real AWS LB URL — incidents visible

![IMS on EKS LB](docs/screenshots/17-ims-frontend-eks-lb.png)

---

#### 18. ArgoCD Applications Page
> IMS application — Healthy + Synced to `feat/bonus-enhancements` branch

![ArgoCD Applications](docs/screenshots/18-argocd-applications.png)

---

#### 19. ArgoCD Resource Tree
> Full Kubernetes resource tree — all Deployments, Services, Pods green

![ArgoCD Resource Tree](docs/screenshots/19-argocd-resource-tree.png)

---

#### 20. Grafana — IMS Application Metrics Dashboard
> Custom dashboard — signals/sec, active incidents, queue fill ratio, work items by state

![Grafana IMS Dashboard](docs/screenshots/20-grafana-ims-dashboard.png)

---

#### 21. Grafana — Node / Cluster Metrics Dashboard
> Node CPU, memory, disk, network I/O across all 3 EKS nodes

![Grafana Node Dashboard](docs/screenshots/21-grafana-node-dashboard.png)

---

#### 22. Slack Alert Notifications
> P0 and warning alerts routed to #incidents-critical and #sre-alerts via Alertmanager

![Slack Alerts](docs/screenshots/22-slack-alerts.png)

---

### GitOps Flow

```
Developer pushes to feat/bonus-enhancements
              ↓
GitHub Actions CI
  - go test -race ./...
  - docker build + push to GHCR
              ↓
ArgoCD detects changes (polls every 3 min)
  - Syncs Helm chart to EKS cluster
  - Self-heals any manual configuration drift
  - Prunes resources deleted from Git
              ↓
IMS running on AWS EKS ✅
```