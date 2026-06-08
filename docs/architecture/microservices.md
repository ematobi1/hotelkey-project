# Microservices Catalog

## Communication Patterns

- **Sync (REST):** Guest/staff-facing actions needing immediate response
- **Async (Kafka):** Side effects, notifications, projections, downstream workflows
- **Internal REST:** Direct service-to-service calls (not exposed through gateway), short-lived JWT auth

---

## Phase 1 Services

### auth-service (Port 3001)
**Responsibility:** Staff and guest authentication, JWT issuance, MFA, RBAC.

**Owns:**
- `staff` table (email, hashed password, role, tenant_id)
- `refresh_token` table
- `mfa_secret` table (TOTP seeds, encrypted at rest)
- `permission` table (role → permission mappings)

**Key Endpoints:**
```
POST   /v1/auth/login              Staff login → access + refresh tokens
POST   /v1/auth/refresh            Rotate refresh token
POST   /v1/auth/logout             Revoke refresh token
POST   /v1/auth/mfa/setup          Generate TOTP QR code
POST   /v1/auth/mfa/verify         Validate TOTP code → issue elevated token
POST   /v1/auth/guest/token        Issue short-lived guest token from reservation code
GET    /v1/auth/me                 Get current staff profile
```

**Internal Endpoints (not behind gateway):**
```
POST   /internal/auth/validate     Validate any JWT (called by gateway + other services)
```

**Events Published:** None (auth is a synchronous, read-heavy service)

**Events Consumed:** `hotel-key.staff.created` (onboards new staff with default permissions)

---

### guest-service (Port 3002)
**Responsibility:** Guest profiles, stay preferences, identity verification, GDPR data management.

**Owns:**
- `guest` table (core profile: name, email, phone, nationality, DID)
- `guest_preference` table (room type, floor, pillow type, dietary, etc.)
- `guest_document` table (passport numbers, encrypted with AWS KMS)
- `guest_stay_history` table (past reservations summary, for loyalty/personalisation)

**Key Endpoints:**
```
POST   /v1/guests                  Create guest profile
GET    /v1/guests/:id              Get guest (scoped to staff role)
PATCH  /v1/guests/:id              Update profile
DELETE /v1/guests/:id              GDPR erasure (soft-delete + anonymise)
GET    /v1/guests/:id/preferences  Get preferences
PUT    /v1/guests/:id/preferences  Upsert preferences
GET    /v1/guests/search           Search by name/email/phone
```

**Events Published:**
- `hotel-key.guest.created`
- `hotel-key.guest.updated`
- `hotel-key.guest.deleted` (triggers consent vault cleanup in Phase 2)

**Events Consumed:**
- `hotel-key.reservation.checked_out` → update stay history

---

### reservation-service (Port 3003)
**Responsibility:** The booking engine. Room availability, reservation lifecycle, rate application.

**Owns:**
- `reservation` table (guest_id, room_id, status, check_in, check_out, rate, source)
- `reservation_room` table (multi-room bookings)
- `rate_plan` table (BAR, member, corporate, OTA rates)
- `availability_block` table (holds, maintenance blocks, group allocations)

**Key Endpoints:**
```
GET    /v1/availability            Query available rooms by date range + type
POST   /v1/reservations            Create reservation (atomic — holds room)
GET    /v1/reservations/:id        Get reservation details
PATCH  /v1/reservations/:id        Modify (dates, room, add-ons)
DELETE /v1/reservations/:id        Cancel (applies cancellation policy)
POST   /v1/reservations/:id/check-in   Check-in guest → generate key token
POST   /v1/reservations/:id/check-out  Check-out → trigger billing finalization
GET    /v1/reservations            List (filterable by status, date, guest)
```

**Critical Consistency:** Room availability uses `SELECT ... FOR UPDATE SKIP LOCKED` in PostgreSQL to prevent double-booking. Redis distributed lock (Redlock) adds a second layer for concurrent API requests before the DB query.

**Events Published:**
- `hotel-key.reservation.created`
- `hotel-key.reservation.modified`
- `hotel-key.reservation.cancelled`
- `hotel-key.reservation.checked_in`
- `hotel-key.reservation.checked_out`
- `hotel-key.reservation.no_show`

**Events Consumed:**
- `hotel-key.room.maintenance_scheduled` → block room availability

---

### room-service (Port 3004)
**Responsibility:** Room inventory, real-time status, amenities, IoT sensor state.

**Owns:**
- `room` table (number, type, floor, wing, capacity, amenities, status)
- `room_type` table (name, description, base rate, max_occupancy)
- `room_status_log` table (TimescaleDB hypertable — all status transitions)
- `room_sensor_reading` table (TimescaleDB — temperature, motion, energy, water)
- `maintenance_ticket` table (issue, severity, assigned_to, resolved_at)

**Key Endpoints:**
```
GET    /v1/rooms                   List all rooms with current status
GET    /v1/rooms/:id               Get room details + current sensor state
PATCH  /v1/rooms/:id/status        Update room status (housekeeping, maintenance)
GET    /v1/rooms/:id/sensors       Get latest sensor readings
GET    /v1/rooms/:id/history       Status change history
POST   /v1/maintenance             Create maintenance ticket
PATCH  /v1/maintenance/:id         Update/resolve ticket
GET    /v1/room-types              List room types
```

**Events Published:**
- `hotel-key.room.status_changed` (clean, dirty, occupied, maintenance, out-of-order)
- `hotel-key.room.sensor_anomaly` (temperature spike, water leak, motion when vacant)
- `hotel-key.room.maintenance_scheduled`

**Events Consumed:**
- `hotel-key.reservation.checked_in` → set room status to `occupied`
- `hotel-key.reservation.checked_out` → set room status to `dirty`
- `hotel-key.iot.sensor_reading` (Phase 2) → update sensor state

