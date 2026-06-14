const ACCESS_TOKEN_KEY = 'accessToken'
const REFRESH_TOKEN_KEY = 'refreshToken'
const TENANT_ID_KEY = 'tenantId'

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(ACCESS_TOKEN_KEY)
}

export function getUserId(): string | null {
  const token = getToken()
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1]!))
    return (payload.sub as string) ?? null
  } catch {
    return null
  }
}

export function getTenantId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TENANT_ID_KEY)
}

export function setTokens(accessToken: string, refreshToken: string, tenantId: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  localStorage.setItem(TENANT_ID_KEY, tenantId)
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(TENANT_ID_KEY)
}
