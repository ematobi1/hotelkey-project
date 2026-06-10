#!/bin/bash
set -euo pipefail

# Usage: ./postgres-restore.sh <database> <s3-key>
DB="${1:?Usage: $0 <database> <s3-key>}"
S3_KEY="${2:?Usage: $0 <database> <s3-key>}"
S3_BUCKET="${BACKUP_S3_BUCKET:-hotel-key-backups}"
TMPFILE="/tmp/restore_${DB}_$(date +%s).dump.gz"

echo "Downloading s3://${S3_BUCKET}/${S3_KEY}..."
aws s3 cp "s3://${S3_BUCKET}/${S3_KEY}" "$TMPFILE"

echo "Restoring ${DB}..."
PGPASSWORD="${POSTGRES_PASSWORD}" pg_restore \
  -h "${POSTGRES_HOST:-localhost}" \
  -U "${POSTGRES_USER:-hotel_key}" \
  -d "${DB}" \
  --clean \
  --if-exists \
  --no-owner \
  "$TMPFILE"

rm "$TMPFILE"
echo "Restore of ${DB} complete."
