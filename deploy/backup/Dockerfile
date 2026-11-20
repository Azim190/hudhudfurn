# Nightly PostgreSQL backups to Cloudflare R2 (or any S3-compatible bucket).
# pg_dump comes from the same major version as the database server.
FROM postgres:17-alpine
RUN apk add --no-cache aws-cli
COPY backup.sh entrypoint.sh /usr/local/bin/
RUN chmod 755 /usr/local/bin/backup.sh /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
