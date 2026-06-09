# Hotel Key — Partner Sandbox

This sandbox provides a fully seeded, isolated Hotel Key environment for third-party integrators and partner developers to test against without touching production data.

## Prerequisites

- Docker Desktop 24+ (or Docker Engine + Compose plugin)
- 4 GB free RAM, 10 GB free disk
- Ports 5433, 6380, 8000, 8001, 9095 available on your machine

## Starting the Sandbox

```bash
docker compose -f infra/sandbox/docker-compose.sandbox.yml up -d
```

Wait ~30 seconds for all services to become healthy, then verify:

```bash
docker compose -f infra/sandbox/docker-compose.sandbox.yml ps
```

All services should show `healthy` or `Up`.

## API Base URL

All REST traffic goes through the Kong API Gateway:

```
http://localhost:8000/v1
```

Example:

```bash
curl http://localhost:8000/v1/reservations
```

## Pre-seeded Test Data

| Resource     | Count | Details                                                      |
|--------------|-------|--------------------------------------------------------------|
| Tenants      | 5     | Grand Palace, Ocean View, Mountain Lodge, City Center, Airport Express |
| Rooms        | 50    | 10 rooms per hotel, floors 1–3, mixed statuses               |
| Guests       | 20    | Realistic names, international phone numbers and nationalities |
| Reservations | 30    | Mix of `confirmed`, `checked_in`, `checked_out`, `cancelled` |

All seed UUIDs are deterministic (fixed) so your tests can reference specific resources by ID without querying first. See `seed.sql` for the full list.

## Test Credentials

| Service   | Value                                                   |
|-----------|---------------------------------------------------------|
| Postgres  | host=`localhost:5433`, user=`hotel_key_sandbox`, pass=`sandbox_pass`, db=`hotel_key` |
| Redis     | `localhost:6380` (no auth)                              |
| Kafka     | bootstrap=`localhost:9095` (PLAINTEXT)                  |
| Kong Admin| `http://localhost:8001`                                 |

Staff JWT tokens can be obtained by calling the auth-service once it is running locally. In sandbox mode a pre-generated token is accepted if you pass `Authorization: Bearer sandbox-dev-token` (valid only in dev/sandbox builds).

## Swagger / OpenAPI Docs

Each service exposes its OpenAPI spec at `/docs` when running locally:

| Service              | Docs URL                            |
|----------------------|-------------------------------------|
| auth-service         | http://localhost:3001/docs          |
| guest-service        | http://localhost:3002/docs          |
| reservation-service  | http://localhost:3003/docs          |
| room-service         | http://localhost:3004/docs          |
| billing-service      | http://localhost:3005/docs          |
| housekeeping-service | http://localhost:3006/docs          |
| notification-service | http://localhost:3007/docs          |
| pms-service          | http://localhost:3008/docs          |
| maintenance-service  | http://localhost:3009/docs          |
| lock-service         | http://localhost:3010/docs          |
| channel-manager      | http://localhost:3011/docs          |

## Rate Limits

Kong enforces the following default rate limits on sandbox traffic:

| Limit                  | Value            |
|------------------------|------------------|
| Requests per minute    | 300 per IP       |
| Requests per hour      | 5 000 per IP     |
| Max request body size  | 10 MB            |

If you exceed the limit you will receive a `429 Too Many Requests` response with a `Retry-After` header.

## Stopping the Sandbox

```bash
docker compose -f infra/sandbox/docker-compose.sandbox.yml down
```

To also remove all persisted data volumes:

```bash
docker compose -f infra/sandbox/docker-compose.sandbox.yml down -v
```

## Re-seeding

The seed container runs once on startup. To re-seed after data changes, restart the seed service:

```bash
docker compose -f infra/sandbox/docker-compose.sandbox.yml restart seed
```

The seed script is idempotent — re-running it will not duplicate records.

## Support

Open an issue at https://github.com/ematobi1/hotelkey-project/issues or email integrations@hotelkey.io.
