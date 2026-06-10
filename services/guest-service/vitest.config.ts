import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: ['**/*.integration.test.ts', '**/node_modules/**'],
    env: {
      DATABASE_URL: 'postgres://test:test@localhost:5432/test',
      JWT_PUBLIC_KEY_BASE64: 'dGVzdA==',
    },
  },
})
