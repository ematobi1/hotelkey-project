import { importPKCS8, importSPKI, SignJWT, jwtVerify } from 'jose'
import type { JwtPayload, AccessTokenPayload, MfaPartialTokenPayload } from '@hotel-key/types'
import { config } from '../config'
import { InvalidTokenError } from '../domain/errors'

let privateKey: Awaited<ReturnType<typeof importPKCS8>> | null = null
let publicKey: Awaited<ReturnType<typeof importSPKI>> | null = null

async function getPrivateKey() {
  if (!privateKey) {
    const pem = Buffer.from(config.JWT_PRIVATE_KEY_BASE64, 'base64').toString('utf8')
    privateKey = await importPKCS8(pem, 'ES256')
  }
  return privateKey
}

async function getPublicKey() {
  if (!publicKey) {
    const pem = Buffer.from(config.JWT_PUBLIC_KEY_BASE64, 'base64').toString('utf8')
    publicKey = await importSPKI(pem, 'ES256')
  }
  return publicKey
}

export async function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): Promise<string> {
  const key = await getPrivateKey()
  return new SignJWT({ ...payload, type: 'access' })
    .setProtectedHeader({ alg: 'ES256' })
    .setIssuedAt()
    .setExpirationTime(`${config.JWT_ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(key)
}

export async function signMfaPartialToken(
  payload: Omit<MfaPartialTokenPayload, 'type'>,
): Promise<string> {
  const key = await getPrivateKey()
  return new SignJWT({ ...payload, type: 'mfa_partial' })
    .setProtectedHeader({ alg: 'ES256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key)
}

export async function signGuestToken(
  guestId: string,
  tenantId: string,
  reservationId: string,
): Promise<string> {
  const key = await getPrivateKey()
  return new SignJWT({ sub: guestId, tenantId, reservationId, type: 'guest' })
    .setProtectedHeader({ alg: 'ES256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(key)
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  try {
    const key = await getPublicKey()
    const { payload } = await jwtVerify(token, key)
    return payload as unknown as JwtPayload
  } catch {
    throw new InvalidTokenError()
  }
}

export async function verifyMfaPartialToken(token: string): Promise<MfaPartialTokenPayload> {
  const payload = await verifyToken(token)
  if (payload.type !== 'mfa_partial') throw new InvalidTokenError()
  return payload as MfaPartialTokenPayload
}
