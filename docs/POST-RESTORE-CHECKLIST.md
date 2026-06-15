# Post-Restore Checklist

**Run through this checklist every time the LogNog SQLite database is restored from backup.**

The March 2026 incident proved that a database restore can silently break all client integrations if API keys change. This checklist prevents that.

---

## Immediately After Restore

### 1. Verify the database loaded correctly
```bash
docker exec lognog-api sh -c "sqlite3 /data/lognog.db 'SELECT count(*) FROM api_keys;'"
docker exec lognog-api sh -c "sqlite3 /data/lognog.db 'SELECT count(*) FROM alerts;'"
docker exec lognog-api sh -c "sqlite3 /data/lognog.db 'SELECT count(*) FROM dashboards;'"
```
Expected: Non-zero counts for all three.

### 2. List all API keys and compare to client configs
```bash
docker exec lognog-api sh -c "sqlite3 /data/lognog.db \"SELECT name, substr(key, 1, 20) || '...' as key_prefix, permissions FROM api_keys;\""
```

Cross-reference with:
- **HYH**: Check `LOGNOG_API_KEY` in Vercel dashboard (project: heyyourehired, Production env vars)
- **DP**: Check `LOGNOG_API_KEY` in Vercel dashboard (project: directors-palette-v2, Production env vars)

If any key doesn't match, create a new one and update Vercel.

### 3. Test ingestion from each client
```bash
# Test HYH key (replace KEY with actual key from Vercel)
curl -X POST https://logs.machinekinglabs.com/api/ingest/http \
  -H "Content-Type: application/json" \
  -H "X-API-Key: KEY" \
  -H "X-Index: hey-youre-hired" \
  -d '[{"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","level":"info","message":"restore test"}]'

# Test DP key
curl -X POST https://logs.machinekinglabs.com/api/ingest/http \
  -H "Content-Type: application/json" \
  -H "X-API-Key: KEY" \
  -H "X-Index: directors-palette" \
  -d '[{"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","level":"info","message":"restore test"}]'
```
Expected: `200 OK` with `{"received": 1}` or similar.

### 4. Verify alerts are configured
```bash
docker exec lognog-api sh -c "sqlite3 /data/lognog.db \"SELECT name, enabled FROM alerts;\""
```
Key alerts that must exist:
- `HYH Logging Dead` (enabled=1)
- `DP Logging Dead` (enabled=1)
- `HYH User Login`
- `HYH New User Sign-up`

### 5. Verify dashboards have panels
```bash
docker exec lognog-api sh -c "sqlite3 /data/lognog.db \"SELECT d.name, count(p.id) as panels FROM dashboards d LEFT JOIN dashboard_panels p ON d.id = p.dashboard_id GROUP BY d.id;\""
```
The HYH dashboard should have 13 panels. If it shows 0, the wrong dashboard may have been restored.

### 6. Check user accounts
```bash
docker exec lognog-api sh -c "sqlite3 /data/lognog.db \"SELECT username, role FROM users_v2;\""
```
Verify admin account exists. If not, reset password.

---

## 24 Hours After Restore

### 7. Confirm logs are flowing
Search LogNog for recent events from each client:
```
search index=hey-youre-hired | head 5
search index=directors-palette | head 5
```
Both should show events with timestamps after the restore.

### 8. Confirm dead client alerts haven't fired
Check Slack `#slack-alerts` channel. If "HYH Logging Dead" or "DP Logging Dead" fired, investigate immediately.

### 9. Verify backup cron is running
```bash
docker exec lognog-api sh -c "cat /var/log/backup.log | tail -5"
docker exec lognog-api sh -c "ls -la /backups/ | tail -5"
```
Should show at least one backup since the restore.

---

## If a Client Key Doesn't Match

```bash
# Create new API key inside the container
docker exec lognog-api sh -c "sqlite3 /data/lognog.db \"INSERT INTO api_keys (id, name, key, permissions, created_at) VALUES (lower(hex(randomblob(16))), 'HYH Production', 'lnog_NEW_KEY_HERE', '[\"write\",\"search\",\"read\"]', datetime('now'));\""
```

Then update the Vercel env var and **redeploy**:
```bash
cd D:/git/yourehired
npx vercel env rm LOGNOG_API_KEY production
echo "lnog_NEW_KEY_HERE" | npx vercel env add LOGNOG_API_KEY production
npx vercel --prod --force
```

**Important**: Vercel env var changes require a redeploy to take effect. The `--force` flag ensures a fresh build.

---

*Created after the March 2026 15-day logging blackout incident.*
