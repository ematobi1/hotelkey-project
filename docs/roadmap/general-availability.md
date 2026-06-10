# General Availability Roadmap — Months 36–54

## Executive Summary

Hotel Key exits beta and enters General Availability (GA) in a phased sequence between Month 36 and Month 54. The strategy prioritizes revenue diversification (short-term rentals), geographic expansion (three AWS regions), and scale milestones (1,000 → 10,000 hotels) with a white-label offering and API monetization tiers unlocking in the second half of this window.

---

## Milestone Timeline

### Month 36 — GA Launch + Short-Term Rental Vertical Begins
- **Core PMS GA**: All Phase 1 services (auth, guest, reservation, room, billing, housekeeping, notification) declared production-stable after 6-month beta with design partners
- **SLA committed**: 99.9% monthly uptime per tenant (measured at API gateway), with contractual credits for violations
- **Short-term rental vertical kickoff**: Booking engine adapts to nightly/weekly pricing, flexible check-in windows, and cleaning-fee line items. Vrbo/Airbnb channel manager integration begins development.
- **Pricing-service GA**: Autonomous pricing engine (Milestone 3.5) exits beta; PPO agent enabled by default for new signups with a 14-day human-review shadow mode

### Month 38 — All Autonomous Features GA
- **Autonomous commercial engine fully GA**: RL pricing, demand signal polling, and circuit-breaker guardrails production-ready across all tenants
- **Autonomous housekeeping scheduling GA**: ML-optimized room assignment based on occupancy patterns and staff shift data
- **Autonomous upsell engine GA**: ML-ranked upsell offers (room upgrades, F&B packages) served at check-in via notification-service
- **Compliance**: SOC 2 Type II report issued covering all autonomous decision systems; audit trail stored in MongoDB with 7-year retention

### Month 40 — Post-Quantum Crypto Migration Complete
- All TLS connections and JWT signing migrated to ML-KEM + ML-DSA (see `post-quantum-cryptography.md`)

### Month 42 — Short-Term Rental GA + 1,000 Hotels
- **Short-term rental vertical GA**: Full Airbnb/Vrbo/Booking.com two-way sync, owner payout accounting, dynamic cleaning-fee rules
- **Scale milestone: 1,000 hotels** under management across all tiers
- **Multi-region active/active**: Traffic routed across `us-east-1`, `eu-west-1`, and `ap-southeast-1` based on tenant home region; cross-region replication for disaster recovery with RPO < 1 minute, RTO < 5 minutes

### Month 48 — White-Label Offering GA
- **White-label PMS**: Channel partners (hospitality groups, franchise operators) can deploy Hotel Key under their own brand with custom domain, color system, and logo
- White-label tenants managed via a new `partner-service` that isolates branding config from core PMS logic
- Partner billing: usage-based invoicing for white-label seats, API calls, and storage passed through to the partner's own pricing model

### Month 54 — 10,000 Hotels + API Monetization
- **Scale milestone: 10,000 hotels** under management
- **API monetization tiers** (see below) fully operational
- **Marketplace launch**: Third-party integrations (spa management, restaurant POS, CRM) available through a Hotel Key app marketplace; revenue share with integration partners

---

## Multi-Region Deployment

### Regions

| Region | AWS Region | Purpose |
|--------|-----------|---------|
| US East | `us-east-1` | Primary for North America; global control plane |
| EU West | `eu-west-1` | GDPR data residency for EU tenants; sovereign data boundary |
| APAC | `ap-southeast-1` | APAC tenants; low-latency for Southeast Asia + Australia |

### Architecture

- **Tenant home region**: Each tenant's data is mastered in their elected region. Reservations, guest profiles, and billing records are written to and read from the home region by default.
- **Global services**: auth-service and the pricing model registry run in `us-east-1` as the global control plane; tokens and model artifacts are replicated read-only to other regions.
- **Data replication**: PostgreSQL uses logical replication for cross-region replicas. The EU replica is write-isolated (GDPR: EU data cannot flow to non-EU regions without consent).
- **DNS failover**: Route 53 health checks with a 10-second TTL; automatic failover to the nearest healthy region if a region's API gateway health check fails for 30 consecutive seconds.
- **Kafka**: Each region runs an independent Kafka cluster (KRaft mode). Cross-region event mirroring via MirrorMaker 2 for analytics aggregation only; not in the transactional write path.

