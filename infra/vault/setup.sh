#!/usr/bin/env bash
# Run after vault operator init and unseal
set -euo pipefail

export VAULT_ADDR="${VAULT_ADDR:-https://vault.hotel-key.svc.cluster.local:8200}"
export VAULT_TOKEN="${VAULT_TOKEN:?VAULT_TOKEN must be set}"

# Enable KV v2
vault secrets enable -path=secret kv-v2

# Enable Transit for PII encryption
vault secrets enable transit
vault write -f transit/keys/hotel-key-pii type=aes256-gcm96

# Enable Kubernetes auth
vault auth enable kubernetes
vault write auth/kubernetes/config \
  kubernetes_host="https://$KUBERNETES_PORT_443_TCP_ADDR:443"

# Write policies
vault policy write hotel-key-service /vault/policies/hotel-key-service.hcl
vault policy write vault-service /vault/policies/vault-service.hcl

# Bind each service SA to the policy
for service in auth-service guest-service reservation-service room-service billing-service \
               housekeeping-service maintenance-service notification-service pms-service \
               lock-service channel-manager-service; do
  vault write auth/kubernetes/role/$service \
    bound_service_account_names=$service \
    bound_service_account_namespaces=hotel-key \
    policies=hotel-key-service \
    ttl=1h
done

# vault-service gets extended policy
vault write auth/kubernetes/role/vault-service \
  bound_service_account_names=vault-service \
  bound_service_account_namespaces=hotel-key \
  policies=vault-service \
  ttl=1h

echo "Vault configured successfully"
