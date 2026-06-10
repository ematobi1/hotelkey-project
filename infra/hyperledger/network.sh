#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="infra/hyperledger/docker-compose.fabric.yml"
CHANNEL_NAME="hotel-key-channel"
CHAINCODE_NAME="consent-ledger"
CHAINCODE_VERSION="1.0"
CHAINCODE_SEQUENCE=1
ORDERER_CA="infra/hyperledger/crypto-config/ordererOrganizations/orderer.hotel-key.internal/orderers/orderer0.hotel-key.internal/tls/ca.crt"
PEER_TLSROOTCERT="infra/hyperledger/crypto-config/peerOrganizations/hotel-key.internal/peers/peer0.hotel-key.internal/tls/ca.crt"

export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID=HotelKeyMSP
export CORE_PEER_MSPCONFIGPATH="infra/hyperledger/crypto-config/peerOrganizations/hotel-key.internal/users/Admin@hotel-key.internal/msp"
export CORE_PEER_ADDRESS=localhost:8051
export CORE_PEER_TLS_ROOTCERT_FILE="${PEER_TLSROOTCERT}"

case "${1:-}" in
  up)
    echo "Starting Fabric network..."
    docker compose -f "${COMPOSE_FILE}" up -d
    echo "Fabric network started."
    ;;

  down)
    echo "Stopping Fabric network..."
    docker compose -f "${COMPOSE_FILE}" down -v
    echo "Fabric network stopped."
    ;;

  createChannel)
    echo "Creating channel ${CHANNEL_NAME}..."
    peer channel create \
      -o localhost:7050 \
      -c "${CHANNEL_NAME}" \
      --ordererTLSHostnameOverride orderer0.hotel-key.internal \
      -f "infra/hyperledger/channel-artifacts/${CHANNEL_NAME}.tx" \
      --outputBlock "infra/hyperledger/channel-artifacts/${CHANNEL_NAME}.block" \
      --tls \
      --cafile "${ORDERER_CA}"

    echo "Joining peer0..."
    peer channel join -b "infra/hyperledger/channel-artifacts/${CHANNEL_NAME}.block"

    echo "Joining peer1..."
    export CORE_PEER_ADDRESS=localhost:8052
    export CORE_PEER_TLS_ROOTCERT_FILE="infra/hyperledger/crypto-config/peerOrganizations/hotel-key.internal/peers/peer1.hotel-key.internal/tls/ca.crt"
    peer channel join -b "infra/hyperledger/channel-artifacts/${CHANNEL_NAME}.block"

    echo "Channel ${CHANNEL_NAME} created and joined."
    ;;

  deployCC)
    echo "Packaging chaincode ${CHAINCODE_NAME}..."
    peer lifecycle chaincode package "${CHAINCODE_NAME}.tar.gz" \
      --path "chaincode/consent-ledger" \
      --lang golang \
      --label "${CHAINCODE_NAME}_${CHAINCODE_VERSION}"

    echo "Installing on peer0..."
    peer lifecycle chaincode install "${CHAINCODE_NAME}.tar.gz"

    echo "Installing on peer1..."
    export CORE_PEER_ADDRESS=localhost:8052
    export CORE_PEER_TLS_ROOTCERT_FILE="infra/hyperledger/crypto-config/peerOrganizations/hotel-key.internal/peers/peer1.hotel-key.internal/tls/ca.crt"
    peer lifecycle chaincode install "${CHAINCODE_NAME}.tar.gz"

    export CORE_PEER_ADDRESS=localhost:8051
    export CORE_PEER_TLS_ROOTCERT_FILE="${PEER_TLSROOTCERT}"

    PACKAGE_ID=$(peer lifecycle chaincode queryinstalled 2>&1 | grep "${CHAINCODE_NAME}_${CHAINCODE_VERSION}" | awk '{print $3}' | tr -d ',')

    echo "Approving chaincode (packageId=${PACKAGE_ID})..."
    peer lifecycle chaincode approveformyorg \
      -o localhost:7050 \
      --ordererTLSHostnameOverride orderer0.hotel-key.internal \
      --channelID "${CHANNEL_NAME}" \
      --name "${CHAINCODE_NAME}" \
      --version "${CHAINCODE_VERSION}" \
      --package-id "${PACKAGE_ID}" \
      --sequence "${CHAINCODE_SEQUENCE}" \
      --tls \
      --cafile "${ORDERER_CA}"

    echo "Committing chaincode..."
    peer lifecycle chaincode commit \
      -o localhost:7050 \
      --ordererTLSHostnameOverride orderer0.hotel-key.internal \
      --channelID "${CHANNEL_NAME}" \
      --name "${CHAINCODE_NAME}" \
      --version "${CHAINCODE_VERSION}" \
      --sequence "${CHAINCODE_SEQUENCE}" \
      --tls \
      --cafile "${ORDERER_CA}" \
      --peerAddresses localhost:8051 \
      --tlsRootCertFiles "${PEER_TLSROOTCERT}"

    echo "Chaincode ${CHAINCODE_NAME} deployed."
    ;;

  *)
    echo "Usage: $0 {up|down|createChannel|deployCC}"
    exit 1
    ;;
esac
