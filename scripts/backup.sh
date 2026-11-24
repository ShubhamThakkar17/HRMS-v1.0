#!/usr/bin/env bash
# Logical backup of the HRMS database (custom format, compressed).
# Usage: DATABASE_URL=postgres://... scripts/backup.sh [output-dir]
set -euo pipefail
url="${DATABASE_URL:?Set DATABASE_URL}"
url="${url%%\?*}" # pg_dump does not understand Prisma's ?schema= parameter
out="${1:-backups}"
mkdir -p "$out"
file="$out/hrms-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --no-privileges --dbname="$url" --file="$file"
echo "$file"
