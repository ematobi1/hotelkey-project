# Hotel Key

Next-generation hotel management platform. Cloud-native, microservices, zero-trust security, AI-powered operations.

**Status:** Phase 1 — Core Engine (active development)

## Quick Start

```bash
# Prerequisites: Node.js 20+, pnpm 9+, Docker Desktop
git clone <repo>
cd hotel-key
pnpm install
docker compose -f docker-compose.infra.yml up -d
pnpm dev
```

API docs available at `http://localhost:3000/v1/docs` after startup.

## Documentation

| Document | Description |
|---|---|
| [System Overview](docs/architecture/overview.md) | High-level architecture and service map |
| [Microservices](docs/architecture/microservices.md) | All services, responsibilities, APIs |
| [Data Models](docs/architecture/data-models.md) | Core entities and DB schemas |
| [API Mesh](docs/architecture/api-mesh.md) | Universal API Mesh and CloudEvents spec |
| [Security](docs/architecture/security.md) | Zero-trust, blockchain vault, mTLS |
| [AI/ML](docs/architecture/ai-ml.md) | Predictive engine, GenAI BI, revenue engine |
| [Digital Twin](docs/architecture/digital-twin.md) | Real-time hotel simulation |
| [Tech Stack](docs/architecture/tech-stack.md) | Technology decisions and rationale |
| [KPIs](docs/kpis.md) | Performance targets and SLAs |
| [Phase 1 Plan](docs/phases/phase-1-core.md) | Months 0–12 milestones |
| [Phase 2 Plan](docs/phases/phase-2-mesh-security.md) | Months 12–24 milestones |
| [Phase 3 Plan](docs/phases/phase-3-ai-autonomy.md) | Months 24–36 milestones |
| [Event Schemas](docs/schemas/events.md) | CloudEvents JSON/Avro schemas |
| [DB Schemas](docs/schemas/database.md) | Table definitions and migration notes |

## Services

| Service | Port | Description |
|---|---|---|
| api-gateway | 3000 | Kong-based public gateway |
| auth-service | 3001 | JWT issuance, MFA, staff identity |
| guest-service | 3002 | Guest profiles, preferences, DID |
| reservation-service | 3003 | Booking engine, availability, calendar |
| room-service | 3004 | Room inventory, status, IoT events |
| billing-service | 3005 | Invoicing, payment, PCI scope |
| housekeeping-service | 3006 | Task assignment, scheduling |
| notification-service | 3007 | Email, SMS, push, in-app |

## License

Proprietary — Hotel Key Pty Ltd.
