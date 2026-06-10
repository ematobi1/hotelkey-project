'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { clearTokens } from '@/lib/auth'

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/bi', label: 'BI Assistant' },
  { href: '/occupancy', label: 'Occupancy' },
  { href: '/scenario-planner', label: 'Scenario Planner' },
  { href: '/pricing', label: 'Pricing' },
]

export default function NavBar() {
  const pathname = usePathname()
  const router = useRouter()

  function handleLogout() {
    clearTokens()
    router.push('/')
  }

  return (
    <nav className="nav" aria-label="Main navigation">
      <span className="nav-brand">
        Hotel<span>Key</span>
      </span>
      <ul className="nav-links" role="list">
        {NAV_LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className={`nav-link${pathname.startsWith(link.href) ? ' nav-link-active' : ''}`}
              aria-current={pathname.startsWith(link.href) ? 'page' : undefined}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
      <button type="button" onClick={handleLogout} className="nav-logout">
        Log out
      </button>
    </nav>
  )
}
