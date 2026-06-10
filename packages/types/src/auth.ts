export type StaffRole =
  | 'super_admin'
  | 'admin'
  | 'front_desk'
  | 'housekeeping'
  | 'maintenance'

export interface Staff {
  id: string
  tenantId: string
  email: string
  firstName: string
  lastName: string
  role: StaffRole
  isActive: boolean
  mfaEnabled: boolean
  createdAt: Date
  updatedAt: Date
}

export interface StaffWithPassword extends Staff {
  passwordHash: string
}

export interface AccessTokenPayload {
  sub: string
  tenantId: string
  role: StaffRole
  type: 'access'
}

export interface MfaPartialTokenPayload {
  sub: string
  tenantId: string
  role: StaffRole
  type: 'mfa_partial'
}

export interface GuestTokenPayload {
  sub: string
  tenantId: string
  reservationId: string
  type: 'guest'
}

export type JwtPayload =
  | AccessTokenPayload
  | MfaPartialTokenPayload
  | GuestTokenPayload

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

export interface MfaSetupResult {
  secret: string
  qrCodeUrl: string
}