### Latency Targets (p99)

| Operation | Target |
|-----------|--------|
| Reservation create (same-region) | < 200 ms |
| Pricing recommendation | < 150 ms |
| Check-in (room assignment + key issuance) | < 500 ms |
| Cross-region read (replicated data) | < 400 ms |

---

## API Monetization Tiers

### Tier 0 — Free (Developer / Sandbox)
- 10,000 API calls per month
- Sandbox environment only (no production data)
- Rate limit: 10 req/s
- Support: community forum

### Tier 1 — Starter ($99/month per property)
- 500,000 API calls per month; $0.0002 per call overage
- All core PMS endpoints
- Rate limit: 100 req/s
- Support: email, 48-hour SLA

### Tier 2 — Professional ($299/month per property)
- 5,000,000 API calls per month; $0.00015 per call overage
- All Tier 1 endpoints + autonomous pricing API + analytics endpoints
- Webhooks for reservation events (CloudEvents format)
- Rate limit: 500 req/s
- Support: Slack shared channel, 8-hour SLA

### Tier 3 — Enterprise (custom pricing)
- Unlimited API calls (subject to fair-use policy)
- All endpoints including raw data export, white-label SDK, and custom ML model deployment
- Dedicated infrastructure option (single-tenant EKS cluster)
- SLA: 99.95% uptime with financial credits
- Rate limit: negotiated (default 2,000 req/s per tenant)
- Support: dedicated customer success manager, 1-hour critical SLA

### Revenue Attribution
- API call counts tracked per `X-API-Key` header in Kong gateway; events streamed to billing-service via Kafka topic `hotel-key.api-usage.recorded`
- Monthly invoices generated automatically; Stripe subscription handles recurring billing
- Usage dashboards available to tenants in the management portal (Month 42+)

---

## Short-Term Rental Vertical

### Differentiators vs. Guesty / Lodgify
- Unified PMS: hotels and STR properties managed in a single platform with shared guest profiles and loyalty programs
- RL pricing agent: same autonomous pricing engine used for hotels applied to STR nightly rates, accounting for platform fees and cleaning costs in the RevPAR calculation
- Direct booking engine: commission-free direct bookings with channel sync to OTAs as a fallback

### Channel Integrations (Month 36–42)
| Channel | Integration | Status |
|---------|------------|--------|
| Airbnb | Open API (OAuth2) | Month 36 |
| Vrbo/HomeAway | Partner API | Month 37 |
| Booking.com | Connectivity API | Month 38 |
| Google Vacation Rentals | Hotels API | Month 40 |
| Expedia | EQC API | Month 42 |

### Key STR-Specific Features
- Flexible check-in windows (not fixed 3 PM hotel check-in)
- Per-stay cleaning fee line item with owner-vs-guest split configuration
- Owner payout accounting: gross booking revenue minus platform fees, cleaning costs, and management commission → net owner transfer via Stripe Connect
- Minimum/maximum stay restrictions configurable per season
- Smart lock integration (August, Schlage) for keyless self-check-in

---

## Scale Architecture (10,000 Hotels)

At 10,000 hotels (assumed average 80 rooms, 2.5 reservations/room/month), the platform processes approximately 2,000,000 reservations per month and sustains a peak write rate of ~500 reservations per second during major booking surges.

### Key Scaling Changes vs. Month 0
- **Reservation-service**: Horizontally sharded PostgreSQL (by `tenant_id` hash); each shard handles ~500 tenants. Citus or Aurora Limitless evaluated at Month 42.
- **Pricing-service**: One Ray cluster per region; model inference stateless and horizontally scaled via Kubernetes HPA on CPU utilization.
- **Kafka**: Partition count scaled from 12 to 192 across 6 brokers per region; consumer group lag monitored via Prometheus `kafka_consumer_lag_sum`.
- **Redis**: Cluster mode with 6 shards per region; keyspace used for rate-limit counters, session tokens, and pricing signal cache.
- **Observability**: Grafana dashboards segmented by region, tier, and service; Loki log volume capped per tenant to prevent noisy-neighbor log floods.
