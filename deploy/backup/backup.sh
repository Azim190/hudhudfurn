#!/bin/sh
# One PostgreSQL backup: custom-format dump, checked, kept locally for KEEP_LOCAL_DAYS and copied
# to the backup bucket. Run by cron, or by hand: docker compose exec backup backup.sh
set -eu

ts=$(date -u +%Y%m%dT%H%M%SZ)
name="hudhud-${ts}.dump"
file="/backups/${name}"

echo "backup: dumping ${PGDATABASE} to ${file}"
pg_dump --format=custom --no-owner --file="${file}.partial"
# A dump that pg_restore cannot list is not a backup.
pg_restore --list "${file}.partial" > /dev/null
mv "${file}.partial" "${file}"
echo "backup: $(du -h "${file}" | cut -f1) written"

if [ -n "${BACKUP_S3_ENDPOINT:-}" ] && [ -n "${AWS_ACCESS_KEY_ID:-}" ]; then
  aws s3 cp "${file}" "s3://${BACKUP_BUCKET}/postgres/${name}" \
    --endpoint-url "${BACKUP_S3_ENDPOINT}" --only-show-errors
  echo "backup: uploaded to s3://${BACKUP_BUCKET}/postgres/${name}"
else
  echo "backup: WARNING no BACKUP_S3_ENDPOINT/BACKUP_ACCESS_KEY, so this copy exists on this server only" >&2
fi

find /backups -name 'hudhud-*.dump' -mtime +"${KEEP_LOCAL_DAYS:-7}" -delete
find /backups -name '*.partial' -mmin +360 -delete
echo "backup: done"
