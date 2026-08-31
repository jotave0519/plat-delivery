#!/bin/sh
set -e

if [ "$SKIP_MIGRATIONS" != "true" ]; then
  echo "Applying pending Prisma migrations (DIRECT_URL)..."
  node node_modules/prisma/build/index.js migrate deploy
else
  echo "SKIP_MIGRATIONS=true — skipping prisma migrate deploy."
fi

exec node node_modules/next/dist/bin/next start
