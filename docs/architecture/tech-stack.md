# Technology Stack

All decisions include explicit reasoning. Prefer open standards over vendor lock-in.

## Runtime & Language

| Layer | Technology | Version | Reason |
|---|---|---|---|
| Backend services | Node.js + TypeScript | Node 20 LTS, TS 5.x | Strong ecosystem for I/O-heavy services; pnpm monorepo tooling is excellent; team familiarity |
| ML services | Python + FastAPI | Python 3.11, FastAPI 0.110 | PyTorch/scikit ecosystem is unmatched for ML; FastAPI gives async HTTP with OpenAPI docs |
| Frontend | Next.js + TypeScript | Next.js 14 (App Router) | RSC reduces bundle size; built-in API routes useful for BFF pattern |
| Mobile (future) | React Native + Expo | RN 0.74 | Code-share with web components; Expo EAS for builds |

## Package Management & Build

- **pnpm 9 workspaces** — faster than npm/yarn, strict dependency isolation prevents phantom deps
- **Turborepo** — incremental builds across packages; cache-aware test runs
- **tsup** — fast ESM/CJS bundler for shared packages (uses esbuild under the hood)

## HTTP Framework

- **Fastify 4.x** — chosen over Express for built-in schema validation (JSON Schema → OpenAPI), 2× throughput, and structured logging. All services use Fastify.
- **@fastify/swagger** — auto-generates OpenAPI 3.1 docs from route schemas

## Databases

### PostgreSQL 16 + TimescaleDB
**Role:** Primary operational data — reservations, rooms, guests, billing, staff.

**Why PostgreSQL over alternatives:**
- Row-level security maps cleanly to multi-tenant schema isolation
- TimescaleDB extension handles IoT time-series without a separate DB
- JSONB columns for flexible schema areas (room amenities, guest preferences) without giving up relational integrity
- Aurora PostgreSQL for managed HA + global replication in production

**ORM / Query Builder:** `pg` (node-postgres) with raw SQL in repositories. No ORM — SQL is readable, debuggable, and performant. Migrations via `node-pg-migrate`.

### Redis 7
**Role:** Sessions, distributed locks (Redlock), rate limit counters, real-time room status cache, pub/sub for lightweight intra-service signals.

**Why Redis over Memcached:** Redis persistence (AOF) lets us recover session state after restarts; Streams can buffer events if Kafka is temporarily unreachable.

### MongoDB 7
**Role:** Append-only audit logs, event archive, unstructured documents (guest folio PDFs, contract blobs).

**Why MongoDB here (not everywhere):** Audit logs have variable structure and are write-heavy with rare reads. MongoDB's flexible schema and high write throughput fit this perfectly. Not used for operational data where relational consistency matters.

### Hyperledger Fabric 2.5
**Role:** Permissioned blockchain for guest consent ledger.

**Why permissioned over public chain:**
- 1,000+ TPS vs. Ethereum's ~15 TPS
- GDPR compliance: nodes can be operated within EU jurisdiction
- No gas fees; cost is predictable infrastructure
- Chaincode (Go) is auditable and upgradeable without forking

## Message Broker

### Apache Kafka (KRaft mode)
**Why Kafka:**
- At-least-once delivery with consumer group offsets — no message loss
- Log compaction for event sourcing patterns (room state log)
- 1M+ events/sec throughput headroom for future scale
- Confluent Schema Registry enforces Avro schemas — breaking changes are caught at deploy time, not runtime
- KRaft mode eliminates ZooKeeper dependency (simpler ops)

**Alternatives considered:**
- RabbitMQ — lower throughput ceiling, no log compaction, harder replay
- AWS SQS/SNS — vendor lock-in; no schema registry; limited consumer group semantics
- NATS JetStream — excellent performance but smaller ecosystem, fewer managed offerings

## API Gateway

### Kong OSS 3.x
**Why Kong:**
- Plugin ecosystem: JWT validation, rate limiting, request transformation, mTLS termination, OpenTelemetry
- Declarative config (deck) maps to GitOps
- Handles OTA partner traffic isolation via virtual hosts
- Self-hosted avoids per-request billing at scale

**Managed alternative for early stage:** AWS API Gateway (easier ops) — Kong migration path is documented when self-hosted becomes worthwhile.

## Service Mesh

### Istio 1.20
**Why Istio:**
- Automatic mTLS between all services without code changes
- Fine-grained AuthorizationPolicies (e.g., only billing-service can call payment endpoints)
- Distributed tracing via OpenTelemetry integration
- Traffic management for canary deploys of new service versions

**Overhead:** ~5–7ms per hop latency addition at p99. Acceptable given 200ms internal SLA budgets.

## Observability

| Tool | Role |
|---|---|
| OpenTelemetry SDK | Traces + metrics instrumented in every service |
| Prometheus | Metrics storage + alerting rules |
| Grafana | Dashboards, alerting UI |
| Grafana Loki | Log aggregation (structured JSON logs from Fastify) |
| Grafana Tempo | Distributed trace storage |
| Sentry | Error tracking + performance monitoring (frontend + backend) |

All services expose `/metrics` (Prometheus scrape) and `/health` (liveness + readiness).

## Infrastructure

| Tool | Role |
|---|---|
| AWS EKS | Managed Kubernetes (primary) |
| AWS Aurora PostgreSQL | Managed HA PostgreSQL |
| AWS ElastiCache | Managed Redis |
| AWS MSK | Managed Kafka (production; local dev uses Docker Kafka) |
| AWS S3 | Object storage (folio PDFs, room images, ML model artifacts) |
| AWS Secrets Manager | Runtime secrets |
| Terraform | Infrastructure as Code |
| Helm 3 | Kubernetes packaging |
| ArgoCD | GitOps continuous deployment |
| GitHub Actions | CI — lint, typecheck, test, build, push image |

## Security Libraries

| Library | Use |
|---|---|
| `jose` | JWT signing/verification (ES256 algorithm) |
| `argon2` | Password hashing (argon2id, stronger than bcrypt) |
| `zod` | Input validation at all boundaries |
| `helmet` (Fastify plugin) | HTTP security headers |
| `@fastify/rate-limit` | Per-IP and per-tenant rate limiting |
| Istio mTLS | Service-to-service transport security |
| AWS KMS | Encryption key management for at-rest data |

## ML Stack (Phase 3)

| Tool | Role |
|---|---|
| PyTorch 2.x | Model training (LSTM for time-series, RL for revenue engine) |
| scikit-learn | Feature engineering, preprocessing pipelines |
| MLflow | Experiment tracking, model registry, A/B testing |
| FastAPI | ML model serving (REST inference endpoints) |
| ONNX | Model export format for cross-runtime serving |
| Celery + Redis | Async ML inference tasks and scheduled retraining |
| Apache Airflow | ML pipeline orchestration (ETL → train → evaluate → deploy) |

## Frontend Stack

| Tool | Role |
|---|---|
| Next.js 14 | Management dashboard (App Router, RSC) |
| TypeScript 5 | Strict types across all frontend code |
| Tailwind CSS 3 | Utility-first styling |
| shadcn/ui | Accessible component library (Radix primitives) |
| Zustand | Client-side state (lightweight, no Redux boilerplate) |
| TanStack Query v5 | Server state, caching, background refetch |
| Recharts | Data visualisation (occupancy, revenue charts) |
| React Hook Form + Zod | Form validation (shared schemas with backend) |
