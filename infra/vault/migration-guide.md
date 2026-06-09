# Kubernetes Secrets → Vault Migration Guide

## Overview

This guide covers migrating all Hotel Key service secrets from Kubernetes Secrets to HashiCorp Vault KV v2, enabling centralized secret management with dynamic short-lived credentials and full audit logging.

## Prerequisites

- Vault cluster initialized, unsealed, and configured via `setup.sh`
- `vault` CLI available and authenticated (`VAULT_TOKEN` set)
- `kubectl` configured against the target cluster
- All services running and healthy before starting

---

## Step 1 — Export Existing Kubernetes Secrets

Export all secrets from the `hotel-key` namespace for inspection. Do not write this output to disk in plain text; pipe it directly:

```bash
kubectl get secret -n hotel-key -o yaml
```

To list only hotel-key application secrets (excluding service account tokens):

```bash
kubectl get secret -n hotel-key \
  --field-selector type=Opaque \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}'
```

---

## Step 2 — Write Each Secret to Vault KV

For each service, write its secrets into the Vault KV path `secret/hotel-key/<service>/config`.

General form:

```bash
vault kv put secret/hotel-key/<service>/config \
  DATABASE_URL="<value>" \
  KAFKA_BROKERS="<value>" \
  <KEY>="<value>"
```

Per-service examples:

```bash
# auth-service
vault kv put secret/hotel-key/auth-service/config \
  DATABASE_URL="postgresql://auth:password@postgres:5432/auth_db" \
  JWT_SECRET="<rotate-this-after-migration>" \
  REDIS_URL="redis://redis:6379/0"

# guest-service
vault kv put secret/hotel-key/guest-service/config \
  DATABASE_URL="postgresql://guest:password@postgres:5432/guest_db" \
  KAFKA_BROKERS="kafka:9092"

# reservation-service
vault kv put secret/hotel-key/reservation-service/config \
  DATABASE_URL="postgresql://reservation:password@postgres:5432/reservation_db" \
  KAFKA_BROKERS="kafka:9092"

# room-service
vault kv put secret/hotel-key/room-service/config \
  DATABASE_URL="postgresql://room:password@postgres:5432/room_db" \
  KAFKA_BROKERS="kafka:9092"

# billing-service
vault kv put secret/hotel-key/billing-service/config \
  DATABASE_URL="postgresql://billing:password@postgres:5432/billing_db" \
  STRIPE_SECRET_KEY="<rotate-this-after-migration>" \
  KAFKA_BROKERS="kafka:9092"

# housekeeping-service
vault kv put secret/hotel-key/housekeeping-service/config \
  DATABASE_URL="postgresql://housekeeping:password@postgres:5432/housekeeping_db" \
  KAFKA_BROKERS="kafka:9092"

# maintenance-service
vault kv put secret/hotel-key/maintenance-service/config \
  DATABASE_URL="postgresql://maintenance:password@postgres:5432/maintenance_db" \
  KAFKA_BROKERS="kafka:9092"

# notification-service
vault kv put secret/hotel-key/notification-service/config \
  SENDGRID_API_KEY="<rotate-this-after-migration>" \
  TWILIO_AUTH_TOKEN="<rotate-this-after-migration>" \
  KAFKA_BROKERS="kafka:9092"

# pms-service
vault kv put secret/hotel-key/pms-service/config \
  DATABASE_URL="postgresql://pms:password@postgres:5432/pms_db" \
  KAFKA_BROKERS="kafka:9092"

# lock-service
vault kv put secret/hotel-key/lock-service/config \
  LOCK_HARDWARE_API_KEY="<rotate-this-after-migration>" \
  KAFKA_BROKERS="kafka:9092"

# channel-manager-service
vault kv put secret/hotel-key/channel-manager-service/config \
  OTA_API_KEY="<rotate-this-after-migration>" \
  KAFKA_BROKERS="kafka:9092"
```

Write shared config used by all services:

```bash
vault kv put secret/hotel-key/shared/kafka \
  KAFKA_BROKERS="kafka.hotel-key.svc.cluster.local:9092" \
  SCHEMA_REGISTRY_URL="http://schema-registry.hotel-key.svc.cluster.local:8081"
```

---

## Step 3 — Update Deployments with Vault Agent Annotations

Add the following annotation block to the `spec.template.metadata.annotations` section of each service Deployment. Replace `<service-name>` with the actual service name.

```yaml
annotations:
  vault.hashicorp.com/agent-inject: "true"
  vault.hashicorp.com/role: "<service-name>"
  vault.hashicorp.com/agent-inject-secret-config: "secret/data/hotel-key/<service-name>/config"
  vault.hashicorp.com/agent-inject-template-config: |
    {{- with secret "secret/data/hotel-key/<service-name>/config" -}}
    DATABASE_URL={{ .Data.data.DATABASE_URL }}
    KAFKA_BROKERS={{ .Data.data.KAFKA_BROKERS }}
    {{- end }}
```

The Vault Agent sidecar will write the rendered template to `/vault/secrets/config` inside the pod. Update each service's startup to source this file:

```bash
# In the container command or entrypoint wrapper
source /vault/secrets/config
```

Or reference the file directly in the container environment using a shell wrapper script as the container entrypoint.

Apply the updated Deployments one service at a time and verify each is healthy before proceeding to the next:

```bash
kubectl rollout status deployment/<service-name> -n hotel-key
```

---

## Step 4 — Remove Kubernetes Secret Objects

After all Deployments are updated, verified healthy, and reading secrets from Vault, delete the old Kubernetes Secrets:

```bash
for service in auth-service guest-service reservation-service room-service billing-service \
               housekeeping-service maintenance-service notification-service pms-service \
               lock-service channel-manager-service; do
  kubectl delete secret "${service}-config" -n hotel-key --ignore-not-found
done
```

Verify no pods are referencing old secrets via `envFrom` or `volumes`:

```bash
kubectl get deployments -n hotel-key -o yaml | grep -i "secretKeyRef\|secretName"
```

The output should be empty after cleanup.

---

## Step 5 — Rotate All Credentials After Migration

Immediately after removing the old Kubernetes Secrets, rotate every credential that was migrated. This ensures the old values (which existed in etcd and may appear in audit logs or backups) are no longer valid.

Rotation checklist:

- [ ] PostgreSQL passwords — run `ALTER USER ... PASSWORD '...'` per database user
- [ ] JWT signing secret — generate a new 256-bit random key and write to Vault; trigger a rolling restart of auth-service
- [ ] Stripe secret key — regenerate in the Stripe dashboard
- [ ] SendGrid API key — regenerate in the SendGrid dashboard
- [ ] Twilio auth token — regenerate in the Twilio console
- [ ] OTA/channel manager API key — contact the OTA provider
- [ ] Lock hardware API key — contact the hardware vendor
- [ ] Any other third-party credentials present in the original secrets

Write each rotated credential back to Vault using `vault kv put` (see Step 2 for the path structure), then trigger rolling restarts to pick up the new values:

```bash
kubectl rollout restart deployment/<service-name> -n hotel-key
```

Verify Vault audit logs show all expected read operations and no unexpected access:

```bash
vault audit list
```
