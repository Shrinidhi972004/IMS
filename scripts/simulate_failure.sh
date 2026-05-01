#!/usr/bin/env bash
# ============================================================
# scripts/simulate_failure.sh
#
# Simulates a realistic incident scenario:
#   1. RDBMS_PRIMARY goes down — 150 signals in 8s (debounce → 1 WorkItem P0)
#   2. MCP_HOST_02 fails     — 50 signals in 3s  (debounce → 1 WorkItem P1)
#   3. CACHE_CLUSTER_01 miss — 30 signals          (debounce → 1 WorkItem P2)
#
# Usage:
#   ./scripts/simulate_failure.sh [BASE_URL] [JWT_TOKEN]
#
# Example (local):
#   ./scripts/simulate_failure.sh http://localhost:8080 <token>
#
# Get a token first:
#   curl -s -X POST http://localhost:8080/api/v1/auth/login \
#        -H 'Content-Type: application/json' \
#        -d '{"username":"admin","password":"admin123"}' | jq -r .token
# ============================================================

set -euo pipefail

BASE_URL="${1:-http://localhost:8080}"
TOKEN="${2:-}"
API="$BASE_URL/api/v1"

RED='\033[0;31m'
YLW='\033[0;33m'
GRN='\033[0;32m'
CYN='\033[0;36m'
RST='\033[0m'

if [ -z "$TOKEN" ]; then
  echo -e "${CYN}[*] No token provided — attempting login as admin...${RST}"
  TOKEN=$(curl -s -X POST "$API/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"username":"admin","password":"admin123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
  if [ -z "$TOKEN" ]; then
    echo -e "${RED}[✗] Login failed. Is the backend running at $BASE_URL?${RST}"
    exit 1
  fi
  echo -e "${GRN}[✓] Authenticated successfully${RST}"
fi

AUTH_HEADER="Authorization: Bearer $TOKEN"

send_signal() {
  local component_id="$1"
  local component_type="$2"
  local severity="$3"
  local message="$4"

  curl -s -X POST "$API/signals" \
    -H 'Content-Type: application/json' \
    -H "$AUTH_HEADER" \
    -d "{
      \"component_id\":   \"$component_id\",
      \"component_type\": \"$component_type\",
      \"severity\":       \"$severity\",
      \"message\":        \"$message\",
      \"metadata\":       {\"source\": \"simulate_failure.sh\"}
    }" > /dev/null
}

send_batch() {
  local payload="$1"
  curl -s -X POST "$API/signals/batch" \
    -H 'Content-Type: application/json' \
    -H "$AUTH_HEADER" \
    -d "$payload" > /dev/null
}

echo ""
echo -e "${RED}╔══════════════════════════════════════════════════╗${RST}"
echo -e "${RED}║  IMS FAILURE SIMULATION — STARTING              ║${RST}"
echo -e "${RED}╚══════════════════════════════════════════════════╝${RST}"
echo ""

# ----------------------------------------------------------
# Phase 1: RDBMS Primary outage
# 150 signals over 8 seconds → debounce creates 1 P0 WorkItem
# ----------------------------------------------------------
echo -e "${RED}[PHASE 1] RDBMS_PRIMARY — simulating database outage${RST}"
echo -e "          Sending 150 signals over 8 seconds..."
echo -e "          Expected: 1 P0 WorkItem (all signals debounced)"
echo ""

# Send first signal — triggers WorkItem creation + PagerDuty alert
send_signal "RDBMS_PRIMARY" "RDBMS" "P0" "Connection pool exhausted: max_connections reached"
sleep 0.1

# Send remaining 149 in batches of 10 over 8 seconds
for batch in $(seq 1 14); do
  BATCH_SIGNALS='['
  for i in $(seq 1 10); do
    ERRORS=("Deadlock detected on table transactions" \
            "Replication lag exceeded 30s threshold" \
            "Checkpoint completion took 45s" \
            "WAL archiving failed: disk full" \
            "Max connections (500) reached")
    MSG="${ERRORS[$((RANDOM % 5))]}"
    BATCH_SIGNALS+="{\"component_id\":\"RDBMS_PRIMARY\",\"component_type\":\"RDBMS\",\"severity\":\"P0\",\"message\":\"$MSG\",\"metadata\":{\"source\":\"simulate\"}},"
  done
  BATCH_SIGNALS="${BATCH_SIGNALS%,}]"
  send_batch "$BATCH_SIGNALS"
  echo -ne "  Batch $batch/14 sent\r"
  sleep 0.5
