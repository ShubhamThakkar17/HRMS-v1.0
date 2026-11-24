#!/usr/bin/env bash
# Restore drill (Phase 12): back up the database, restore the dump into a scratch database,
# and check every table has the same row count. Leaves the source untouched.
# Usage: DATABASE_URL=postgres://user:pass@host:5432/hrms scripts/restore-drill.sh
set -euo pipefail
src="${DATABASE_URL:?Set DATABASE_URL}"
src="${src%%\?*}"
base="${src%/*}"
drill_db="hrms_restore_drill_$(date +%s)"
dump="$(DATABASE_URL="$src" "$(dirname "$0")/backup.sh" "${TMPDIR:-/tmp}/hrms-drill")"
echo "Backup written: $dump"

psql "$base/postgres" -v ON_ERROR_STOP=1 -qc "CREATE DATABASE \"$drill_db\";"
trap 'psql "$base/postgres" -qc "DROP DATABASE IF EXISTS \"$drill_db\";" >/dev/null; rm -f "$dump"' EXIT
pg_restore --no-owner --no-privileges --dbname="$base/$drill_db" "$dump"

tables=$(psql "$src" -Atc "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY 1")
fail=0
printf '%-20s %10s %10s\n' TABLE SOURCE RESTORED
for t in $tables; do
  a=$(psql "$src" -Atc "SELECT count(*) FROM \"$t\"")
  b=$(psql "$base/$drill_db" -Atc "SELECT count(*) FROM \"$t\"")
  flag=""; [ "$a" = "$b" ] || { flag="  MISMATCH"; fail=1; }
  printf '%-20s %10s %10s%s\n' "$t" "$a" "$b" "$flag"
done
if [ "$fail" = 0 ]; then echo "Restore drill passed."; else echo "Restore drill FAILED."; exit 1; fi
