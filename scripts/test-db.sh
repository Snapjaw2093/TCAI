#!/usr/bin/env bash
# Runs the database migrations and the access-control tests against a
# THROWAWAY local PostgreSQL database, never a real Supabase project.
#
#   TEST_DATABASE_URL=postgresql://postgres@localhost:5432/tcai_test npm run test:db
#
# The database is wiped first, so this refuses anything that looks hosted.
set -euo pipefail
cd "$(dirname "$0")/.."

url="${TEST_DATABASE_URL:-}"
if [ -z "$url" ]; then
  echo "Set TEST_DATABASE_URL to a throwaway local PostgreSQL database (see supabase/README.md)." >&2
  exit 2
fi
case "$url" in
  *supabase.co*|*supabase.com*|*pooler.*|*amazonaws.com*|*neon.tech*)
    echo "Refusing to run: that looks like a hosted database. This script wipes the database it connects to." >&2
    exit 2 ;;
esac
dbname="${url##*/}"; dbname="${dbname%%\?*}"
case "$dbname" in
  *test*) ;;
  *) echo "Refusing to run: the database name must contain \"test\" (got \"$dbname\")." >&2; exit 2 ;;
esac

psql_run() { psql "$url" -v ON_ERROR_STOP=1 -q "$@"; }

psql_run -c "drop schema if exists tests cascade" ; psql_run -f supabase/tests/shim.sql
for f in supabase/migrations/*.sql; do
  echo "applying $f"
  psql_run -f "$f" >/dev/null
done
echo "applying all migrations a second time (must be safe to repeat)"
for f in supabase/migrations/*.sql; do psql_run -f "$f" >/dev/null; done
psql_run -f supabase/tests/access_control.sql
