# LogNog Deployment Guide

> Secure self-hosting options for SMBs, homelabs, and teams

---

## Deployment Options Overview

| Option | Best For | Complexity | Cost |
|--------|----------|------------|------|
| **Local Only** | Development, testing | Easy | Free |
| **VPS** | Teams, production | Medium | $5-50/mo |
| **Cloudflare Tunnel** | Home → Internet | Easy | Free |
| **Tailscale** | Private team access | Easy | Free (personal) |
| **Self-hosted Tunnel** | Full control | Medium-Hard | Free |

---

## Option 1: Local Network Only

Perfect for homelabs where all your devices are on the same network.

```bash
# Start LogNog
docker-compose up -d

# Access from any device on your network
# Find your server's local IP
ip addr show  # Linux
ipconfig      # Windows

# Access at http://192.168.1.X:80
```

**Agent Configuration:**
```yaml
# config.yaml on each machine
server_url: "http://192.168.1.100:4000"  # Your LogNog server IP
api_key: "your-api-key"
```

**Pros:**
- No internet exposure
- Zero additional setup
- Maximum privacy

**Cons:**
- Only works on local network
- No remote access

---

## Option 2: VPS Deployment

Run LogNog on a VPS for team access from anywhere.

### Recommended VPS Providers

| Provider | Minimum Tier | Price | Notes |
|----------|--------------|-------|-------|
| **Hetzner** | CX11 (2GB) | €4.50/mo | Best value, EU/US |
| **DigitalOcean** | Basic (2GB) | $12/mo | Easy setup |
| **Linode** | Nanode (1GB) | $5/mo | Good for lite mode |
| **Vultr** | High Frequency | $6/mo | Fast storage |
| **OVH** | VPS Starter | €3.50/mo | Budget option |

### Setup Steps

```bash
# 1. SSH into your VPS
ssh root@your-vps-ip

# 2. Install Docker
curl -fsSL https://get.docker.com | sh

# 3. Install Docker Compose
apt install docker-compose-plugin  # or docker-compose

# 4. Clone LogNog
git clone https://github.com/taskmasterpeace/lognog.git
cd lognog

# 5. Configure (optional: edit docker-compose.yml)
# Change ports, volumes, etc.

# 6. Start
docker compose up -d

# 7. Set up firewall
ufw allow 22    # SSH
ufw allow 80    # HTTP
ufw allow 443   # HTTPS
ufw allow 514   # Syslog (if needed)
ufw enable
```

### Add SSL with Caddy (Recommended)

```bash
# Install Caddy
apt install caddy

# /etc/caddy/Caddyfile
lognog.yourdomain.com {
    reverse_proxy localhost:80
}

# Start Caddy
systemctl enable caddy
systemctl start caddy
```

Caddy automatically provisions SSL certificates via Let's Encrypt.

---

## Option 3: Cloudflare Tunnel (Recommended for Home → Internet)

Expose your local LogNog to the internet without opening ports. **Free tier available.**

### Why Cloudflare Tunnel?

- **No port forwarding** - Works behind any NAT/firewall
- **Free SSL** - Automatic HTTPS
- **DDoS protection** - Cloudflare's network
- **Zero Trust** - Optional authentication layer
- **Unlimited bandwidth** - No caps on free tier

### Setup Steps

