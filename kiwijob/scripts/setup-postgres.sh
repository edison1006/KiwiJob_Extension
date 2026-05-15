#!/usr/bin/env bash
# Create PostgreSQL role + database for KiwiJob (local dev).
# Requires: psql on PATH, Postgres listening on PGHOST:PGPORT (default localhost:5432).
# Usage:
#   ./scripts/setup-postgres.sh
#   PGUSER=postgres PGPASSWORD=secret ./scripts/setup-postgres.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SQL="$ROOT/scripts/postgres-init.sql"

export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"

try() {
  local u="$1"
  export PGUSER="$u"
  echo "→ Trying PGUSER=$PGUSER on $PGHOST:$PGPORT …"
  if psql -d postgres -v ON_ERROR_STOP=1 -f "$SQL"; then
    echo ""
    echo "Done. Set in kiwijob/apps/api/.env:"
    echo "  DATABASE_URL=postgresql+psycopg2://kiwijob:kiwijob@${PGHOST}:${PGPORT}/kiwijob"
    exit 0
  fi
  return 1
}

if [[ -n "${PGUSER:-}" ]]; then
  try "$PGUSER"
  echo "Failed with PGUSER=$PGUSER. Check Postgres is running and credentials."
  exit 1
fi

for u in postgres "$USER"; do
  try "$u" && exit 0 || true
done

echo ""
echo "Could not connect. Start Postgres (or Docker Desktop + postgres container), then run:"
echo "  PGUSER=postgres PGPASSWORD=yourpassword $0"
echo "or:"
echo "  psql -U <superuser> -d postgres -f $SQL"
exit 1
