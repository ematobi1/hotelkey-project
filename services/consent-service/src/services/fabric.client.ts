import * as grpc from '@grpc/grpc-js'
import * as crypto from 'crypto'
import * as fs from 'fs'
import { connect, Contract, Gateway, Network, hash } from '@hyperledger/fabric-gateway'
import { config } from '../config'
import type { ConsentRecord } from '../domain/errors'

const CHANNEL_NAME = 'hotel-key-channel'
const CHAINCODE_NAME = 'consent-ledger'

export class FabricClient {
  private gateway: Gateway | null = null
  private contract: Contract | null = null
  private client: grpc.Client | null = null

  async connect(): Promise<void> {
    const tlsRootCert = fs.readFileSync(config.FABRIC_TLS_CERT_PATH)
    const credentials = grpc.credentials.createSsl(tlsRootCert)
    this.client = new grpc.Client(config.FABRIC_GATEWAY_ENDPOINT, credentials, {
      'grpc.ssl_target_name_override': 'peer0.hotel-key.internal',
    })

    const certPem = fs.readFileSync(config.FABRIC_CERT_PATH)
    const keyPem = fs.readFileSync(config.FABRIC_KEY_PATH)
    const privateKey = crypto.createPrivateKey(keyPem)

    this.gateway = connect({
      client: this.client,
      identity: {
        mspId: config.FABRIC_MSP_ID,
        credentials: certPem,
      },
      signer: {
        sign: async (digest: Uint8Array) => {
          const signature = crypto.sign(null, Buffer.from(digest), privateKey)
          return signature
        },
      },
      hash: hash.sha256,
    })

    const network: Network = this.gateway.getNetwork(CHANNEL_NAME)
    this.contract = network.getContract(CHAINCODE_NAME)
  }

  async disconnect(): Promise<void> {
    if (this.gateway) {
      this.gateway.close()
      this.gateway = null
      this.contract = null
    }
    if (this.client) {
      this.client.close()
      this.client = null
    }
  }

  private getContract(): Contract {
    if (!this.contract) throw new Error('FabricClient not connected — call connect() first')
    return this.contract
  }

  async grantConsent(
    guestIdHash: string,
    tenantId: string,
    purpose: string,
    grantedBy: string,
  ): Promise<string> {
    const result = await this.getContract().submitTransaction(
      'GrantConsent',
      guestIdHash,
      tenantId,
      purpose,
      grantedBy,
    )
    return Buffer.from(result).toString('utf8')
  }

  async revokeConsent(
    guestIdHash: string,
    tenantId: string,
    purpose: string,
    revokedBy: string,
  ): Promise<string> {
    const result = await this.getContract().submitTransaction(
      'RevokeConsent',
      guestIdHash,
      tenantId,
      purpose,
      revokedBy,
    )
    return Buffer.from(result).toString('utf8')
  }

  async hasConsent(guestIdHash: string, tenantId: string, purpose: string): Promise<boolean> {
    const result = await this.getContract().evaluateTransaction(
      'HasConsent',
      guestIdHash,
      tenantId,
      purpose,
    )
    const raw = Buffer.from(result).toString('utf8').trim()
    return raw === 'true'
  }

  async getConsentHistory(guestIdHash: string, tenantId: string): Promise<ConsentRecord[]> {
    const result = await this.getContract().evaluateTransaction(
      'GetConsentHistory',
      guestIdHash,
      tenantId,
    )
    const raw = Buffer.from(result).toString('utf8').trim()
    if (!raw || raw === 'null') return []
    return JSON.parse(raw) as ConsentRecord[]
  }
}
