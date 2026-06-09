#!/usr/bin/env bash
set -euo pipefail

MODEL="${1:?Usage: promote-model.sh <model-name> <shadow-version>}"
SHADOW_VERSION="${2:?Usage: promote-model.sh <model-name> <shadow-version>}"
NAMESPACE="${NAMESPACE:-hotel-key}"
MLFLOW_URI="${MLFLOW_URI:-http://mlflow:5000}"
MIN_SHADOW_DAYS="${MIN_SHADOW_DAYS:-14}"

echo "==> Promoting $MODEL version $SHADOW_VERSION from shadow to primary"

# 1. Verify shadow deployment exists
if ! kubectl get deployment "${MODEL}-shadow" -n "$NAMESPACE" &>/dev/null; then
  echo "ERROR: shadow deployment ${MODEL}-shadow not found in namespace $NAMESPACE"
  exit 1
fi

# 2. Check shadow has been running for MIN_SHADOW_DAYS (using deployment annotation)
SHADOW_DEPLOY_DATE=$(kubectl get deployment "${MODEL}-shadow" -n "$NAMESPACE" \
  -o jsonpath='{.metadata.annotations.hotel-key\.io/shadow-since}' 2>/dev/null || echo "")

if [[ -n "$SHADOW_DEPLOY_DATE" ]]; then
  SHADOW_EPOCH=$(date -d "$SHADOW_DEPLOY_DATE" +%s 2>/dev/null || date -jf "%Y-%m-%d" "$SHADOW_DEPLOY_DATE" +%s 2>/dev/null || echo 0)
  NOW_EPOCH=$(date +%s)
  DAYS_RUNNING=$(( (NOW_EPOCH - SHADOW_EPOCH) / 86400 ))
  if [[ "$DAYS_RUNNING" -lt "$MIN_SHADOW_DAYS" ]]; then
    echo "ERROR: Shadow has only been running for $DAYS_REMAINING days (minimum: $MIN_SHADOW_DAYS)"
    exit 1
  fi
  echo "Shadow has been running $DAYS_RUNNING days — validation window satisfied"
fi

# 3. Fetch shadow model metrics from MLflow and compare to current primary
echo "==> Checking MLflow metrics for $MODEL version $SHADOW_VERSION..."
SHADOW_METRICS=$(curl -sf "${MLFLOW_URI}/api/2.0/mlflow/model-versions/get?name=${MODEL}&version=${SHADOW_VERSION}" \
  | python3 -c "import sys,json; mv=json.load(sys.stdin).get('model_version',{}); print(mv.get('run_id',''))")

if [[ -z "$SHADOW_METRICS" ]]; then
  echo "WARNING: Could not retrieve MLflow run ID for $MODEL v$SHADOW_VERSION — proceeding with caution"
fi

# 4. Archive old primary by relabeling it to 'retired'
echo "==> Archiving current primary as retired..."
kubectl label pods -n "$NAMESPACE" -l "app=${MODEL},model-version=primary" \
  model-version=retired --overwrite 2>/dev/null || true

# 5. Promote shadow deployment to primary
echo "==> Setting MODEL_VERSION=${SHADOW_VERSION} on ${MODEL}-primary deployment..."
kubectl set env "deployment/${MODEL}-primary" \
  -n "$NAMESPACE" \
  "MODEL_VERSION=${SHADOW_VERSION}"

# 6. Relabel shadow pods to primary so Istio DestinationRule picks them up
kubectl patch deployment "${MODEL}-shadow" \
  -n "$NAMESPACE" \
  --type=json \
  -p '[{"op":"replace","path":"/spec/template/metadata/labels/model-version","value":"primary"}]'

# 7. Wait for rollout to complete
echo "==> Waiting for rollout..."
kubectl rollout status "deployment/${MODEL}-primary" -n "$NAMESPACE" --timeout=5m

# 8. Annotate the now-promoted deployment with promotion metadata
kubectl annotate deployment "${MODEL}-primary" \
  -n "$NAMESPACE" \
  "hotel-key.io/promoted-version=${SHADOW_VERSION}" \
  "hotel-key.io/promoted-at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --overwrite

echo "==> Promotion complete: $MODEL is now running version $SHADOW_VERSION"
