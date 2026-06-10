'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getToken, setTokens } from '@/lib/auth'
import type { StaffProfile } from '@/types'

const BASE = process.env['NEXT_PUBLIC_API_BASE_URL'] ?? ''

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (getToken()) {
      router.replace('/tasks')
    }
  }, [router])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const form = e.currentTarget
    const email = (form.elements.namedItem('email') as HTMLInputElement).value
    const password = (form.elements.namedItem('password') as HTMLInputElement).value
    const tenantId = (form.elements.namedItem('tenantId') as HTMLInputElement).value

    try {
      const loginRes = await fetch(`${BASE}/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, tenantId }),
      })

      if (!loginRes.ok) {
        const body = await loginRes.json().catch(() => ({}))
        throw new Error(
          (body as { error?: { message?: string } }).error?.message ?? `HTTP ${loginRes.status}`,
        )
      }

      const { accessToken } = (await loginRes.json()) as { accessToken: string }

      const meRes = await fetch(`${BASE}/v1/auth/me`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!meRes.ok) {
        throw new Error('Failed to load staff profile')
      }

      const { data: profile } = (await meRes.json()) as { data: StaffProfile }

      setTokens(accessToken, tenantId, profile.id)
      localStorage.setItem('staffName', `${profile.firstName} ${profile.lastName}`)

      router.replace('/tasks')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-outer">
      <div className="login-container">
        <header className="login-header">
          <h1 className="login-title">Hotel Key Staff</h1>
          <p className="login-subtitle">Sign in to manage your tasks</p>
        </header>

        <div className="card">
          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="tenantId" className="form-label">
                Property ID
              </label>
              <input
                id="tenantId"
                name="tenantId"
                type="text"
                required
                autoComplete="organization"
                className="form-input"
                placeholder="e.g. hotel-grand-plaza"
              />
            </div>

            <div className="form-group">
              <label htmlFor="email" className="form-label">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="form-input"
                placeholder="staff@hotel.com"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password" className="form-label">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="form-input"
              />
            </div>

            {error && (
              <div role="alert" className="alert alert-error">
                {error}
              </div>
            )}

            <button type="submit" disabled={submitting} className="btn btn-primary">
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
