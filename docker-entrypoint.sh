#!/bin/sh
# One job: get the database into a state the app can serve from, then hand over
# to the app. Anything that fails here should stop the container rather than
# leave it serving a half-migrated schema.
set -eu

: "${DATABASE_URL:=file:/data/app.db}"
export DATABASE_URL

echo "[boot] database: ${DATABASE_URL}"
node scripts/migrate.mjs

# Seeding is idempotent — prisma/seed.ts returns early if any monitor exists —
# so a restart never overwrites a workspace someone has edited.
if [ "${SEED_ON_BOOT:-1}" = "1" ]; then
  node scripts/seed.mjs || echo "[boot] seed skipped: $?"
fi

# A first admin, created only when there are no accounts at all. Without this a
# fresh deployment has a login page nobody can get past.
if [ -n "${ADMIN_EMAIL:-}" ]; then
  node scripts/ensure-admin.mjs "${ADMIN_EMAIL}" || true
fi

exec "$@"
