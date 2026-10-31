#!/usr/bin/env bash
# Seeds a hosted database from this machine. Seeding takes 20 minutes or more, past Render's start
# limit, and does not fit beside the API in 512 MB, so it runs here instead. It is safe to re-run.
# Redis and Meilisearch are throwaway: the hosted site keeps only what lands in Postgres and S3.
#
# Usage: scripts/seed-render.sh .env.render.local
#   (copy infra/render/seed.env.example; .local files are gitignored)
set -euo pipefail

env_file="${1:?Usage: scripts/seed-render.sh <env file>}"
net=hudhud-seed
key=throwaway_seed_key_throwaway_seed_key

cleanup() {
  docker rm -f hudhud-seed-redis hudhud-seed-meili >/dev/null 2>&1 || true
  docker network rm "$net" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker build -f infra/docker/Dockerfile --build-arg SERVICE=api -t hudhud-api .

docker network create "$net" >/dev/null
docker run -d --name hudhud-seed-redis --network "$net" redis:7-alpine >/dev/null
docker run -d --name hudhud-seed-meili --network "$net" -e MEILI_MASTER_KEY="$key" getmeili/meilisearch:v1.15 >/dev/null

docker run --rm --network "$net" --env-file "$env_file" \
  -e NODE_ENV=development \
  -e REDIS_URL=redis://hudhud-seed-redis:6379 \
  -e MEILI_HOST=http://hudhud-seed-meili:7700 \
  -e MEILI_API_KEY="$key" \
  hudhud-api sh -c 'prisma migrate deploy && prisma db seed && node dist/cli/seed-catalog.js && node dist/cli/seed-showroom.js'
