#!/usr/bin/env bash
# Deploys one image tag: pull, migrate the database, then replace the containers.
# Called by .github/workflows/deploy.yml, or by hand on the server:
#   bash scripts/deploy.sh <image-tag>     # a git commit SHA, or "latest"
# The images are private on GHCR, so a manual run needs "docker login ghcr.io" first
# (a GitHub token with read:packages). Re-running the Deploy workflow is usually simpler.
set -euo pipefail
cd "$(dirname "$0")/.."

tag="${1:-latest}"

die() { echo "deploy: $*" >&2; exit 1; }
[[ -f .env ]] || die ".env is missing. Run: bash scripts/init-env.sh"
[[ -f certs/origin.pem && -f certs/origin-key.pem ]] || die "certs/origin.pem and certs/origin-key.pem are missing (Cloudflare Origin Certificate)"
# Only real values count: the comments in .env mention the placeholder names too.
if grep -qE '^[A-Z0-9_]+=__GENERATE_' .env; then die ".env still has __GENERATE_ placeholders. Run: bash scripts/init-env.sh"; fi

# Record the tag in .env so later "docker compose" commands use the same images.
if grep -q '^IMAGE_TAG=' .env; then
  sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=${tag}|" .env
else
  echo "IMAGE_TAG=${tag}" >> .env
fi
export IMAGE_TAG="${tag}"

echo "deploy: pulling images for ${tag}"
docker compose pull api storefront admin

echo "deploy: starting databases"
docker compose up -d --wait postgres redis meilisearch

echo "deploy: applying database migrations"
docker compose run --rm --no-deps api prisma migrate deploy

echo "deploy: starting the application"
docker compose up -d --build --wait --remove-orphans

echo "$(date -u +%FT%TZ) ${tag}" >> .deploy-history
# Keep recent images for a quick rollback; drop the rest.
docker image prune -af --filter "until=336h" > /dev/null || true

echo "deploy: ${tag} is live"
docker compose ps --format 'table {{.Service}}\t{{.Status}}'
