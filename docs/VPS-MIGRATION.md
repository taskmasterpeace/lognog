# LogNog — Desktop → Cloud Migration Runbook

Move the LogNog service off Robert's Windows desktop (Docker Desktop + WSL2,
`logs.machinekinglabs.com`) onto the managed cloud instance.

**Status as of 2026-09-03:** the cloud infrastructure is **already live**. A
Coolify deploy (Hetzner, ~8 GB box, traefik + Let's Encrypt) is running the full
stack at **`lognog.machinekinglabs.com`** from `docker-compose.coolify.yml`
(commits `adc47b5`, `2e7d08a`). `GET /api/health` there returns
`backend=clickhouse, store=ok`. What remains is **data**, **secrets/SMTP**,
**access**, and **cutover**.

---

## 0. Where things stand

| Piece | Desktop (`logs.…`) | Cloud (`lognog.…`) | Remaining |
|-------|--------------------|--------------------|-----------|
| Stack running | yes (compose + cloudflared tunnel) | **yes (Coolify + traefik + LE)** | — |
| ClickHouse logs | 83.8k rows | **empty** | load (§2) |
| SQLite metadata (users, dashboards, alerts, reports, API keys, source configs) | 41 MB / 59 tables | fresh seed | load (§2) |
| Secrets (JWT, CH pw) | set | set in Coolify (unknown to me) | make them match, or accept re-login (§3) |
| SMTP (report/alert email) | configured (Resend) | **missing** | set in Coolify (§3) |
| Cloudflare Access | yes (bypass on `/api/ingest`) | **none — open to internet** | add (§4) |
| Public traffic / clients | pointed here | not yet | cut over (§4) |

The live dataset is tiny (~85 MB total), so the data move is minutes, not hours.

---

## 1. Export the desktop data (DONE — bundle is ready)

Produced on the desktop into `migration-bundle/` (gitignored):

- `lognog-logs.native` — ClickHouse `logs` table, Native format, 83.8k rows (~44 MB).
- `lognog-metadata.db` — safe SQLite online backup, 59 tables (~41 MB).

To regenerate:
```bash
docker exec lognog-clickhouse clickhouse-client -u lognog --password "$CH_PW" \
  -q "SELECT * FROM lognog.logs FORMAT Native" > migration-bundle/lognog-logs.native
docker exec lognog-api sh -c "sqlite3 /data/lognog.db \".backup '/backups/m.db'\""
docker cp lognog-api:/backups/m.db migration-bundle/lognog-metadata.db
```

---

## 2. Load the data into the cloud  ← the one hands-on step

The load must run **on the cloud box** (Coolify terminal or SSH) because it
replaces the API container's `/data/lognog.db` and inserts into ClickHouse —
neither is reachable from the public API. `scripts/migrate-to-coolify.sh` (in
this repo, so it's on the box after any deploy) does the whole thing.

```bash
# On the cloud box, in a directory holding the two bundle files:
#   1. get the bundle onto the box (from the desktop):
#        scp migration-bundle/lognog-*.{native,db}  user@<cloud-ip>:/root/lognog-bundle/
#   2. run the loader with the cloud's ClickHouse password (the one set in Coolify env):
CLICKHOUSE_PASSWORD='<coolify CH password>' \
  bash /path/to/repo/scripts/migrate-to-coolify.sh /root/lognog-bundle
```

The script: finds the running `clickhouse`/`api` containers by their
`com.docker.compose.service` label, inserts the Native dump and de-duplicates by
`(timestamp, hostname, message, index_name)`, replaces `/data/lognog.db` (backing
up the seeded one first), clears stale WAL/SHM, and restarts the API. It prints
row counts by index and the `users_v2` count so you can confirm.

After it runs, the cloud login uses your **desktop admin credentials** (they came
over in the metadata db), and every desktop dashboard/alert/report/API key is present.

---

## 3. Cloud secrets (Coolify → the service's Environment Variables)

Set/confirm these in the Coolify UI, then redeploy the service:

| Var | Why | Note |
|-----|-----|------|
| `CLICKHOUSE_PASSWORD` | API ↔ CH auth | must match what §2 used |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | sessions/tokens | **Set to the desktop values** if you want existing sessions/refresh-tokens carried in the metadata db to stay valid. Otherwise everyone re-logs-in (fine). |
| `SMTP_HOST/PORT/SECURE/USER/PASS/FROM` | report + alert email (Resend) | currently **missing** on cloud → email is dead until set |
| `OPENROUTER_API_KEY` | AI features (no GPU on the box) | optional |
| `BASE_URL` | "View in LogNog" links | defaults to `https://lognog.machinekinglabs.com`; change if you rename to `logs.…` (see §4) |

---

## 4. Cutover (preserve `logs.machinekinglabs.com` as the canonical name)

Clients (HeyYoureHired, Directors Palette, the Windows agents) all ship to
`https://logs.machinekinglabs.com/api/ingest/…`. The clean cutover keeps that
hostname and just moves where it points — **zero client changes**.

1. **Add `logs.machinekinglabs.com` to the Coolify service** (Domains field, or a
   second traefik Host rule alongside `lognog.…`). Traefik requests an LE cert for it.
2. **Re-create Cloudflare Access** on `logs.…` in front of the cloud, with the
   path-scoped **bypass on `/api/ingest`** (so machine-to-machine shipping keeps
   working) — the desktop had exactly this; it lives in Cloudflare, not the repo.
3. **Point `logs.…` DNS at the cloud** — change the record from the desktop tunnel
   to the Hetzner IP (proxied/orange is fine; traefik still serves it). Cloudflare
   propagates in seconds.
4. **Verify** through `https://logs.machinekinglabs.com`: login, run a search, load
   the Directors Palette dashboard, `POST /api/ingest/http` a test event, confirm it
   lands. Then re-check row counts match §2.
5. **Stop the desktop stack** once traffic is confirmed on the cloud. Keep the box
   intact ~1 week for rollback (flip the `logs.…` DNS/tunnel back).

Alternative (more work, avoid): repoint every client's `LOGNOG_URL`/agent config
from `logs.…` to `lognog.…`. Only do this if you want to retire the `logs.…` name.

---

## 5. Post-cutover hardening

- **Port exposure**: the Coolify compose already avoids host-publishing 80/8123/4000
  (traefik-only). It still publishes **514/udp+tcp** for syslog — keep the box's
  firewall closed to everything except 514 (if you use syslog ingest), 443, and SSH.
- **Backups**: the desktop's local-only backups became a 31 GB un-pruned pile. On
  the cloud, the API's cron backup writes to the `lognog-backups` named volume —
  add an off-box copy (nightly `lognog.db` + a ClickHouse `clickhouse-backup` to
  Backblaze B2 / Cloudflare R2) and verify the `find -mtime +30 -delete` prune runs.
- **ClickHouse RAM**: the Coolify compose sets `mem_limit: 3g` on ClickHouse; the
  `users.d` per-query cap is still 6 GB. On an 8 GB box, lower
  `max_memory_usage` to ~2.5 GB in `clickhouse/users.d/lognog.xml` to stay under the
  container limit.
- **Reset the admin password** post-migration and rotate client API keys for a
  clean baseline.

---

## 6. What only Robert (or cloud/Cloudflare access) can do

Everything up to the bundle is done autonomously. These need the cloud box shell,
the Coolify UI, or the Cloudflare dashboard:

1. Copy `migration-bundle/` to the cloud box and run `scripts/migrate-to-coolify.sh` (§2).
2. Set SMTP (and, to preserve sessions, the desktop JWT/CH secrets) in Coolify (§3).
3. Add `logs.…` to the service, re-create Cloudflare Access with the `/api/ingest`
   bypass, repoint `logs.…` DNS to the cloud (§4).
4. Stop the desktop stack after verification (§4.5).

Give me SSH to the box (or run steps 1–2 in the Coolify terminal) and I can drive
the data load + verification directly.
