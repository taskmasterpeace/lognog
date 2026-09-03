#!/usr/bin/env bash
# Load a desktop LogNog data bundle into the Coolify (mkl-dev) cloud instance.
#
# RUN THIS ON THE CLOUD BOX (via Coolify's terminal or SSH), from the directory
# that holds the two bundle files produced on the desktop:
#     lognog-logs.native     (ClickHouse logs table, Native format)
#     lognog-metadata.db      (SQLite metadata: users, dashboards, alerts, …)
#
# Usage:
#     CLICKHOUSE_PASSWORD='<the coolify CH password>' ./migrate-to-coolify.sh [bundle_dir]
#
# It is idempotent-ish: the SQLite metadata is REPLACED wholesale (that's the
# point — you want the desktop's dashboards/alerts/users), and the ClickHouse
# logs are de-duplicated by (timestamp, hostname, message) after insert so a
# re-run doesn't double the history.
set -euo pipefail

BUNDLE_DIR="${1:-.}"
CH_PW="${CLICKHOUSE_PASSWORD:-}"
LOGS_NATIVE="$BUNDLE_DIR/lognog-logs.native"
META_DB="$BUNDLE_DIR/lognog-metadata.db"

fail() { echo "ERROR: $*" >&2; exit 1; }

[ -f "$LOGS_NATIVE" ] || fail "missing $LOGS_NATIVE"
[ -f "$META_DB" ]     || fail "missing $META_DB"
[ -n "$CH_PW" ]       || fail "set CLICKHOUSE_PASSWORD to the cloud instance's ClickHouse password (Coolify env)"

# --- discover the running Coolify containers by their compose service label ---
find_container() {
  # $1 = compose service name (clickhouse|api)
  docker ps --filter "label=com.docker.compose.service=$1" --format '{{.ID}}' | head -n1
}
CH_CID="$(find_container clickhouse)"
API_CID="$(find_container api)"
[ -n "$CH_CID" ]  || fail "no running 'clickhouse' container found (is the Coolify stack up?)"
[ -n "$API_CID" ] || fail "no running 'api' container found"
echo "clickhouse container: $CH_CID"
echo "api container:        $API_CID"

# --- 1) ClickHouse: load the Native dump, then de-dup ---
echo "==> loading ClickHouse logs ($(du -h "$LOGS_NATIVE" | cut -f1)) ..."
before=$(docker exec "$CH_CID" clickhouse-client -u lognog --password "$CH_PW" -q "SELECT count() FROM lognog.logs")
docker exec -i "$CH_CID" clickhouse-client -u lognog --password "$CH_PW" \
  -q "INSERT INTO lognog.logs FORMAT Native" < "$LOGS_NATIVE"
# De-duplicate: OPTIMIZE only collapses by the table's sort key, so do an explicit
# dedup via a swap table keyed on the natural identity of a log line.
docker exec "$CH_CID" clickhouse-client -u lognog --password "$CH_PW" --multiquery -q "
  CREATE TABLE IF NOT EXISTS lognog.logs_dedup AS lognog.logs;
  TRUNCATE TABLE lognog.logs_dedup;
  INSERT INTO lognog.logs_dedup SELECT * FROM lognog.logs
    ORDER BY timestamp LIMIT 1 BY timestamp, hostname, message, index_name;
  EXCHANGE TABLES lognog.logs AND lognog.logs_dedup;
  DROP TABLE lognog.logs_dedup;
" || echo "  (dedup step skipped — non-fatal; a re-run may duplicate rows)"
after=$(docker exec "$CH_CID" clickhouse-client -u lognog --password "$CH_PW" -q "SELECT count() FROM lognog.logs")
echo "    rows: $before -> $after"
docker exec "$CH_CID" clickhouse-client -u lognog --password "$CH_PW" \
  -q "SELECT index_name, count() FROM lognog.logs GROUP BY index_name ORDER BY 2 DESC FORMAT PrettyCompact"

# --- 2) SQLite metadata: replace the API's /data/lognog.db ---
echo "==> replacing SQLite metadata ($(du -h "$META_DB" | cut -f1)) ..."
# Back up whatever the fresh cloud instance seeded, just in case.
docker exec "$API_CID" sh -c "[ -f /data/lognog.db ] && cp /data/lognog.db /data/lognog.db.pre-migrate.$(date +%s) || true"
docker cp "$META_DB" "$API_CID:/data/lognog.db"
# Clear any stale WAL/SHM from the seeded db so the copied file is authoritative.
docker exec "$API_CID" sh -c "rm -f /data/lognog.db-wal /data/lognog.db-shm || true"
users=$(docker exec "$API_CID" node -e "import('better-sqlite3').then(m=>{const d=new m.default('/data/lognog.db');console.log(d.prepare('SELECT count(*) c FROM users_v2').get().c)})" 2>/dev/null || echo '?')
echo "    users_v2 rows now: $users"

# --- 3) restart the API so it re-opens the swapped SQLite file ---
echo "==> restarting api container ..."
docker restart "$API_CID" >/dev/null
echo "    waiting for health ..."
for i in $(seq 1 30); do
  if docker exec "$API_CID" wget -q --spider http://localhost:4000/health 2>/dev/null; then
    echo "    api healthy"; break
  fi
  sleep 2
done

echo
echo "DONE. Verify:  curl -s https://lognog.machinekinglabs.com/api/health"
echo "Then log in with your DESKTOP admin credentials (they came over in the metadata db)."
