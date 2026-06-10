'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { clearTokens } from '@/lib/auth'

export default function NavBar() {
  const router = useRouter()
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  const [staffName, setStaffName] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    setMounted(true)
    setStaffName(localStorage.getItem('staffName'))
    setIsAuthenticated(localStorage.getItem('token') !== null)
  }, [pathname])

  if (!mounted || !isAuthenticated || pathname === '/') return null

  function handleLogout() {
    clearTokens()
    router.replace('/')
  }

  return (
    <nav className="nav" aria-label="Main navigation">
      <span className="nav-brand">Hotel Key Staff</span>
      <div className="nav-right">
        {staffName && <span className="nav-user">{staffName}</span>}
        <button type="button" className="nav-logout" onClick={handleLogout}>
          Sign out
        </button>
      </div>
    </nav>
  )
}
