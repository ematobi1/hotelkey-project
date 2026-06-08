#!/bin/bash
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/tmp/hotel-key-backups"
S3_BUCKET="${BACKUP_S3_BUCKET:-hotel-key-backups}"

mkdir -p "$BACKUP_DIR"

DATABASES=(
  "auth_service"
  "guest_service"
  "room_service"
  "reservation_service"
  "billing_service"
  "housekeeping_service"
  "notification_service"
  "pms_service"
  "maintenance_service"
)

for DB in "${DATABASES[@]}"; do
  FILENAME="${DB}_${TIMESTAMP}.dump.gz"
  echo "Backing up ${DB}..."

  PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
    -h "${POSTGRES_HOST:-localhost}" \
    -U "${POSTGRES_USER:-hotel_key}" \
    -d "${DB}" \
    --format=custom \
    --compress=9 \
    -f "${BACKUP_DIR}/${FILENAME}"

  aws s3 cp "${BACKUP_DIR}/${FILENAME}" "s3://${S3_BUCKET}/postgres/${FILENAME}" \
    --storage-class STANDARD_IA

  rm "${BACKUP_DIR}/${FILENAME}"
  echo "Backed up ${DB} -> s3://${S3_BUCKET}/postgres/${FILENAME}"
done

echo "All databases backed up successfully at ${TIMESTAMP}"
