#!/bin/sh
# For hosts without a pre-deploy step (Render's free plan).
set -e
prisma migrate deploy
exec node dist/main.js
