#!/usr/bin/env bash
# Restores the database from a backup. This REPLACES all current data.
#   bash scripts/restore.sh                         # list available backups
#   bash scripts/restore.sh hudhud-20261107T003000Z.dump
# A backup on this server (in the backups volume) is used if present, otherwise it is downloaded
# from the backup bucket.
set -euo pipefail
cd "$(dirname "$0")/.."

name="${1:-}"

if [[ -z "${name}" ]]; then
  echo "On this server:"
  docker compose exec -T backup sh -c 'ls -1t /backups/*.dump 2>/dev/null | xargs -n1 basename' || true
  echo
  echo "In the backup bucket (latest 20):"
  docker compose exec -T backup sh -c \
    'aws s3 ls "s3://$BACKUP_BUCKET/postgres/" --endpoint-url "$BACKUP_S3_ENDPOINT" | sort | tail -n 20' || true
  echo
  echo "Usage: bash scripts/restore.sh <file name>"
  exit 0
fi

[[ "${name}" =~ ^hudhud-[0-9TZ]+\.dump$ ]] || { echo "Unexpected file name: ${name}" >&2; exit 1; }

docker compose up -d --wait postgres backup

if ! docker compose exec -T backup test -f "/backups/${name}"; then
  echo "Downloading ${name} from the backup bucket"
  docker compose exec -T backup sh -c \
    "aws s3 cp \"s3://\$BACKUP_BUCKET/postgres/${name}\" /backups/${name} --endpoint-url \"\$BACKUP_S3_ENDPOINT\" --only-show-errors"
fi
docker compose exec -T backup pg_restore --list "/backups/${name}" > /dev/null

echo
echo "This deletes the current database and replaces it with ${name}."
read -r -p "Type RESTORE to continue: " answer
[[ "${answer}" == "RESTORE" ]] || { echo "Cancelled."; exit 1; }

echo "Stopping the application"
docker compose stop caddy storefront admin api

echo "Recreating the database"
docker compose exec -T backup sh -c 'psql -v ON_ERROR_STOP=1 -d postgres -c "DROP DATABASE IF EXISTS \"$PGDATABASE\" WITH (FORCE);" -c "CREATE DATABASE \"$PGDATABASE\" OWNER \"$PGUSER\";"'

echo "Restoring ${name}"
docker compose exec -T backup sh -c "pg_restore --no-owner --exit-on-error -d \"\$PGDATABASE\" /backups/${name}"

echo "Starting the application"
docker compose up -d --wait

echo "Restored ${name}."
