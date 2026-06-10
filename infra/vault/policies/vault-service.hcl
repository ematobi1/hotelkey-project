path "transit/encrypt/hotel-key-pii" { capabilities = ["update"] }
path "transit/decrypt/hotel-key-pii" { capabilities = ["update"] }
path "transit/datakey/plaintext/hotel-key-pii" { capabilities = ["update"] }
path "secret/data/hotel-key/vault-service/*" { capabilities = ["read"] }