#### 1. Create Cloudflare Account
- Go to [cloudflare.com](https://cloudflare.com)
- Add your domain (or use a free `.cfargotunnel.com` subdomain)

#### 2. Install cloudflared

```bash
# Linux
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared
sudo mv cloudflared /usr/local/bin/

# macOS
brew install cloudflare/cloudflare/cloudflared

# Windows
# Download from: https://github.com/cloudflare/cloudflared/releases
```

#### 3. Authenticate

```bash
cloudflared tunnel login
# Opens browser to authenticate with Cloudflare
```

#### 4. Create Tunnel

```bash
# Create tunnel
cloudflared tunnel create lognog

# Note the tunnel ID (e.g., a1b2c3d4-5678-90ab-cdef-1234567890ab)
```

#### 5. Configure Tunnel

```yaml
# ~/.cloudflared/config.yml
tunnel: a1b2c3d4-5678-90ab-cdef-1234567890ab
credentials-file: /home/user/.cloudflared/a1b2c3d4-5678-90ab-cdef-1234567890ab.json

ingress:
  # LogNog UI and API
  - hostname: lognog.yourdomain.com
    service: http://localhost:80

  # Optional: Direct syslog (TCP only via cloudflared)
  # - hostname: syslog.yourdomain.com
  #   service: tcp://localhost:514

  # Catch-all (required)
  - service: http_status:404
```

#### 6. Route DNS

```bash
cloudflared tunnel route dns lognog lognog.yourdomain.com
```

#### 7. Run Tunnel

```bash
# Test
cloudflared tunnel run lognog

# Run as service (Linux)
sudo cloudflared service install
sudo systemctl start cloudflared

# Run as service (Windows)
cloudflared service install
net start cloudflared
```

### Agent Configuration with Cloudflare

```yaml
# Agent config.yaml
server_url: "https://lognog.yourdomain.com"
api_key: "your-api-key"
```

### Optional: Add Cloudflare Access (Zero Trust Auth)

For extra security, require authentication before reaching LogNog:

1. Go to Cloudflare Dashboard → Zero Trust → Access → Applications
2. Add Application → Self-hosted
3. Set application domain: `lognog.yourdomain.com`
4. Add policy: Allow email domain `@yourcompany.com`

Now users must authenticate with Cloudflare before reaching LogNog.

---

## Option 4: Tailscale (Private Network Access)

Create a private network between your devices. Perfect for team access without public exposure.

### Why Tailscale?

- **No public exposure** - Devices connect directly
- **Easy setup** - Single command install
- **Works everywhere** - Behind NAT, firewalls, cellular
- **Free tier** - Up to 100 devices, 3 users

### Setup Steps

#### 1. Install Tailscale on LogNog Server

```bash
# Linux
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# macOS
brew install tailscale
tailscale up

# Windows
# Download from https://tailscale.com/download
```

#### 2. Note Your Tailscale IP

```bash
tailscale ip -4
# Example: 100.64.0.1
```

#### 3. Install Tailscale on Client Machines

Install Tailscale on any machine that needs to access LogNog or send logs.

#### 4. Agent Configuration

```yaml
# Agent config.yaml (use Tailscale IP)
server_url: "http://100.64.0.1:4000"
api_key: "your-api-key"
```

### Tailscale + Cloudflare Combo

For best of both worlds:
- **Tailscale** for internal team access (fast, private)
- **Cloudflare Tunnel** for receiving logs from external sources

```yaml
# Agent on internal machine (via Tailscale)
server_url: "http://100.64.0.1:4000"

# Agent on external machine (via Cloudflare)
server_url: "https://lognog.yourdomain.com"
```

---

## Option 5: Self-Hosted Tunnels (Full Control)

For those who want complete control without third-party services.

### Headscale (Self-Hosted Tailscale)

Open-source Tailscale control server.

```bash
# Install Headscale
docker run -d \
  --name headscale \
  -p 8080:8080 \
  -v /etc/headscale:/etc/headscale \
  headscale/headscale:latest

# Configure and use with official Tailscale clients
```

**Pros:** Full Tailscale features, completely self-hosted
**Cons:** More setup, need to maintain control server

### FRP (Fast Reverse Proxy)

Popular in Asia, fully self-hosted tunneling.

```bash
# On your VPS (server)
# frps.ini
[common]
bind_port = 7000

# Start server
./frps -c frps.ini
```

```bash
# On your home server (client)
# frpc.ini
[common]
server_addr = your-vps-ip
server_port = 7000

[lognog]
type = http
local_ip = 127.0.0.1
local_port = 80
custom_domains = lognog.yourdomain.com

# Start client
./frpc -c frpc.ini
```

**Pros:** No third-party dependency, very configurable
**Cons:** Need a VPS for the server component

### Rathole (Rust-based, High Performance)

Modern alternative to FRP with better performance.

```bash
# Server config (server.toml)
[server]
bind_addr = "0.0.0.0:2333"

[server.services.lognog]
token = "your-secret-token"
bind_addr = "0.0.0.0:80"

# Client config (client.toml)
[client]
remote_addr = "your-vps-ip:2333"

[client.services.lognog]
token = "your-secret-token"
local_addr = "127.0.0.1:80"
```

### Comparison of Self-Hosted Options

| Solution | Language | Performance | Complexity |
|----------|----------|-------------|------------|
| **Headscale** | Go | Excellent | Medium |
| **FRP** | Go | Good | Low |
| **Rathole** | Rust | Excellent | Low |
| **Chisel** | Go | Good | Very Low |
| **Bore** | Rust | Good | Very Low |

---

## Security Considerations

### 1. Always Use HTTPS in Production

```yaml
# Agent config - always use https:// for remote servers
server_url: "https://lognog.yourdomain.com"
```

### 2. Rotate API Keys Regularly

Generate new API keys and update agents periodically.

### 3. Network Segmentation

If possible, put LogNog on a separate VLAN from sensitive systems.

### 4. Firewall Rules

Only open necessary ports:

```bash
# Minimum for local network
ufw allow from 192.168.1.0/24 to any port 80    # UI
ufw allow from 192.168.1.0/24 to any port 4000  # API
ufw allow from 192.168.1.0/24 to any port 514   # Syslog

# For Cloudflare Tunnel - no ports needed!
# Tunnel makes outbound connections only
```

### 5. Log Retention

Set appropriate retention in ClickHouse:

```sql
-- In clickhouse/init/01_schema.sql
ALTER TABLE logs MODIFY TTL timestamp + INTERVAL 90 DAY;
```

---

## Architecture for SMBs

### Small Team (1-10 machines)

```
┌──────────────┐     ┌──────────────┐
│   Laptop 1   │────▶│              │
│  (Agent)     │     │   LogNog     │
└──────────────┘     │   Lite       │
                     │  (SQLite)    │
┌──────────────┐     │              │
│   Server 1   │────▶│  Windows PC  │
│  (Agent)     │     │  or small    │
└──────────────┘     │  Linux box   │
                     └──────────────┘
                           │
                     Tailscale for
                     remote access
```

**Recommended:** LogNog Lite on a Windows PC or small Linux box, Tailscale for remote access.

### Medium Team (10-50 machines)

```
┌──────────────┐
│   Office     │─────┐
│   Devices    │     │
└──────────────┘     │
                     ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   Cloud      │  │   LogNog     │  │   Cloudflare │
│   Services   │─▶│   Full       │◀─│   Tunnel     │
│  (Vercel,    │  │  (Docker)    │  │   (public)   │
│   Supabase)  │  │              │  └──────────────┘
└──────────────┘  │  VPS or      │
                  │  On-premise  │
┌──────────────┐  │              │
│   Remote     │─▶│              │
│   Workers    │  └──────────────┘
│  (Agents)    │         │
└──────────────┘    Tailscale for
                    admin access
```

**Recommended:** LogNog Full on a VPS, Cloudflare Tunnel for log ingestion, Tailscale for admin access.

### Multi-Site

```
┌─────────────────────┐    ┌─────────────────────┐
│     Site A          │    │     Site B          │
│  ┌──────────────┐   │    │  ┌──────────────┐   │
│  │   Servers    │   │    │  │   Servers    │   │
│  │   (Agents)   │   │    │  │   (Agents)   │   │
│  └──────┬───────┘   │    │  └──────┬───────┘   │
│         │           │    │         │           │
│         ▼           │    │         ▼           │
│  ┌──────────────┐   │    │  ┌──────────────┐   │
│  │  Tailscale   │───┼────┼──│  Tailscale   │   │
│  └──────────────┘   │    │  └──────────────┘   │
└─────────────────────┘    └─────────────────────┘
            │                        │
            └───────────┬────────────┘
                        ▼
              ┌──────────────────┐
              │   Central        │
              │   LogNog Full    │
              │   (Datacenter    │
              │    or Cloud)     │
              └──────────────────┘
```

---

## Quick Reference: Agent Config by Deployment Type

### Local Network
```yaml
server_url: "http://192.168.1.100:4000"
api_key: "lnog_xxxxxx"
```

### VPS with SSL
```yaml
server_url: "https://lognog.yourdomain.com"
api_key: "lnog_xxxxxx"
```

### Cloudflare Tunnel
```yaml
server_url: "https://lognog.yourdomain.com"
api_key: "lnog_xxxxxx"
```

### Tailscale
```yaml
server_url: "http://100.64.x.x:4000"
api_key: "lnog_xxxxxx"
```

### Tailscale with MagicDNS
```yaml
server_url: "http://lognog-server:4000"  # MagicDNS hostname
api_key: "lnog_xxxxxx"
```

---

## Hosted LogNog (Coming Soon)

Don't want to manage infrastructure? A hosted version is in development.

- **Zero setup** - Sign up and start logging
- **Managed scaling** - We handle ClickHouse, backups, updates
- **Same features** - Full LogNog experience
- **Data sovereignty options** - Choose your region

Star the repo to get notified: [github.com/taskmasterpeace/lognog](https://github.com/taskmasterpeace/lognog)

---

## Troubleshooting

### Agent Can't Connect

```bash
# Check if LogNog is running
curl http://localhost:4000/health

# Check firewall
sudo ufw status

# Check Cloudflare Tunnel
cloudflared tunnel info lognog

# Check Tailscale
tailscale status
```

### Logs Not Appearing

1. Check agent status in system tray (Windows) or logs
2. Verify API key is correct
3. Check LogNog API logs: `docker compose logs api`

### SSL Certificate Issues

```bash
# With Caddy - check logs
journalctl -u caddy -f

# With Cloudflare - should be automatic
# Check tunnel status
cloudflared tunnel info
```

---

## Resources

- [Cloudflare Tunnel Docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- [Tailscale Docs](https://tailscale.com/kb/)
- [Headscale GitHub](https://github.com/juanfont/headscale)
- [FRP GitHub](https://github.com/fatedier/frp)
- [Rathole GitHub](https://github.com/rapiz1/rathole)
- [Awesome Tunneling List](https://github.com/anderspitman/awesome-tunneling)

---

*Last updated: 2025-01-13*
*By Machine King Labs*