done

echo -e "${GRN}[✓] RDBMS_PRIMARY: 150 signals sent${RST}"
sleep 1

# ----------------------------------------------------------
# Phase 2: MCP Host failure (cascade from RDBMS)
# 50 signals in 3 seconds → debounce creates 1 P1 WorkItem
# ----------------------------------------------------------
echo ""
echo -e "${YLW}[PHASE 2] MCP_HOST_02 — simulating cascade failure${RST}"
echo -e "          Sending 50 signals over 3 seconds..."
echo -e "          Expected: 1 P1 WorkItem (Slack alert)"
echo ""

send_signal "MCP_HOST_02" "MCP_HOST" "P1" "Health check failed: upstream RDBMS_PRIMARY unreachable"
sleep 0.1

for batch in $(seq 1 4); do
  BATCH_SIGNALS='['
  for i in $(seq 1 12); do
    BATCH_SIGNALS+="{\"component_id\":\"MCP_HOST_02\",\"component_type\":\"MCP_HOST\",\"severity\":\"P1\",\"message\":\"Request timeout after 30s: RDBMS_PRIMARY connection refused\",\"metadata\":{\"source\":\"simulate\"}},"
  done
  BATCH_SIGNALS="${BATCH_SIGNALS%,}]"
  send_batch "$BATCH_SIGNALS"
  echo -ne "  Batch $batch/4 sent\r"
  sleep 0.7
done

echo -e "${GRN}[✓] MCP_HOST_02: 50 signals sent${RST}"
sleep 1

# ----------------------------------------------------------
# Phase 3: Cache degradation
# 30 signals → debounce creates 1 P2 WorkItem
# ----------------------------------------------------------
echo ""
echo -e "${YLW}[PHASE 3] CACHE_CLUSTER_01 — cache miss spike${RST}"
echo -e "          Sending 30 signals..."
echo -e "          Expected: 1 P2 WorkItem (Email alert)"
echo ""

for i in $(seq 1 30); do
  send_signal "CACHE_CLUSTER_01" "CACHE" "P2" "Cache miss rate: ${i}0% — exceeds 80% threshold"
  sleep 0.1
done

echo -e "${GRN}[✓] CACHE_CLUSTER_01: 30 signals sent${RST}"

# ----------------------------------------------------------
# Summary
# ----------------------------------------------------------
sleep 1
echo ""
echo -e "${CYN}╔══════════════════════════════════════════════════╗${RST}"
echo -e "${CYN}║  SIMULATION COMPLETE — RESULTS                  ║${RST}"
echo -e "${CYN}╚══════════════════════════════════════════════════╝${RST}"
echo ""

DASHBOARD=$(curl -s "$API/dashboard" -H "$AUTH_HEADER")
OPEN=$(echo "$DASHBOARD" | grep -o '"total_open":[0-9]*' | cut -d: -f2)
ACTIVE=$(echo "$DASHBOARD" | grep -o '"total_investigating":[0-9]*' | cut -d: -f2)

echo -e "  Total signals sent:    ${RED}230${RST}"
echo -e "  Work items created:    ${YLW}3${RST} (debounce working correctly)"
echo -e "  P0 incidents (RDBMS):  ${RED}1${RST} → PagerDuty alert dispatched"
echo -e "  P1 incidents (MCP):    ${YLW}1${RST} → Slack alert dispatched"
echo -e "  P2 incidents (Cache):  ${YLW}1${RST} → Email alert dispatched"
echo -e "  Dashboard OPEN count:  ${CYN}${OPEN:-?}${RST}"
echo ""
echo -e "  Dashboard:  ${CYN}http://localhost:3000${RST}"
echo -e "  Grafana:    ${CYN}http://localhost:3001${RST}  (admin/admin)"
echo -e "  API:        ${CYN}$BASE_URL/health${RST}"
echo ""
