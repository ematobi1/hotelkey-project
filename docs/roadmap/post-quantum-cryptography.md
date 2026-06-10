# Post-Quantum Cryptography Rollout — Months 36–40

## Overview

Hotel Key will migrate all cryptographic primitives to NIST-standardized post-quantum algorithms by Month 40. This migration is driven by the "harvest now, decrypt later" threat model: adversaries may be collecting encrypted hotel and guest data today to decrypt once fault-tolerant quantum computers become viable. The PMS stores long-lived sensitive data (guest PII, payment tokens, identity credentials) that must remain confidential beyond the classical-computing era.

## Target Algorithms

### Key Exchange — ML-KEM (FIPS 203)
**Module-Lattice Key Encapsulation Mechanism** replaces ECDH (Curve25519/P-256) in all TLS 1.3 connections.

- Security level: ML-KEM-768 (Category 3, equivalent to AES-192)
- Hybrid mode during transition: `X25519Kyber768Draft00` (classical + PQC combined) to maintain security against both classical and quantum adversaries simultaneously
- Applied to: all Istio mTLS handshakes, Kong gateway TLS termination, client-to-API TLS

### Digital Signatures — ML-DSA (FIPS 204)
**Module-Lattice Digital Signature Algorithm** replaces Ed25519 in all signing operations.

- Security level: ML-DSA-65 (Category 3)
- Applied to:
  - JWT signing in auth-service (replacing current Ed25519 private keys)
  - DID document signatures in guest-service identity layer
  - Hyperledger Fabric endorsement policies (lock-service credential signing)
  - Code signing for deployment artifacts (CI/CD pipeline)

### Symmetric — No Change Required
AES-256-GCM is already quantum-resistant (Grover's algorithm halves effective key length; 256-bit → 128-bit equivalent is still secure). SHA-3/SHAKE256 retained for hashing.

## Services Affected

| Service | Current Algorithm | Replacement | Change Type |
|---------|------------------|-------------|-------------|
| auth-service | Ed25519 JWT signing | ML-DSA-65 | Key rotation + new signing library |
| auth-service | ECDH key exchange (TLS) | ML-KEM-768 (hybrid) | Istio config + cert renewal |
| guest-service | Ed25519 DID signatures | ML-DSA-65 | Identity library upgrade |
| lock-service | Ed25519 credential signing | ML-DSA-65 | Firmware + server update |
| vault-service | RSA-4096 key wrapping | ML-KEM-768 | Key hierarchy migration |
| Istio mTLS | ECDHE cipher suites | Hybrid ECDHE+ML-KEM | Envoy version upgrade |
| Kong gateway | TLS 1.3 ECDHE | Hybrid ECDHE+ML-KEM | Kong + OpenSSL 3.x |

## Migration Phases

### Phase 1 — Audit (Month 36)
- Run `crypto-audit` tool across all services to enumerate every key generation, signing, and key-exchange call
- Catalogue algorithm, key size, lifetime, and rotation policy for each
- Identify any hard-coded algorithm identifiers in JWT `alg` headers, TLS configs, and Fabric chaincode
- Output: crypto inventory spreadsheet stored in Confluence, severity-tagged by quantum risk

### Phase 2 — Library Upgrades (Month 37)
- Upgrade Node.js services to use `liboqs-node` (Open Quantum Safe bindings) and `@noble/post-quantum`
- Upgrade Python services (pricing-service, ML inference) to `liboqs-python`
- Upgrade Istio to 1.22+ (Envoy with BoringSSL PQ support) and enable `X25519Kyber768Draft00` cipher
- Upgrade Kong to 3.7+ built against OpenSSL 3.3 with ML-KEM support
- All upgrades deployed to staging; classical fallback enabled

### Phase 3 — Dual-Algorithm Period (Month 38–39)
Services accept and validate both legacy (Ed25519/ECDH) and PQC (ML-DSA/ML-KEM) simultaneously.

- auth-service issues JWTs signed with ML-DSA-65; also accepts Ed25519-signed tokens during grace period
- Istio control plane rotates all mTLS certificates to hybrid ECDHE+ML-KEM; services with old certs still accepted
- Guest-service DID resolver supports both Ed25519 and ML-DSA verification methods in DID documents
- Hyperledger Fabric peers updated to sign endorsements with ML-DSA; old Ed25519 endorsements still valid

Dual-algorithm mode is validated in staging with a full regression suite including:
- JWT issuance and verification round-trip
- mTLS handshake between every service pair
- Lock credential issuance and door-controller acceptance

### Phase 4 — Sunset Legacy Algorithms (Month 40)
- Remove Ed25519 and ECDH acceptance from all services
- Rotate all long-lived keys (Vault master keys, Fabric orderer/peer keys) to ML-DSA/ML-KEM
- Set `alg: ML-DSA-65` as the only accepted JWT algorithm in auth-service JWKS endpoint
- Enforce PQC-only cipher suites in Istio and Kong
- Archive old key material in air-gapped offline storage per NIST SP 800-57 key management guidelines

## Key Management

- All ML-DSA private keys stored in HashiCorp Vault using the `pki` secrets engine with a PQC-aware fork
- Key rotation cadence: ML-DSA signing keys rotated every 90 days; ML-KEM ephemeral keys rotated per-session (forward secrecy preserved)
- Hardware Security Module (AWS CloudHSM) support for ML-DSA key generation evaluated in Month 37; mandatory for signing keys used in Fabric endorsements

## Rollback Plan

Each migration phase is independently reversible via feature flags in the `auth-service` config and Istio `EnvoyFilter` patches. If a PQC cipher negotiation failure rate exceeds 0.1% in production, the hybrid cipher is automatically demoted and a PagerDuty alert fires.

## References

- NIST FIPS 203: ML-KEM (Kyber) — https://doi.org/10.6028/NIST.FIPS.203
- NIST FIPS 204: ML-DSA (Dilithium) — https://doi.org/10.6028/NIST.FIPS.204
- Open Quantum Safe project — https://openquantumsafe.org
- IETF draft-ietf-tls-hybrid-design — key exchange hybrid construction
