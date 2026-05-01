# Engineering Challenge: Mission-Critical Incident Management System (IMS)

> Original assignment specification from Zeotap — stored as required by submission guidelines.

## 1. Overview

The goal of this assignment is to build a resilient **Incident Management System (IMS)**
designed to monitor a complex distributed stack (APIs, MCP Hosts, Distributed Caches,
Async Queues, RDBMS, and NoSQL stores) and manage failure mediation workflow.

In a production environment, "signals" (errors/latency spikes) arrive in high volumes. Your
system must intelligently ingest these signals, process and store them, alert the right
responders, and provide a workflow-driven UI to track the incident to a "Closed" state with a
mandatory Root Cause Analysis (RCA).

## 2. Technical Architecture

### A. Ingestion & In-Memory Processing (The Producer)

- **Signal Ingestion**: Support high-throughput ingestion of signals
- **Memory Management**: The system must handle bursts of up to 10,000 signals/sec
- **Debouncing Logic**: If 100 signals arrive for the same "Component ID" within 10 seconds, only one Work Item should be created, while all 100 signals are linked to it in the NoSQL store

### B. Distribution & Persistence (The Storage)

- **Sink (The Data Lake)**: Store the high-volume, raw error payloads
- **Sink (The Source of Truth)**: Store the structured Work Items and RCA records. Transitions here must be transactional
- **Cache (The Hot-Path)**: Maintain a "Real-time Dashboard State"
- **Sink (Aggregations)**: Support timeseries aggregations

### C. The Workflow Engine (Strategy & State Patterns)

- **Alerting Strategy**: Use Strategy Pattern to swap alerting logic
- **Work Item State**: Manage transitions (OPEN → INVESTIGATING → RESOLVED → CLOSED) using State Pattern

## 3. Functional Requirements

### The Backend Engine

1. **Async Processing**: The system must operate on Async processing
2. **Mandatory RCA**: Reject any attempt to move a Work Item to CLOSED if the RCA object is missing or incomplete
3. **MTTR Calculation**: Automatically calculate Mean Time To Repair

### The Incident Dashboard (UI)

- **Live Feed**: View active incidents sorted by severity
- **Incident Detail**: Click an incident to see the raw signals and current status
- **RCA Form**: Incident Start/End, Root Cause Category, Fix Applied & Prevention Steps

## 4. Technical Constraints & Resilience

- **Concurrency**: Use modern concurrency primitives
- **Rate Limiting**: Implement a rate-limiter on the Ingestion API
- **Observability**: Expose a /health endpoint and print throughput metrics every 5 seconds

## 5. Evaluation Rubric

| Category | Weight |
|---|---|
| Concurrency & Scaling | 10% |
| Data Handling | 20% |
| LLD | 20% |
| UI/UX & Integration | 20% |
| Resilience & Testing | 10% |
| Documentation | 10% |
| Tech Stack choices | 10% |

## 6. Submission Guidelines

1. Codebase: `/backend` and `/frontend` in one repo
2. README.md: Architecture Diagram, Docker Compose setup, Backpressure section
3. Sample Data: Script or JSON to mock a failure event
4. Prompts/Spec/Plans: All markdowns and prompts checked in
5. Bonus points for creative additions
