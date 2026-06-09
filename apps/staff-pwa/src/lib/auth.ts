export const getToken = () =>
  typeof window !== 'undefined' ? localStorage.getItem('token') : null

export const getTenantId = () =>
  typeof window !== 'undefined' ? localStorage.getItem('tenantId') : null

export const getStaffId = () =>
  typeof window !== 'undefined' ? localStorage.getItem('staffId') : null

export const getStaffName = () =>
  typeof window !== 'undefined' ? localStorage.getItem('staffName') : null

export const setTokens = (token: string, tenantId: string, staffId: string) => {
  localStorage.setItem('token', token)
  localStorage.setItem('tenantId', tenantId)
  localStorage.setItem('staffId', staffId)
}

export const clearTokens = () => {
  localStorage.removeItem('token')
  localStorage.removeItem('tenantId')
  localStorage.removeItem('staffId')
  localStorage.removeItem('staffName')
}
