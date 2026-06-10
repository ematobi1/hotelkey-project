export const getToken = () =>
  typeof window !== 'undefined' ? localStorage.getItem('hk_token') : null

export const getTenantId = () =>
  typeof window !== 'undefined' ? localStorage.getItem('hk_tenant_id') : null

export const getManagerId = () =>
  typeof window !== 'undefined' ? localStorage.getItem('hk_manager_id') : null

export const setTokens = (token: string, tenantId: string, managerId: string) => {
  localStorage.setItem('hk_token', token)
  localStorage.setItem('hk_tenant_id', tenantId)
  localStorage.setItem('hk_manager_id', managerId)
}

export const clearTokens = () => {
  localStorage.removeItem('hk_token')
  localStorage.removeItem('hk_tenant_id')
  localStorage.removeItem('hk_manager_id')
}
