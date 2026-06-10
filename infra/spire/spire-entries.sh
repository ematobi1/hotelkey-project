#!/usr/bin/env bash
set -euo pipefail

SPIRE_SERVER_POD=$(kubectl get pod -n spire -l app=spire-server -o jsonpath='{.items[0].metadata.name}')

for service in auth-service guest-service reservation-service room-service billing-service \
               housekeeping-service maintenance-service notification-service pms-service \
               lock-service channel-manager-service; do
  kubectl exec -n spire "$SPIRE_SERVER_POD" -- \
    /opt/spire/bin/spire-server entry create \
    -spiffeID "spiffe://hotel-key.internal/ns/hotel-key/sa/${service}" \
    -parentID "spiffe://hotel-key.internal/k8s-psat/hotel-key-cluster/node" \
    -selector "k8s:ns:hotel-key" \
    -selector "k8s:sa:${service}"
done

echo "All SPIRE entries registered"
