#!/bin/sh
# Schedules backup.sh with busybox crond. crond does not pass the container environment to its
# jobs, so the settings the job needs are saved to a root-only file first.
set -eu

umask 077
export -p | grep -E '^export (PG|AWS_|BACKUP_|KEEP_)' > /etc/backup.env

echo "${BACKUP_CRON:-30 0 * * *} . /etc/backup.env; /usr/local/bin/backup.sh > /proc/1/fd/1 2>&1" > /etc/crontabs/root
echo "backup: scheduled '${BACKUP_CRON:-30 0 * * *}' (UTC) to s3://${BACKUP_BUCKET:-?}/postgres/"
exec crond -f -l 8
