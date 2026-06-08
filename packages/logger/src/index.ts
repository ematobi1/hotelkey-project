import pino from 'pino'

export interface LoggerOptions {
  service: string
  level?: string
  pretty?: boolean
}

export function createLogger(options: LoggerOptions) {
  const isDev =
    options.pretty ?? process.env['NODE_ENV'] === 'development'

  return pino({
    level: options.level ?? 'info',
    base: { service: options.service },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
    transport: isDev
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  })
}

export type Logger = ReturnType<typeof createLogger>
