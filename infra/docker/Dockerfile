# Production images. Build from the repository root, one target per service:
#   docker build -f infra/docker/Dockerfile --target api -t hudhud-api .
#   docker build -f infra/docker/Dockerfile --target storefront --build-arg ADMIN_URL=http://admin:3101 -t hudhud-storefront .
#   docker build -f infra/docker/Dockerfile --target admin -t hudhud-admin .
# See docs/guides/deployment.md.

FROM node:24-bookworm-slim AS base
# Prisma needs OpenSSL at runtime; the slim image does not include it.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS build
WORKDIR /repo
# The storefront bakes this into its /admin proxy rewrite at build time.
ARG ADMIN_URL=http://admin:3101
ENV ADMIN_URL=$ADMIN_URL NEXT_OUTPUT=standalone
COPY . .
RUN pnpm install --frozen-lockfile
# pnpm rather than turbo: turbo's strict env mode would hide ADMIN_URL and NEXT_OUTPUT from next build.
RUN pnpm --filter "@hudhud/api..." --filter "@hudhud/storefront-web..." --filter "@hudhud/admin-web..." build

# Keeps dev dependencies: prisma and tsx run migrations and seeds from this image.
FROM base AS api
ENV NODE_ENV=production PORT=4100 PATH=/repo/apps/api/node_modules/.bin:$PATH
WORKDIR /repo/apps/api
COPY --from=build --chown=node:node /repo/node_modules /repo/node_modules
COPY --from=build --chown=node:node /repo/package.json /repo/pnpm-workspace.yaml /repo/pnpm-lock.yaml /repo/
COPY --from=build --chown=node:node /repo/packages /repo/packages
COPY --from=build --chown=node:node /repo/apps/api /repo/apps/api
USER node
EXPOSE 4100
CMD ["node", "dist/main.js"]

FROM base AS storefront
ENV NODE_ENV=production PORT=3100 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/storefront-web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/storefront-web/.next/static ./apps/storefront-web/.next/static
COPY --from=build --chown=node:node /repo/apps/storefront-web/public ./apps/storefront-web/public
USER node
EXPOSE 3100
CMD ["node", "apps/storefront-web/server.js"]

FROM base AS admin
ENV NODE_ENV=production PORT=3101 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/admin-web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/admin-web/.next/static ./apps/admin-web/.next/static
COPY --from=build --chown=node:node /repo/apps/admin-web/public ./apps/admin-web/public
USER node
EXPOSE 3101
CMD ["node", "apps/admin-web/server.js"]
