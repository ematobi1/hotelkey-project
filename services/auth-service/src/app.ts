import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { createLogger } from '@hotel-key/logger'
import { AppError } from '@hotel-key/types'
import { config } from './config'
import { authRoutes } from './routes/auth.routes'
import { internalRoutes } from './routes/internal.routes'

export async function createApp(): Promise<FastifyInstance> {
  const logger = createLogger({ service: 'auth-service', level: config.LOG_LEVEL })

  const app = Fastify({ logger: logger as FastifyBaseLogger })

  await app.register(helmet)
  await app.register(cors, {
    origin: ['http://localhost:3000', 'http://hotel--Publi-67crryVktJSd-2116934759.us-east-1.elb.amazonaws.com'],
    credentials: true,
  })
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (req) =>
      (req.headers['x-tenant-id'] as string | undefined) ?? req.ip,
  })

  await app.register(swagger, {
    openapi: {
      info: { title: 'Auth Service', version: '1.0.0' },
    },
  })
  await app.register(swaggerUi, { routePrefix: '/docs' })

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, ...(error.details ?? {}) },
      })
    }

    if ('validation' in error && error.validation) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_FAILED', message: error.message },
      })
    }

    request.log.error({ err: error }, 'Unhandled error')
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    })
  })

  app.get('/', async (_request, reply) => {
    reply.header('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:")
    return reply.type('text/html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hotel Key — Platform</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter',sans-serif;background:#f8fafc;color:#0f172a;min-height:100vh}
    .topbar{background:#fff;border-bottom:1px solid #e2e8f0;padding:0 40px;height:60px;display:flex;align-items:center;justify-content:space-between}
    .logo{font-size:1.05rem;font-weight:700;color:#0f172a;letter-spacing:-.02em;display:flex;align-items:center;gap:10px}
    .logo-icon{width:28px;height:28px;background:linear-gradient(135deg,#2563eb,#7c3aed);border-radius:7px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:.8rem;font-weight:800}
    .topbar-right{display:flex;align-items:center;gap:20px;font-size:.82rem;color:#64748b}
    .status-pill{display:inline-flex;align-items:center;gap:6px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:999px;padding:4px 10px;font-size:.75rem;font-weight:600;color:#15803d}
    .dot{width:6px;height:6px;border-radius:50%;background:#22c55e;animation:blink 2s ease infinite}
    @keyframes blink{0%,100%{opacity:1}50%{opacity:.4}}
    .wrap{max-width:960px;margin:0 auto;padding:56px 28px 80px}
    .hero{margin-bottom:52px}
    .eyebrow{font-size:.7rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#2563eb;margin-bottom:14px}
    h1{font-size:clamp(2rem,4.5vw,3rem);font-weight:800;letter-spacing:-.03em;line-height:1.1;color:#0f172a;margin-bottom:16px}
    h1 span{color:#2563eb}
    .tagline{font-size:1rem;color:#64748b;line-height:1.7;max-width:560px}
    .metrics{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:#e2e8f0;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;margin-bottom:48px}
    .metric{background:#fff;padding:20px 22px}
    .mv{font-size:1.5rem;font-weight:800;color:#0f172a;letter-spacing:-.03em;line-height:1}
    .ml{font-size:.67rem;font-weight:500;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-top:4px}
    .sec-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
    .sec-title{font-size:.75rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#94a3b8}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;margin-bottom:52px}
    .card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:18px 20px;display:flex;align-items:center;justify-content:space-between;text-decoration:none;color:inherit;transition:border-color .15s,box-shadow .15s,transform .12s}
    .card:hover{border-color:#bfdbfe;box-shadow:0 4px 16px rgba(37,99,235,.07);transform:translateY(-1px)}
    .card-left{display:flex;flex-direction:column;gap:4px}
    .card-name{font-size:.9rem;font-weight:600;color:#0f172a}
    .card-path{font-family:'SF Mono','Fira Code',monospace;font-size:.72rem;color:#2563eb;opacity:.7}
    .card:hover .card-path{opacity:1}
    .card-arrow{font-size:.85rem;color:#cbd5e1;transition:color .15s,transform .15s}
    .card:hover .card-arrow{color:#2563eb;transform:translateX(3px)}
    footer{display:flex;align-items:center;flex-wrap:wrap;gap:6px 20px;font-size:.77rem;color:#94a3b8;padding-top:28px;border-top:1px solid #f1f5f9}
    footer a{color:#64748b;text-decoration:none}
    footer a:hover{color:#2563eb}
    .sep{color:#e2e8f0}
  </style>
</head>
<body>
  <div class="topbar">
    <div class="logo">
      <div class="logo-icon">HK</div>
      Hotel Key
    </div>
    <div class="topbar-right">
      <span class="status-pill"><span class="dot"></span>All systems operational</span>
      <span>v1.0.0</span>
    </div>
  </div>

  <div class="wrap">
    <div class="hero">
      <p class="eyebrow">Hotel Key Platform</p>
      <h1>The modern API for<br><span>intelligent hotel operations</span></h1>
      <p class="tagline">A cloud-native microservices platform built to replace Oracle Opera, Cloudbeds, and Mews — with real-time automation, PCI-compliant billing, and AI-augmented decision making.</p>
    </div>

    <div class="metrics">
      <div class="metric"><div class="mv">19</div><div class="ml">Services Live</div></div>
      <div class="metric"><div class="mv">AWS</div><div class="ml">ECS Fargate</div></div>
      <div class="metric"><div class="mv">v1</div><div class="ml">API Version</div></div>
      <div class="metric"><div class="mv">PCI</div><div class="ml">Compliant</div></div>
      <div class="metric"><div class="mv">RDS</div><div class="ml">PostgreSQL 16</div></div>
    </div>

    <div class="sec-head">
      <span class="sec-title">Live API Endpoints</span>
    </div>
    <div class="grid">
      <a class="card" href="/docs"><div class="card-left"><div class="card-name">Auth</div><div class="card-path">/v1/auth</div></div><span class="card-arrow">&#8594;</span></a>
      <a class="card" href="/v1/guests/docs"><div class="card-left"><div class="card-name">Guests</div><div class="card-path">/v1/guests</div></div><span class="card-arrow">&#8594;</span></a>
      <a class="card" href="/v1/reservations/docs"><div class="card-left"><div class="card-name">Reservations</div><div class="card-path">/v1/reservations</div></div><span class="card-arrow">&#8594;</span></a>
      <a class="card" href="/v1/rooms/docs"><div class="card-left"><div class="card-name">Rooms</div><div class="card-path">/v1/rooms</div></div><span class="card-arrow">&#8594;</span></a>
      <a class="card" href="/v1/billing/docs"><div class="card-left"><div class="card-name">Billing &amp; Folios</div><div class="card-path">/v1/billing</div></div><span class="card-arrow">&#8594;</span></a>
      <a class="card" href="/v1/housekeeping/docs"><div class="card-left"><div class="card-name">Housekeeping</div><div class="card-path">/v1/housekeeping</div></div><span class="card-arrow">&#8594;</span></a>
      <a class="card" href="/v1/notifications/docs"><div class="card-left"><div class="card-name">Notifications</div><div class="card-path">/v1/notifications</div></div><span class="card-arrow">&#8594;</span></a>
      <a class="card" href="/v1/pms/docs"><div class="card-left"><div class="card-name">PMS Dashboard</div><div class="card-path">/v1/pms</div></div><span class="card-arrow">&#8594;</span></a>
      <a class="card" href="/v1/bi/docs"><div class="card-left"><div class="card-name">Business Intelligence</div><div class="card-path">/v1/bi</div></div><span class="card-arrow">&#8594;</span></a>
      <a class="card" href="/v1/channel-manager/docs"><div class="card-left"><div class="card-name">Channel Manager</div><div class="card-path">/v1/channel-manager</div></div><span class="card-arrow">&#8594;</span></a>
      <a class="card" href="/v1/vault/docs"><div class="card-left"><div class="card-name">Key Vault</div><div class="card-path">/v1/vault</div></div><span class="card-arrow">&#8594;</span></a>
      <a class="card" href="/v1/consent/docs"><div class="card-left"><div class="card-name">Consent &amp; GDPR</div><div class="card-path">/v1/consent</div></div><span class="card-arrow">&#8594;</span></a>
      <a class="card" href="/v1/integrations/docs"><div class="card-left"><div class="card-name">Integrations</div><div class="card-path">/v1/integrations</div></div><span class="card-arrow">&#8594;</span></a>
      <a class="card" href="/v1/maintenance/docs"><div class="card-left"><div class="card-name">Maintenance</div><div class="card-path">/v1/maintenance</div></div><span class="card-arrow">&#8594;</span></a>
      <a class="card" href="/v1/lock/docs"><div class="card-left"><div class="card-name">Lock &amp; Access</div><div class="card-path">/v1/lock</div></div><span class="card-arrow">&#8594;</span></a>
      <a class="card" href="/v1/pricing/docs"><div class="card-left"><div class="card-name">Dynamic Pricing</div><div class="card-path">/v1/pricing</div></div><span class="card-arrow">&#8594;</span></a>
      <a class="card" href="/v1/ml/docs"><div class="card-left"><div class="card-name">ML &amp; Predictions</div><div class="card-path">/v1/ml</div></div><span class="card-arrow">&#8594;</span></a>
      <a class="card" href="/v1/digital-twin/api/rooms"><div class="card-left"><div class="card-name">Digital Twin</div><div class="card-path">/v1/digital-twin</div></div><span class="card-arrow">&#8594;</span></a>
      <a class="card" href="/v1/webhooks/docs"><div class="card-left"><div class="card-name">Webhooks</div><div class="card-path">/v1/webhooks</div></div><span class="card-arrow">&#8594;</span></a>
    </div>

    <footer>
      <span>&copy; 2026 Hotel Key Inc.</span>
      <span class="sep">&middot;</span>
      <a href="/health">Health</a>
      <span class="sep">&middot;</span>
      <a href="/docs">Auth API Docs</a>
      <span class="sep">&middot;</span>
      <span>Phase 1 &mdash; AWS ECS Fargate &mdash; us-east-1</span>
    </footer>
  </div>
</body>
</html>`)
  })
  app.get('/health', async () => ({ status: 'ok', service: 'auth-service' }))

  await app.register(authRoutes, { prefix: '/v1/auth' })
  await app.register(internalRoutes, { prefix: '/internal/auth' })

  return app
}