---

### billing-service (Port 3005)
**Responsibility:** Guest folio (itemised bill), charge posting, payment processing, invoicing. PCI DSS scope — no card data stored; tokenised via Stripe.

**Owns:**
- `folio` table (reservation_id, guest_id, status: open/closed)
- `folio_line_item` table (description, amount, quantity, charge_type, posted_at)
- `payment` table (folio_id, provider, provider_ref, amount, status)
- `invoice` table (generated PDF metadata, storage URL)
- `idempotency_key` table (prevents double-charges on retries)

**Key Endpoints:**
```
GET    /v1/folios/:reservationId   Get guest folio
POST   /v1/folios/:reservationId/charges    Post a charge
DELETE /v1/folios/:reservationId/charges/:id  Void a charge (pre-checkout only)
POST   /v1/payments                Capture payment (Stripe PaymentIntent)
POST   /v1/payments/refund         Refund
GET    /v1/invoices/:reservationId Download invoice PDF
```

**Events Published:**
- `hotel-key.billing.charge_posted`
- `hotel-key.billing.payment_captured`
- `hotel-key.billing.folio_closed`
- `hotel-key.billing.refund_issued`

**Events Consumed:**
- `hotel-key.reservation.checked_out` → close folio, generate invoice
- `hotel-key.reservation.no_show` → apply no-show charge

---

### housekeeping-service (Port 3006)
**Responsibility:** Housekeeping task management, staff assignment, room inspection workflow.

**Owns:**
- `hk_task` table (room_id, type, status, assigned_to, due_at, completed_at)
- `hk_staff` table (name, shift, current_floor, status: available/busy)
- `hk_inspection` table (task_id, passed, notes, inspector_id)
- `hk_schedule` table (daily planned schedule per staff per shift)

**Task Types:** `departure_clean`, `stay_over_clean`, `turn_down`, `inspection`, `deep_clean`, `maintenance_prep`

**Key Endpoints:**
```
GET    /v1/housekeeping/tasks      List tasks (filterable by status, floor, staff)
POST   /v1/housekeeping/tasks      Create task manually
PATCH  /v1/housekeeping/tasks/:id  Update task (assign, start, complete)
GET    /v1/housekeeping/schedule   Today's planned schedule
GET    /v1/housekeeping/staff      List housekeeping staff + current status
POST   /v1/housekeeping/inspect    Submit room inspection result
```

**Events Published:**
- `hotel-key.housekeeping.task_created`
- `hotel-key.housekeeping.task_assigned`
- `hotel-key.housekeeping.task_completed`
- `hotel-key.housekeeping.room_inspected`

**Events Consumed:**
- `hotel-key.reservation.checked_out` → auto-create departure_clean task
- `hotel-key.reservation.checked_in` → confirm room is clean (if inspect pending)
- `hotel-key.room.maintenance_scheduled` → pause housekeeping for that room

---

### notification-service (Port 3007)
**Responsibility:** Outbound notifications via email (AWS SES), SMS (Twilio), push (FCM/APNs), and in-app.

**Owns:**
- `notification_log` table (recipient, channel, template, status, sent_at)
- `notification_preference` table (guest/staff opt-in/out per channel per type)
- `notification_template` table (Handlebars templates per language)

**Key Endpoints:**
```
POST   /v1/notifications/send      Send immediate notification
POST   /v1/notifications/schedule  Schedule future notification
GET    /v1/notifications/log       Delivery log
```

**This service is primarily event-driven — direct API calls are rare.**

**Events Consumed:**
- `hotel-key.reservation.created` → booking confirmation email
- `hotel-key.reservation.checked_in` → welcome push notification
- `hotel-key.reservation.checked_out` → survey + receipt email
- `hotel-key.housekeeping.task_assigned` → staff push notification
- `hotel-key.billing.payment_captured` → payment receipt
- `hotel-key.room.sensor_anomaly` → staff alert (fire, flood)

---

## Phase 2 Services (Months 12–24)

### iot-ingestion-service (Port 3008)
Receives MQTT messages from room sensors via AWS IoT Core → validates → writes to TimescaleDB → publishes `hotel-key.iot.sensor_reading` events to Kafka.

### consent-vault-service (Port 3009)
Manages guest data sharing consent on Hyperledger Fabric. Issues verifiable credentials, handles DID resolution, records every data access on the consent ledger.

### integration-service (Port 3010)
Adapter layer for third-party systems: POS terminals, smart locks (SALTO, Dormakaba), channel managers (SiteMinder, STAAH), PBX systems. Translates external events to CloudEvents and vice versa.

### event-mesh-service (Port 3011)
Developer-facing API for the open marketplace: topic subscription management, event schema browsing, webhook delivery for partners who cannot consume Kafka natively.

---

## Phase 3 Services (Months 24–36)

### ml-predictions-service (Port 3012)
FastAPI (Python) service. Serves housekeeping workload predictions, maintenance failure predictions, and staffing need forecasts. Models trained in MLflow, served as ONNX for consistent inference.

### genai-bi-service (Port 3013)
Natural language query engine. Uses Claude API for intent parsing + function calling to retrieve live data, run predictions, and generate plain-language answers with cited sources.

### digital-twin-service (Port 3014)
Real-time hotel simulation engine. Maintains a cached in-memory model of the hotel state. Exposes a "run simulation" endpoint for what-if scenarios. Backed by Redis for state, reads from Kafka streams.

### revenue-engine-service (Port 3015)
Autonomous pricing engine. Reads demand signals, runs reinforcement learning model, posts rate updates to room-service, and distributes via integration-service to OTA channels.
