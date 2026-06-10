# Allow services to read their own secrets
path "secret/data/hotel-key/+/{{identity.entity.aliases.auth_kubernetes_hotel-key.metadata.service_account_name}}" {
  capabilities = ["read"]
}

# Allow all services to read shared config
path "secret/data/hotel-key/shared/*" {
  capabilities = ["read"]
}

# Transit engine for PII encryption (vault-service only)
path "transit/encrypt/hotel-key-pii" {
  capabilities = ["update"]
}

path "transit/decrypt/hotel-key-pii" {
  capabilities = ["update"]
}
