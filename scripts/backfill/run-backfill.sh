#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

CLICKHOUSE_HOST="${CLICKHOUSE_HOST:-localhost}"
CLICKHOUSE_PORT="${CLICKHOUSE_PORT:-9000}"
CLICKHOUSE_HTTP_PORT="${CLICKHOUSE_HTTP_PORT:-8123}"
CLICKHOUSE_USER="${CLICKHOUSE_USER:-hotelkey}"
CLICKHOUSE_PASSWORD="${CLICKHOUSE_PASSWORD:-hotelkey_dev}"
CLICKHOUSE_DB="${CLICKHOUSE_DB:-hotel_key_analytics}"
FEAST_REPO_PATH="${FEAST_REPO_PATH:-$REPO_ROOT/infra/feast}"

echo "==> Step 1: Wait for ClickHouse to be ready"
for i in $(seq 1 30); do
  if curl -sf "http://${CLICKHOUSE_HOST}:${CLICKHOUSE_HTTP_PORT}/ping" > /dev/null 2>&1; then
    echo "ClickHouse is ready"
    break
  fi
  if [[ "$i" -eq 30 ]]; then
    echo "ERROR: ClickHouse did not become ready in time"
    exit 1
  fi
  echo "  Waiting for ClickHouse... ($i/30)"
  sleep 5
done

echo "==> Step 2: Apply ClickHouse schema"
clickhouse-client \
  --host "$CLICKHOUSE_HOST" \
  --port "$CLICKHOUSE_PORT" \
  --user "$CLICKHOUSE_USER" \
  --password "$CLICKHOUSE_PASSWORD" \
  --multiquery \
  < "$REPO_ROOT/infra/clickhouse/schema.sql"
echo "Schema applied"

echo "==> Step 3: Install Python dependencies"
pip install --quiet -r "$SCRIPT_DIR/requirements.txt"

echo "==> Step 4: Run PostgreSQL → ClickHouse backfill"
python3 "$SCRIPT_DIR/backfill_clickhouse.py"

echo "==> Step 5: Run Feast apply to register feature definitions"
cd "$FEAST_REPO_PATH"
feast apply
echo "Feast feature definitions applied"

echo "==> Step 6: Materialize features into online store"
feast materialize-incremental "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Feature materialization complete"

echo ""
echo "Backfill pipeline finished successfully"
