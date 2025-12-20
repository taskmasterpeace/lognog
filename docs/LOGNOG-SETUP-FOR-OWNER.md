# LogNog Setup Guide (For You - The Owner)

This guide walks you through setting up LogNog on your homelab and getting the API key to give your developers.

---

## How It Works

```
Director's Palette (Vercel)          Your House (LogNog)
        │                                    │
        │  "Hey, someone signed up"          │
        │  ─────────────────────────────►    │ Stored!
        │                                    │
        │  "Image generated"                 │
        │  ─────────────────────────────►    │ Stored!
        │                                    │
        │  "Error happened"                  │
        │  ─────────────────────────────►    │ Stored!
        │                                    │
```

**Director's Palette PUSHES logs to LogNog.** No polling. Instant. Real-time.

---

## Step 1: Start LogNog

Open a terminal in the LogNog folder:

```bash
cd C:\git\spunk
```

**Without Cloudflare Tunnel (local only):**
```bash
docker-compose up -d
```

**With Cloudflare Tunnel (internet accessible):**
```bash
docker-compose --profile tunnel up -d
```

Wait about 30 seconds for everything to start.

---

## Step 2: Access LogNog

Open your browser:
- **Local:** http://localhost
- **With tunnel:** https://logs.directorspal.com (after you set up Cloudflare)

---

## Step 3: Create Your Admin Account

First time only:
1. Go to http://localhost
2. You'll see a "Setup" page
3. Create your admin username and password
4. Log in

---

## Step 4: Create an API Key for Director's Palette

This is what you give your developers:

1. Click the **gear icon** (Settings) in the sidebar
2. Scroll down to **API Keys**
3. Click **Create API Key**
4. Name it: `Directors Palette Production`
5. **COPY THE KEY** - it's only shown once!
6. The key looks like: `lnog_abc123xyz789...`

---

## Step 5: Give Your Developers

Send them two things:

### 1. The API Key
```
LOGNOG_API_KEY=lnog_abc123xyz789... (your actual key)
```

### 2. The URL
```
LOGNOG_URL=https://logs.directorspal.com/api/ingest/http
```

(Or `http://localhost/api/ingest/http` if testing locally)

### 3. Point them to the docs
The integration guide is at: `docs/DIRECTORS-PALETTE-INTEGRATION.md`

---

## Step 6: Set Up Cloudflare Tunnel (When Ready)

This makes LogNog accessible from the internet (so Vercel can reach it).

### Get Your Tunnel Token

1. Go to https://one.dash.cloudflare.com (Cloudflare Zero Trust)
2. Click **Networks** → **Tunnels**
3. Click **Create a tunnel**
4. Select **Cloudflared** → Next
5. Name: `lognog`
6. **Copy the token** (long string starting with `eyJ...`)
7. Click through to **Public Hostname**
8. Add hostname:
   - Subdomain: `logs`
   - Domain: `directorspal.com`
   - Type: `HTTP`
   - URL: `nginx:80`
9. Save

### Add Token to LogNog

Create a `.env` file in your LogNog folder:

```bash
cd C:\git\spunk
notepad .env
```

Add:
```
CLOUDFLARE_TUNNEL_TOKEN=eyJhIjo...your-token-here
JWT_SECRET=make-up-a-random-32-character-string
JWT_REFRESH_SECRET=another-random-32-character-string
```

### Restart with Tunnel

```bash
docker-compose --profile tunnel up -d
```

Now `https://logs.directorspal.com` points to your house!

---

## Verifying It Works

### Test 1: Check LogNog is Running

```bash
curl http://localhost/health
```

Should say: `healthy`

### Test 2: Check API Key Works

```bash
curl -X POST http://localhost/api/ingest/http \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY_HERE" \
  -d '[{"timestamp":"2025-01-01T00:00:00Z","app_name":"test","message":"hello"}]'
```

Should return: `{"success":true,"count":1}`

### Test 3: See It in the UI

1. Go to http://localhost
2. Click **Search**
3. Type: `search app_name=test`
4. You should see your test log

---

## What Your Developers Put in Director's Palette

They add this to their `.env.local`:

```
LOGNOG_URL=https://logs.directorspal.com/api/ingest/http
LOGNOG_API_KEY=lnog_abc123xyz789...
```

And create the logger file from the integration guide.

---

## Viewing Your Logs

Once Director's Palette is sending logs:

### See All Director's Palette Logs
```
search app_name=directors-palette
```

### See Image Generations
```
search app_name=directors-palette message=generation_completed
```

### See Errors
```
search app_name=directors-palette message=error
```

### See Payments
```
search app_name=directors-palette message=payment_success
```

---

## Quick Reference

| What | Where |
|------|-------|
| LogNog UI | http://localhost or https://logs.directorspal.com |
| API Key creation | Settings → API Keys |
| Logs arrive | Instantly (push, not poll) |
| Search logs | Search page in UI |

---

## Troubleshooting

### "Connection refused" from Vercel

- Is Cloudflare tunnel running? Check: `docker ps | grep cloudflared`
- Is the tunnel token correct in `.env`?
- Did you set up the public hostname in Cloudflare?

### "Unauthorized" error

- Is the API key correct?
- Did you include the `X-API-Key` header?

### No logs appearing

- Check the developer added the logger code
- Check the env variables are set in Vercel
- Check the app is actually calling `log()`

---

## Commands Cheat Sheet

```bash
# Start LogNog
docker-compose up -d

# Start with Cloudflare tunnel
docker-compose --profile tunnel up -d

# View logs
docker-compose logs -f

# Stop everything
docker-compose down

# Check what's running
docker ps

# Restart
docker-compose restart
```

---

## Summary

1. Start LogNog: `docker-compose up -d`
2. Go to http://localhost
3. Create admin account
4. Create API key in Settings
5. Give developers: API key + URL + integration guide
6. (Later) Set up Cloudflare tunnel for internet access

That's it. Logs flow automatically once your devs add the code.
