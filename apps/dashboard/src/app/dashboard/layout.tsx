'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { clearTokens, getToken } from '@/lib/auth'

const navItems = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/reservations', label: 'Reservations' },
  { href: '/dashboard/rooms', label: 'Rooms' },
  { href: '/dashboard/housekeeping', label: 'Housekeeping' },
  { href: '/dashboard/maintenance', label: 'Maintenance' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login')
    } else {
      setReady(true)
    }
  }, [router])

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-slate-400 text-sm">Loading…</p>
      </div>
    )
  }

  function handleSignOut() {
    clearTokens()
    router.replace('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <nav className="w-56 shrink-0 bg-slate-900 flex flex-col" aria-label="Primary navigation">
        <div className="px-5 py-4 border-b border-slate-700">
          <span className="text-white font-semibold text-base tracking-tight">Hotel Key</span>
        </div>

        <ul className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  pathname === item.href
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="p-2 border-t border-slate-700">
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-700 rounded-md transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
