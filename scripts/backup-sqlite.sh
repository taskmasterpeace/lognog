#!/bin/sh
# Backup LogNog SQLite database (runs INSIDE the API container)
# Uses sqlite3 .backup for safe online backup (not file copy)
# Triggered by crond every 6 hours

set -e

BACKUP_DIR="/backups"
SQLITE_DB="${SQLITE_PATH:-/data/lognog.db}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
KEEP_DAYS=${KEEP_DAYS:-30}

mkdir -p "$BACKUP_DIR"

# Skip if no database exists yet
if [ ! -f "$SQLITE_DB" ]; then
  echo "[backup] No database found at $SQLITE_DB, skipping"
  exit 0
fi

BACKUP_FILE="$BACKUP_DIR/lognog-$TIMESTAMP.db"

# Use SQLite .backup command for safe online backup
# This uses the backup API which handles WAL mode correctly
sqlite3 "$SQLITE_DB" ".backup '$BACKUP_FILE'"

# Copy latest backup to a known location for easy restore
cp "$BACKUP_FILE" "$BACKUP_DIR/lognog-latest.db"

# Clean up backups older than KEEP_DAYS
find "$BACKUP_DIR" -name "lognog-2*.db" -mtime +$KEEP_DAYS -delete 2>/dev/null || true

# Log result
SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[backup] Complete: lognog-$TIMESTAMP.db ($SIZE)"
