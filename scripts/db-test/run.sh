#!/usr/bin/env bash
# Runs the Supabase migrations + tests against a throwaway local Postgres
# database (needs PostGIS). Usage: scripts/db-test/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=rentanything_test
PSQL=(psql -v ON_ERROR_STOP=1 -q -X)
dropdb --if-exists "$DB"
createdb "$DB"
"${PSQL[@]}" -d "$DB" -f scripts/db-test/stubs.sql
for f in supabase/migrations/*.sql; do
  "${PSQL[@]}" -d "$DB" -f "$f"
done
"${PSQL[@]}" -d "$DB" -o /dev/null -f scripts/db-test/test.sql
"${PSQL[@]}" -d "$DB" -o /dev/null -f scripts/db-test/test_trust.sql
echo "All database tests passed."

# The seed file must load cleanly on top of the migrations.
dropdb --if-exists "${DB}_seed"
createdb "${DB}_seed"
"${PSQL[@]}" -d "${DB}_seed" -f scripts/db-test/stubs.sql
for f in supabase/migrations/*.sql; do
  "${PSQL[@]}" -d "${DB}_seed" -f "$f"
done
"${PSQL[@]}" -d "${DB}_seed" -f supabase/seed.sql
live=$(psql -X -tA -d "${DB}_seed" -c "select count(*) from public.search_vehicles(6.98, 79.93)")
if [ "$live" != "5" ]; then
  echo "Seed check failed: expected 5 live vehicles, got $live" >&2
  exit 1
fi
echo "Seed loads: $live live vehicles."
dropdb "$DB"
dropdb "${DB}_seed"
