import crypto from 'crypto'

// Bitcoin base58 alphabet
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function encodeBase58(buf: Buffer): string {
  if (buf.length === 0) return ''

  let num = BigInt('0x' + buf.toString('hex'))
  const chars: string[] = []

  while (num > 0n) {
    const remainder = num % 58n
    chars.unshift(BASE58_ALPHABET[Number(remainder)]!)
    num = num / 58n
  }

  for (const byte of buf) {
    if (byte !== 0) break
    chars.unshift('1')
  }

  return chars.join('')
}

function decodeBase58(str: string): Buffer {
  let num = 0n
  for (const char of str) {
    const index = BASE58_ALPHABET.indexOf(char)
    if (index < 0) throw new Error(`Invalid base58 character: ${char}`)
    num = num * 58n + BigInt(index)
  }

  const hex = num === 0n ? '00' : num.toString(16)
  const padded = hex.length % 2 ? '0' + hex : hex
  const bytes = Buffer.from(padded, 'hex')

  let leadingZeros = 0
  for (const c of str) {
    if (c !== '1') break
    leadingZeros++
  }

  return Buffer.concat([Buffer.alloc(leadingZeros), bytes])
}

// Ed25519 multicodec prefix: 0xed 0x01
const ED25519_MULTICODEC_PREFIX = Buffer.from([0xed, 0x01])

// Ed25519 SPKI DER header (12 bytes) that precede the 32-byte raw public key
const SPKI_HEADER = Buffer.from('302a300506032b6570032100', 'hex')

function rawPublicKeyFromSpki(spkiDer: Buffer): Buffer {
  return spkiDer.slice(SPKI_HEADER.length)
}

function publicKeyToMultibase(rawPubKey: Buffer): string {
  const multicodecKey = Buffer.concat([ED25519_MULTICODEC_PREFIX, rawPubKey])
  return 'z' + encodeBase58(multicodecKey)
}

function multibaseToRawPublicKey(multibase: string): Buffer {
  if (!multibase.startsWith('z')) {
    throw new Error('Unsupported multibase encoding — expected z (base58btc)')
  }
  const decoded = decodeBase58(multibase.slice(1))
  return decoded.slice(ED25519_MULTICODEC_PREFIX.length)
}

export class DidService {
  async generateDid(
    _tenantId: string,
    _guestId: string,
  ): Promise<{
    did: string
    didDocument: object
    publicKeyMultibase: string
    privateKeyJwk: object
  }> {
    const { publicKey: pubKeyObj, privateKey: privKeyObj } = crypto.generateKeyPairSync('ed25519')

    const spkiDer = pubKeyObj.export({ type: 'spki', format: 'der' }) as Buffer
    const privateKeyJwk = privKeyObj.export({ format: 'jwk' }) as object

    const rawPubKey = rawPublicKeyFromSpki(spkiDer)
    const publicKeyMultibase = publicKeyToMultibase(rawPubKey)
    const did = `did:key:${publicKeyMultibase}`

    const vmId = `${did}#${publicKeyMultibase}`
    const didDocument = {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1',
      ],
      id: did,
      verificationMethod: [
        {
          id: vmId,
          type: 'Ed25519VerificationKey2020',
          controller: did,
          publicKeyMultibase,
        },
      ],
      authentication: [vmId],
    }

    return {
      did,
      didDocument,
      publicKeyMultibase,
      privateKeyJwk,
    }
  }

  async verifyDid(
    _did: string,
    challenge: string,
    signatureHex: string,
    publicKeyMultibase: string,
  ): Promise<boolean> {
    try {
      const rawPubKey = multibaseToRawPublicKey(publicKeyMultibase)

      const spkiDer = Buffer.concat([SPKI_HEADER, rawPubKey])
      const publicKeyObject = crypto.createPublicKey({
        key: spkiDer,
        format: 'der',
        type: 'spki',
      })

      const signatureBuffer = Buffer.from(signatureHex, 'hex')
      const challengeBuffer = Buffer.from(challenge, 'utf8')

      return crypto.verify(null, challengeBuffer, publicKeyObject, signatureBuffer)
    } catch {
      return false
    }
  }
}
