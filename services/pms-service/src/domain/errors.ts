import { AppError, NotFoundError, ConflictError } from '@hotel-key/types'

export class TenantInactiveError extends AppError {
  constructor(id: string) {
    super('TENANT_INACTIVE', `Tenant '${id}' is inactive`, 403)
  }
}

export { AppError, NotFoundError, ConflictError }
