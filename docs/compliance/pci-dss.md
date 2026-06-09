# PCI DSS SAQ-A-EP Compliance

## Scope

Hotel Key processes payments through Stripe. Card data never touches Hotel Key servers — guests enter card details directly in Stripe-hosted elements (Stripe.js). Hotel Key stores only the Stripe `PaymentMethod` token (e.g. `pm_xxx`), which is not itself cardholder data.

This qualifies Hotel Key for **SAQ-A-EP** (Self-Assessment Questionnaire A — E-commerce, Partially Outsourced).

---

## Architecture

```
Guest browser
  └─► Stripe.js (hosted fields — card number, CVC, expiry entered here)
        └─► Stripe servers (PCI DSS Level 1 certified)
              └─► PaymentIntent / PaymentMethod token returned to browser
                    └─► Hotel Key billing-service (receives token only)
                          └─► Stripe API (charge, capture, refund using token)
```

Card data never passes through Hotel Key's application servers or network.

---

## Controls in Place

### Requirement 1 — Network Security
- All public traffic enters via Kong OSS API Gateway (TLS 1.2+ enforced)
- Service-to-service traffic uses Istio mTLS (STRICT mode — plaintext refused)
- Kubernetes NetworkPolicy restricts pod-to-pod communication to declared service dependencies only
- No direct internet access to billing-service; Kong is the sole ingress

### Requirement 2 — Secure Defaults
- All container images pinned to specific digest hashes in CI
- No default/vendor passwords; all credentials sourced from AWS Secrets Manager / HashiCorp Vault at runtime
- Stripe API key loaded from environment; never stored in code or git history

### Requirement 3 — Cardholder Data Protection
- No card numbers, CVCs, or full PANs stored anywhere in Hotel Key databases
- `billing_line_item` and `payment` tables store: `stripe_payment_intent_id`, `stripe_payment_method_id` (tokens), amount, currency — no raw card data
- Database encryption at rest via AWS RDS encryption (AES-256)

### Requirement 4 — Encryption in Transit
- TLS 1.2 minimum enforced at Kong gateway
- All outbound calls to Stripe API use HTTPS (enforced by the official Stripe SDK)
- Istio mTLS encrypts all intra-cluster traffic

### Requirement 5 — Malware Protection
- Container images scanned with Trivy in CI before deployment
- Only official base images (node:20-alpine) used

### Requirement 6 — Secure Systems
- Stripe.js loaded only from `https://js.stripe.com` — enforced via Content-Security-Policy header
- CSP header: `script-src 'self' https://js.stripe.com`
- Stripe SDK updated to latest stable on each release cycle
- No custom payment processing code — all card tokenisation delegated to Stripe.js

### Requirement 7 — Access Control
- Stripe secret key accessible only to billing-service pod (Kubernetes Secret, vault-injected)
- Stripe restricted keys used where possible (write-only scope for charges)
- Stripe dashboard access requires MFA; access log reviewed quarterly

### Requirement 8 — Authentication
- Staff authentication requires MFA/TOTP (auth-service, enforced at login)
- JWT tokens have 15-minute TTL; refresh requires re-authentication
- Stripe webhook endpoint validates `Stripe-Signature` HMAC before processing any event

### Requirement 9 — Physical Access
- Cloud-hosted on AWS EKS; physical security delegated to AWS (PCI DSS Level 1 service provider)

### Requirement 10 — Logging and Monitoring
- All API requests logged via OpenTelemetry → Grafana Loki (structured JSON)
- Stripe webhook events logged with `stripe_event_id` for audit trail
- Logs retained 13 months (S3 lifecycle policy)
- Prometheus alerting on error rate spikes (SLO burn-rate alerts in `infra/monitoring/prometheus/rules/slo.yml`)

### Requirement 11 — Security Testing
- OWASP Top 10 penetration test — see `docs/security/owasp-audit.md`
- Dependency vulnerability scanning via `pnpm audit` in CI (blocks on high/critical)
- Container image scanning via Trivy in CI

### Requirement 12 — Security Policy
- Secrets rotation: Stripe API keys rotated every 90 days; documented in runbook
- Incident response: any suspected card data breach triggers immediate Stripe key rotation and AWS security team notification

---

## Annual Review

This document must be reviewed and attested annually by the engineering lead and signed off before each PCI compliance submission.

| Review Date | Reviewer | Notes |
|-------------|----------|-------|
| 2026-06-09  | Initial  | First SAQ-A-EP self-assessment |
