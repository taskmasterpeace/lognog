# Machine King Labs - Cloudflare Tunnel Setup

## Overview

Your local services are now accessible from anywhere via Cloudflare Tunnel. The tunnel creates a secure connection from your home network to Cloudflare's edge, without opening any ports on your router.

---

## Your Public URLs

| Service | URL | Local Port | Description |
|---------|-----|------------|-------------|
| **Ollama AI** | https://ai.machinekinglabs.com | localhost:11434 | LLM API (DeepSeek, Qwen, embeddings) |
| **LogNog** | https://logs.machinekinglabs.com | localhost:80 | Log management dashboard |
| **Chatterbox** | https://voice.machinekinglabs.com | localhost:4123 | Text-to-speech & voice cloning |

---

## Architecture

```
Internet                     Cloudflare                    Your Machine
─────────                    ──────────                    ────────────

User Request  ──────────►  Cloudflare Edge  ◄────────────  cloudflared
                           (HTTPS/SSL)          Tunnel     (Windows Service)
                                 │                              │
                                 │                              │
                           Routes by hostname                   │
                                 │                              ▼
                                 │                         localhost:11434 (Ollama)
                                 │                         localhost:80    (LogNog)
                                 │                         localhost:4123  (Chatterbox)
```

**Key benefits:**
- No port forwarding required
- Automatic HTTPS certificates
- DDoS protection included
- Works behind NAT/CGNAT

---

## Tunnel Details

| Property | Value |
|----------|-------|
| **Tunnel Name** | presidium-ai |
| **Tunnel ID** | 549dd5b7-96fe-4132-ac60-57123b30efad |
| **Status** | Healthy (4 connections) |
| **Connector** | cloudflared Windows Service |

---

## How It Works

1. **cloudflared** runs as a Windows service on your machine
2. It maintains persistent connections to Cloudflare's edge
3. When someone visits `ai.machinekinglabs.com`:
   - Request goes to Cloudflare
   - Cloudflare routes it through the tunnel
   - cloudflared forwards it to `localhost:11434`
   - Response flows back the same way

---

## DNS Records (Cloudflare)

| Subdomain | Type | Target |
|-----------|------|--------|
| ai | CNAME | 549dd5b7-96fe-4132-ac60-57123b30efad.cfargotunnel.com |
| logs | CNAME | 549dd5b7-96fe-4132-ac60-57123b30efad.cfargotunnel.com |
| voice | CNAME | 549dd5b7-96fe-4132-ac60-57123b30efad.cfargotunnel.com |

Your main site is unchanged:
- `www.machinekinglabs.com` → Vercel (your website)
- `machinekinglabs.com` → GoDaddy parking page

---

## Managing the Tunnel

### Check Tunnel Status

```bash
# View tunnel in Cloudflare dashboard
# https://one.dash.cloudflare.com/ → Networks → Tunnels
```

### Restart cloudflared (Windows)

```powershell
# As Administrator
net stop cloudflared
net start cloudflared
```

### View cloudflared Logs

```powershell
# Logs are in Windows Event Viewer
# Or: C:\Windows\System32\config\systemprofile\.cloudflared\
```

---

## Adding New Services

### Via Cloudflare Dashboard

1. Go to https://one.dash.cloudflare.com/
2. Networks → Tunnels → **presidium-ai** → Configure
3. Add Public Hostname:
   - Subdomain: `newservice`
   - Domain: machinekinglabs.com
   - Type: HTTP
   - URL: `localhost:PORT`
4. Save

### Via API

```bash
# Get current config
curl "https://api.cloudflare.com/client/v4/accounts/55eba397da04ea21cf0ffbca29957d41/cfd_tunnel/549dd5b7-96fe-4132-ac60-57123b30efad/configurations" \
  -H "Authorization: Bearer YOUR_API_TOKEN"

# Update config (add to ingress array)
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/55eba397da04ea21cf0ffbca29957d41/cfd_tunnel/549dd5b7-96fe-4132-ac60-57123b30efad/configurations" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "ingress": [
        {"hostname": "ai.machinekinglabs.com", "service": "http://localhost:11434"},
        {"hostname": "logs.machinekinglabs.com", "service": "http://localhost:80"},
        {"hostname": "voice.machinekinglabs.com", "service": "http://localhost:4123"},
        {"hostname": "newservice.machinekinglabs.com", "service": "http://localhost:NEWPORT"},
        {"service": "http_status:404"}
      ]
    }
  }'

# Add DNS record for new subdomain
curl -X POST "https://api.cloudflare.com/client/v4/zones/6b1c7d0329bd40ab6c1b8c829233d562/dns_records" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "CNAME",
    "name": "newservice",
    "content": "549dd5b7-96fe-4132-ac60-57123b30efad.cfargotunnel.com",
    "proxied": true
  }'
```

---

## Security Notes

1. **Your services are now public** - Anyone with the URL can access them
2. **Add authentication** - Consider adding API keys or Cloudflare Access
3. **Rotate API tokens** - The tokens used during setup should be regenerated
4. **Monitor access** - Check Cloudflare Analytics for traffic patterns

### Adding Cloudflare Access (Optional)

For services that need authentication:
1. Go to Cloudflare Zero Trust → Access → Applications
2. Add Application → Self-hosted
3. Set domain (e.g., `logs.machinekinglabs.com`)
4. Add authentication policy (email, SSO, etc.)

---

## Troubleshooting

### "Site can't be reached"

1. Check if cloudflared is running:
   ```powershell
   Get-Service cloudflared
   ```

2. Check tunnel status in Cloudflare dashboard

3. Verify local service is running:
   ```bash
   curl localhost:11434/api/tags  # Ollama
   curl localhost:80/health       # LogNog
   curl localhost:4123/health     # Chatterbox
   ```

### "502 Bad Gateway"

The tunnel is working but the local service isn't responding:
- Check if Docker containers are running
- Check if the service is on the expected port

### DNS Not Resolving

After nameserver change, wait up to 48 hours for full propagation.
Check propagation: https://www.whatsmydns.net/#A/ai.machinekinglabs.com

---

## Reference

| Resource | URL |
|----------|-----|
| Cloudflare Dashboard | https://dash.cloudflare.com/ |
| Zero Trust Dashboard | https://one.dash.cloudflare.com/ |
| Tunnel Documentation | https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/ |
| Account ID | 55eba397da04ea21cf0ffbca29957d41 |
| Zone ID | 6b1c7d0329bd40ab6c1b8c829233d562 |

---

## Quick Test Commands

```bash
# Test Ollama
curl https://ai.machinekinglabs.com/api/tags

# Test LogNog
curl https://logs.machinekinglabs.com/health

# Test Chatterbox
curl https://voice.machinekinglabs.com/health

# Generate text with Ollama
curl https://ai.machinekinglabs.com/api/generate -d '{
  "model": "deepseek-coder-v2:16b",
  "prompt": "Hello!",
  "stream": false
}'
```

---

**Machine King Labs** - Your Infrastructure, Your Control
