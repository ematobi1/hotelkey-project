import { Pool } from 'pg'
import type { Folio, FolioLineItem, PostChargeInput } from '@hotel-key/types'
import { NotFoundError, ConflictError } from '@hotel-key/types'

function rowToFolio(r: Record<string, unknown>): Folio {
  return {
    id: r['id'] as string,
    tenantId: r['tenant_id'] as string,
    reservationId: r['reservation_id'] as string,
    guestId: r['guest_id'] as string,
    status: r['status'] as Folio['status'],
    closedAt: r['closed_at'] as Date | null,
    createdAt: r['created_at'] as Date,
    updatedAt: r['updated_at'] as Date,
  }
}

function rowToLineItem(r: Record<string, unknown>): FolioLineItem {
  return {
    id: r['id'] as string,
    folioId: r['folio_id'] as string,
    tenantId: r['tenant_id'] as string,
    description: r['description'] as string,
    chargeType: r['charge_type'] as FolioLineItem['chargeType'],
    quantity: parseFloat(r['quantity'] as string),
    unitAmount: parseFloat(r['unit_amount'] as string),
    totalAmount: parseFloat(r['total_amount'] as string),
    taxAmount: parseFloat(r['tax_amount'] as string),
    postedAt: r['posted_at'] as Date,
    postedBy: r['posted_by'] as string | null,
    voidedAt: r['voided_at'] as Date | null,
    voidReason: r['void_reason'] as string | null,
    idempotencyKey: r['idempotency_key'] as string | null,
  }
}

export class FolioRepository {
  constructor(private readonly pool: Pool) {}

  async createForReservation(reservationId: string, guestId: string, tenantId: string): Promise<Folio> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO folio (tenant_id, reservation_id, guest_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (reservation_id) DO UPDATE SET updated_at = NOW()
       RETURNING id, tenant_id, reservation_id, guest_id, status, closed_at, created_at, updated_at`,
      [tenantId, reservationId, guestId],
    )
    return rowToFolio(rows[0]!)
  }

  async findByReservationId(reservationId: string): Promise<Folio | null> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT id, tenant_id, reservation_id, guest_id, status, closed_at, created_at, updated_at
         FROM folio WHERE reservation_id = $1`,
      [reservationId],
    )
    return rows[0] ? rowToFolio(rows[0]) : null
  }

  async findByIdOrThrow(id: string): Promise<Folio> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT id, tenant_id, reservation_id, guest_id, status, closed_at, created_at, updated_at
         FROM folio WHERE id = $1`,
      [id],
    )
    if (!rows[0]) throw new NotFoundError('Folio', id)
    return rowToFolio(rows[0])
  }

  async listLineItems(folioId: string): Promise<FolioLineItem[]> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `SELECT id, folio_id, tenant_id, description, charge_type, quantity,
              unit_amount, total_amount, tax_amount, posted_at, posted_by,
              voided_at, void_reason, idempotency_key
         FROM folio_line_item
        WHERE folio_id = $1 AND voided_at IS NULL
        ORDER BY posted_at`,
      [folioId],
    )
    return rows.map(rowToLineItem)
  }

  async postCharge(input: PostChargeInput): Promise<FolioLineItem> {
    const totalAmount = input.quantity * input.unitAmount
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO folio_line_item (folio_id, tenant_id, description, charge_type,
                                    quantity, unit_amount, total_amount, tax_amount,
                                    posted_by, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, folio_id, tenant_id, description, charge_type, quantity,
                 unit_amount, total_amount, tax_amount, posted_at, posted_by,
                 voided_at, void_reason, idempotency_key`,
      [
        input.folioId, input.tenantId, input.description, input.chargeType,
        input.quantity, input.unitAmount, totalAmount, input.taxAmount ?? 0,
        input.postedBy ?? null, input.idempotencyKey ?? null,
      ],
    )
    return rowToLineItem(rows[0]!)
  }

  async voidCharge(lineItemId: string, folioId: string, reason: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE folio_line_item
          SET voided_at = NOW(), void_reason = $3
        WHERE id = $1 AND folio_id = $2 AND voided_at IS NULL`,
      [lineItemId, folioId, reason],
    )
    if (result.rowCount === 0) {
      throw new ConflictError('Charge not found or already voided')
    }
  }

  async closeFolio(id: string): Promise<Folio> {
    const { rows } = await this.pool.query<Record<string, unknown>>(
      `UPDATE folio SET status = 'closed', closed_at = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING id, tenant_id, reservation_id, guest_id, status, closed_at, created_at, updated_at`,
      [id],
    )
    if (!rows[0]) throw new NotFoundError('Folio', id)
    return rowToFolio(rows[0])
  }
}
