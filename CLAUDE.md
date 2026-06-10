# Project Hotel Key — CLAUDE.md

## Project Overview
Hotel Key is a next-generation, cloud-native hotel management platform (PMS) built as a TypeScript/Node.js microservices monorepo. It is designed to outcompete Oracle Opera, Cloudbeds, and Mews through superior automation, security, and AI capabilities.

## Repository Structure
```
hotel-key/
├── packages/          # Shared libraries (types, config, logger, kafka)
├── services/          # Individual microservices
│   ├── auth-service
│   ├── guest-service
│   ├── reservation-service
│   ├── room-service
│   ├── billing-service
│   ├── housekeeping-service
│   └── notification-service
├── docs/              # Architecture and design documentation
│   ├── architecture/
│   ├── phases/
│   └── schemas/
└── infra/             # Kubernetes manifests, Terraform, Helm charts
```

## Tech Stack
- **Runtime**: Node.js 20 LTS, TypeScript 5.x (strict mode)
- **ML Services**: Python 3.11 + FastAPI + PyTorch/MLflow
- **Frontend**: Next.js 14 (App Router) + TypeScript
- **Package Manager**: pnpm 9 with workspaces
- **Build System**: Turborepo
- **Message Broker**: Apache Kafka (KRaft mode, no ZooKeeper)
- **Primary DB**: PostgreSQL 16 (TimescaleDB extension for IoT)
- **Cache**: Redis 7 (Valkey-compatible)
- **Document Store**: MongoDB 7 (audit logs, event archives)
- **API Gateway**: Kong OSS 3.x
- **Service Mesh**: Istio 1.20 (mTLS enforced)
- **Container**: Docker + Kubernetes (AWS EKS)
- **Blockchain**: Hyperledger Fabric 2.5 (permissioned)
- **Observability**: OpenTelemetry + Prometheus + Grafana + Loki
- **CI/CD**: GitHub Actions + ArgoCD

## Coding Rules (project-specific)

### TypeScript
- `strict: true` in every tsconfig — no exceptions
- No `any` type without an inline `// reason:` comment
- All domain errors must extend a typed `AppError` base class
- Use `zod` for all external input validation (API requests, Kafka messages, env vars)
- Prefer `Result<T, E>` pattern (neverthrow library) over thrown exceptions in domain logic

### Service Layout (every microservice follows this)
```
src/
├── app.ts           # Express/Fastify app factory (no side effects at import time)
├── server.ts        # Entry point — calls app.ts, starts listener
├── config.ts        # zod-validated env vars, exported as typed `config` object
├── routes/          # Route handlers (thin: validate → call service → respond)
├── services/        # Business logic
├── repositories/    # DB access only — no business logic
├── domain/          # Types, value objects, domain errors
├── events/          # Kafka producers and consumers
└── __tests__/       # Co-located unit + integration tests
```

### API Design
- All routes versioned under `/v1/`
- Follow REST conventions from `rules/api.md`
- Every response is JSON; list responses use `{ data: [], meta: { total } }` shape
- Errors always return `{ error: { code, message, fields? } }` shape

### Database
- All migrations in `src/db/migrations/` using `node-pg-migrate` format
- No `SELECT *` — always list columns
- All writes through repository layer — never raw SQL in service files
- Every migration is reversible (up/down)

### Events (Kafka / CloudEvents)
- All Kafka messages conform to CloudEvents 1.0 spec
- Event type naming: `{domain}.{entity}.{past-tense-verb}` (e.g., `hotel-key.reservation.created`)
- Schemas defined in `docs/schemas/events.md` and enforced via Confluent Schema Registry (Avro)
- Every consumer must be idempotent — use `event_id` for deduplication

### Testing
- Unit tests: Vitest (co-located, `.test.ts`)
- Integration tests: Vitest with testcontainers (real PostgreSQL + Redis)
- E2E tests: Playwright (frontend), Supertest (API)
- Minimum coverage: 80% per service (CI enforced)
- Never mock the database in integration tests

### Security
- No secrets in code or `.env` files committed to git
- Use AWS Secrets Manager / HashiCorp Vault for runtime secrets
- All inter-service calls use short-lived JWT tokens (15 min TTL) issued by auth-service
- mTLS enforced at the Istio layer for all service-to-service traffic
- Rate limiting at Kong gateway for all public endpoints

### Git
- Branch: `feature/`, `fix/`, `chore/` prefixes
- Commits: imperative mood, present tense ("Add room status endpoint")
- One service change per commit where possible
- Never commit `.env`, `node_modules`, build artifacts

## Running Locally
```bash
# Start infrastructure (Postgres, Redis, Kafka, MongoDB)
docker compose -f docker-compose.infra.yml up -d

# Install deps
pnpm install

# Run all services (dev mode with hot reload)
pnpm dev

# Run a single service
pnpm --filter reservation-service dev

# Run tests
pnpm test

# Type check everything
pnpm typecheck
```

## Phase 1 Scope (Months 0–12)
Focus ONLY on these services and features:
- auth-service, guest-service, reservation-service, room-service, billing-service, housekeeping-service, notification-service
- REST APIs for all core entities
- PCI-compliant payment (Stripe)
- MFA for staff (TOTP)
- Basic task automation (auto-post charges on checkout)

Do NOT implement Phase 2/3 features (Kafka mesh, blockchain, AI) until Phase 1 is complete and tested.
