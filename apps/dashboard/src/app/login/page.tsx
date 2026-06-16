'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { getToken, setTokens } from '@/lib/auth'

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (getToken()) {
      router.replace('/dashboard')
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
      const { accessToken, refreshToken } = await api.auth.login(email, password, tenantId)
      setTokens(accessToken, refreshToken, tenantId)
      router.replace('/dashboard')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-slate-950 bg-[radial-gradient(ellipse_at_top,_#0d1a2e_0%,_#020617_65%)]">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-cyan-500 mb-4 shadow-lg shadow-cyan-500/20">
            <span className="text-slate-900 text-base font-bold tracking-tight select-none">HK</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Hotel Key</h1>
          <p className="text-slate-500 mt-1 text-sm">Sign in to the management dashboard</p>
        </div>

        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-7 shadow-2xl shadow-black/40">
          <form onSubmit={handleSubmit} noValidate>
            <div className="space-y-4">
              <div>
                <label htmlFor="tenantId" className="block text-xs font-medium text-slate-400 mb-1.5">
                  Property ID
                </label>
                <input
                  id="tenantId"
                  name="tenantId"
                  type="text"
                  required
                  autoComplete="organization"
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-colors"
                  placeholder="10000000-0000-0000-0000-000000000001"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-xs font-medium text-slate-400 mb-1.5">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-colors"
                  placeholder="staff@hotel.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-xs font-medium text-slate-400 mb-1.5">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-colors"
                />
              </div>
            </div>

            {error && (
              <p role="alert" className="mt-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-6 w-full rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
