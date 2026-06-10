#!/usr/bin/env bash
set -euo pipefail

REGISTRY_URL="${REGISTRY_URL:-http://localhost:8085}"
GROUP_ID="hotel-key"
SCHEMAS_DIR="$(cd "$(dirname "$0")/../../docs/schemas/avro" && pwd)"

register_schema() {
  local avsc_file="$1"
  local artifact_id
  artifact_id="$(basename "$avsc_file" .avsc)"

  echo "Registering schema: ${artifact_id}"

  local http_status
  http_status=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST \
    "${REGISTRY_URL}/apis/registry/v2/groups/${GROUP_ID}/artifacts" \
    -H "Content-Type: application/json" \
    -H "X-Registry-ArtifactType: AVRO" \
    -H "X-Registry-ArtifactId: ${artifact_id}" \
    -H "X-Registry-If-Exists: UPDATE" \
    --data-binary "@${avsc_file}")

  if [[ "$http_status" == "200" || "$http_status" == "201" ]]; then
    echo "  [OK] ${artifact_id} registered (HTTP ${http_status})"
  else
    echo "  [FAIL] ${artifact_id} — unexpected HTTP ${http_status}" >&2
    return 1
  fi
}

set_compatibility_rule() {
  local artifact_id="$1"

  local http_status
  http_status=$(curl -s -o /dev/null -w "%{http_code}" \
    -X PUT \
    "${REGISTRY_URL}/apis/registry/v2/groups/${GROUP_ID}/artifacts/${artifact_id}/rules/COMPATIBILITY" \
    -H "Content-Type: application/json" \
    --data '{"ruleType":"COMPATIBILITY","config":"FORWARD_TRANSITIVE"}')

  if [[ "$http_status" == "200" || "$http_status" == "201" || "$http_status" == "204" ]]; then
    echo "  [OK] ${artifact_id} compatibility rule set to FORWARD_TRANSITIVE"
  else
    echo "  [WARN] ${artifact_id} compatibility rule — HTTP ${http_status}" >&2
  fi
}

echo "Schema Registry: ${REGISTRY_URL}"
echo "Schemas dir:     ${SCHEMAS_DIR}"
echo ""

if [[ ! -d "$SCHEMAS_DIR" ]]; then
  echo "ERROR: schemas directory not found: ${SCHEMAS_DIR}" >&2
  exit 1
fi

success=0
failure=0

for avsc_file in "${SCHEMAS_DIR}"/*.avsc; do
  [[ -f "$avsc_file" ]] || continue
  artifact_id="$(basename "$avsc_file" .avsc)"

  if register_schema "$avsc_file"; then
    set_compatibility_rule "$artifact_id"
    ((success++)) || true
  else
    ((failure++)) || true
  fi
done

echo ""
echo "Done. ${success} succeeded, ${failure} failed."

if [[ "$failure" -gt 0 ]]; then
  exit 1
fi
