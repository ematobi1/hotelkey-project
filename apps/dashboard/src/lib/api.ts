import type {
  Reservation,
  Room,
  HkTask,
  WorkOrder,
  CreateWorkOrderInput,
  StaffProfile,
} from '@/types'

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000'

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  auth: {
    login: (email: string, password: string, tenantId: string) =>
      apiFetch<{ accessToken: string; refreshToken: string }>('/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, tenantId }),
      }),
    me: () => apiFetch<{ data: StaffProfile }>('/v1/auth/me'),
  },
  reservations: {
    list: (tenantId: string) =>
      apiFetch<{ data: Reservation[]; meta: { total: number } }>(
        `/v1/reservations?tenantId=${tenantId}`,
      ),
    checkIn: (id: string, tenantId: string) =>
      apiFetch<{ data: Reservation }>(`/v1/reservations/${id}/check-in`, {
        method: 'POST',
        body: JSON.stringify({ tenantId }),
      }),
    checkOut: (id: string, tenantId: string) =>
      apiFetch<{ data: Reservation }>(`/v1/reservations/${id}/check-out`, {
        method: 'POST',
        body: JSON.stringify({ tenantId }),
      }),
  },
  rooms: {
    list: (tenantId: string) =>
      apiFetch<{ data: Room[]; meta: { total: number } }>(`/v1/rooms?tenantId=${tenantId}`),
  },
  housekeeping: {
    tasks: (tenantId: string) =>
      apiFetch<{ data: HkTask[]; meta: { total: number } }>(
        `/v1/housekeeping/tasks?tenantId=${tenantId}`,
      ),
    updateStatus: (id: string, status: string, tenantId: string) =>
      apiFetch<{ data: HkTask }>(`/v1/housekeeping/tasks/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, tenantId }),
      }),
  },
  maintenance: {
    list: (tenantId: string) =>
      apiFetch<{ data: WorkOrder[]; meta: { total: number } }>(
        `/v1/maintenance/work-orders?tenantId=${tenantId}`,
      ),
    create: (data: CreateWorkOrderInput) =>
      apiFetch<{ data: WorkOrder }>('/v1/maintenance/work-orders', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
}
