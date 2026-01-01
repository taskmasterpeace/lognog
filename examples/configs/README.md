# Example Configurations

This directory contains example configuration files for integrating LogNog with various systems.

## Files

| File | Description |
|------|-------------|
| `rsyslog.conf` | Linux rsyslog configuration |
| `syslog-ng.conf` | syslog-ng configuration |
| `docker-compose.override.yml` | Docker Compose customizations |
| `.env.example` | Environment variables template |
| `vector-custom.toml` | Custom Vector transforms |

## Usage

### rsyslog (Linux)

```bash
# Copy to rsyslog config directory
sudo cp rsyslog.conf /etc/rsyslog.d/lognog.conf

# Edit to set your LogNog IP
sudo nano /etc/rsyslog.d/lognog.conf

# Restart rsyslog
sudo systemctl restart rsyslog
```

### syslog-ng

```bash
# Copy to syslog-ng config directory
sudo cp syslog-ng.conf /etc/syslog-ng/conf.d/lognog.conf

# Edit to set your LogNog IP
sudo nano /etc/syslog-ng/conf.d/lognog.conf

# Restart syslog-ng
sudo systemctl restart syslog-ng
```

### Docker Compose

```bash
# Copy to your LogNog directory
cp docker-compose.override.yml /path/to/lognog/

# Customize as needed
nano docker-compose.override.yml

# Restart LogNog
docker-compose up -d
```

### Environment Variables

```bash
# Copy to your LogNog directory
cp .env.example /path/to/lognog/.env

# Edit with your settings
nano /path/to/lognog/.env

# Restart LogNog
docker-compose up -d
```

## Need Help?

- [Quick Start Guide](../../docs/QUICK_START.md)
- [Full Documentation](../../docs/README.md)
