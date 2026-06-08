# System Architecture Overview

## Vision
Hotel Key is a multi-tenant, cloud-native hotel management platform designed for 20–10,000+ room properties. It replaces fragmented legacy PMS systems with a unified, event-driven platform where every operational signal (IoT, booking, staff action) flows through a central event mesh and powers intelligent automation.

## High-Level Architecture

```mermaid
graph TB
    subgraph Clients["Client Layer"]
        WEB[Web Dashboard<br/>Next.js 14]
        MOB[Mobile App<br/>React Native]
        KIO[Kiosk App<br/>Electron]
        EXT[External Partners<br/>OTA / GDS / POS]
    end

    subgraph Gateway["API Gateway Layer"]
        KONG[Kong Gateway<br/>Rate Limiting · Auth · Routing]
    end

    subgraph CoreServices["Core Services (Phase 1)"]
        AUTH[auth-service<br/>JWT · MFA · RBAC]
        GUEST[guest-service<br/>Profiles · Preferences]
        RES[reservation-service<br/>Booking · Availability]
        ROOM[room-service<br/>Inventory · Status]
        BILL[billing-service<br/>Invoicing · Payments]
        HK[housekeeping-service<br/>Tasks · Scheduling]
        NOTIF[notification-service<br/>Email · SMS · Push]
    end

    subgraph MeshLayer["Event Mesh (Phase 2)"]
        KAFKA[Apache Kafka<br/>CloudEvents · Schema Registry]
        IOT[iot-ingestion-service<br/>MQTT · Sensor Data]
        INT[integration-service<br/>POS · Locks · Channel Mgr]
        CONSENT[consent-vault-service<br/>Hyperledger Fabric]
    end

    subgraph AILayer["Intelligence Layer (Phase 3)"]
        PRED[ml-predictions-service<br/>Housekeeping · Maintenance]
        GENAI[genai-bi-service<br/>NL Query · Forecasting]
        TWIN[digital-twin-service<br/>Simulation · What-if]
        REV[revenue-engine-service<br/>Autonomous Pricing]
    end

    subgraph DataLayer["Data Layer"]
        PG[(PostgreSQL 16<br/>Core PMS Data)]
        TS[(TimescaleDB<br/>IoT Time-Series)]
        REDIS[(Redis 7<br/>Cache · Sessions)]
        MONGO[(MongoDB 7<br/>Audit Logs)]
        FABRIC[(Hyperledger Fabric<br/>Consent Ledger)]
    end

    Clients --> KONG
    KONG --> CoreServices
    CoreServices --> KAFKA
    CoreServices --> PG
    CoreServices --> REDIS
    KAFKA --> MeshLayer
    KAFKA --> AILayer
    IOT --> TS
    CONSENT --> FABRIC
    MeshLayer --> DataLayer
    AILayer --> DataLayer
```

## Tenancy Model
Each hotel property (tenant) is isolated via:
- **Database**: Separate PostgreSQL schema per tenant (schema-per-tenant)
- **Kafka**: Topic naming prefix: `{tenant-id}.{event-type}`
- **Auth**: JWT claims include `tenantId`; all repository queries filter by it
- **API**: Subdomain routing: `{hotel-slug}.hotelkey.io/v1/`

This avoids the overhead of full database-per-tenant while keeping data isolation strong enough for compliance. Migration to DB-per-tenant for enterprise customers is a future option.

## Request Flow — Guest Check-In

```mermaid
sequenceDiagram
    participant G as Guest (Mobile)
    participant GW as Kong Gateway
    participant A as auth-service
    participant R as reservation-service
    participant Ro as room-service
    participant K as Kafka
    participant HK as housekeeping-service
    participant N as notification-service

    G->>GW: POST /v1/check-in { reservationId, guestToken }
    GW->>A: Validate JWT + rate limit
    A-->>GW: 200 OK (claims: guestId, tenantId)
    GW->>R: POST /internal/reservations/{id}/check-in
    R->>Ro: PATCH /internal/rooms/{roomId}/status → occupied
    Ro-->>R: 200 OK
    R->>K: Publish hotel-key.reservation.checked_in
    R-->>GW: 200 OK { roomNumber, keyToken }
    GW-->>G: 200 OK { roomNumber, mobileKey }
    K->>HK: Consume hotel-key.reservation.checked_in
    HK->>HK: Schedule pre-departure task for checkout date
    K->>N: Consume hotel-key.reservation.checked_in
    N->>G: Push: "Welcome! Your room is ready."
```

## Key Architectural Decisions

### 1. Synchronous vs. Asynchronous
- **Synchronous (REST)**: Guest-facing operations that need immediate confirmation (check-in, booking, payment). Timeout: 5s max.
- **Asynchronous (Kafka)**: All downstream side effects (housekeeping tasks, notifications, audit logs, IoT processing). Never block a guest request on a side effect.

### 2. Data Ownership
Each service owns its data exclusively. Cross-service data access is via:
- API call (for real-time, consistent reads)
- Event subscription (for eventually consistent read models / projections)

No direct cross-service database queries — ever.

### 3. Consistency Model
| Operation | Model | Mechanism |
|---|---|---|
| Room availability check | Strong | PostgreSQL `SELECT ... FOR UPDATE` |
| Reservation creation | Strong | Distributed lock via Redis + DB transaction |
| Housekeeping task creation | Eventual | Kafka event from reservation-service |
| Billing ledger balance | Strong | PostgreSQL transactions with idempotency keys |
| IoT sensor state | Eventual | TimescaleDB append-only, last-value cache in Redis |

### 4. Offline Operation
When a hotel loses internet connectivity, critical operations must still work:
- **Local edge node**: A lightweight Docker container runs on-premises with room-service and auth-service snapshots.
- **Sync queue**: All operations performed offline are queued in a local SQLite WAL.
- **Reconciliation**: On reconnect, the edge node replays the queue to the central cluster with conflict detection (last-write-wins for non-financial data; manual review for billing conflicts).

### 5. Multi-Region Deployment
- Active-active in two AWS regions (us-east-1 primary, eu-west-1 secondary for GDPR)
- PostgreSQL: Aurora Global Database (< 1s cross-region replication lag)
- Kafka: Confluent Mirror Maker 2 for cross-region event replication
- Redis: ElastiCache Global Datastore
