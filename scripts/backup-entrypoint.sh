#!/bin/sh
# Entrypoint that sets up SQLite backup cron and starts the app

set -e

# Install crontab: run backup every 6 hours
echo "0 */6 * * * /app/scripts/backup-sqlite.sh >> /var/log/backup.log 2>&1" | crontab -

# Start crond in background
crond -b -l 8

echo "[entrypoint] Backup cron started (every 6 hours)"

# Run initial backup on startup (non-blocking)
/app/scripts/backup-sqlite.sh >> /var/log/backup.log 2>&1 &

# Start the main application
exec node dist/index.js
