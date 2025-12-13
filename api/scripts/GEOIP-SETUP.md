# GeoIP Setup Guide

LogNog supports optional GeoIP lookups using MaxMind's free GeoLite2 databases. This feature allows you to determine the country, city, and ASN (Autonomous System Number) for IP addresses in your logs.

## Prerequisites

1. **MaxMind Account** (free)
   - Register at: https://www.maxmind.com/en/geolite2/signup
   - Verify your email address

2. **License Key**
   - After registering, log in to your MaxMind account
   - Navigate to: Account → Manage License Keys
   - Click "Generate New License Key"
   - Give it a name (e.g., "LogNog")
   - Select "No" for "Will this key be used for GeoIP Update?"
   - Save your Account ID and License Key securely

## Installation

### Docker Setup (Recommended)

1. **Set environment variables:**
   ```bash
   export MAXMIND_ACCOUNT_ID="your_account_id"
   export MAXMIND_LICENSE_KEY="your_license_key"
   ```

2. **Run the download script inside the API container:**
   ```bash
   docker exec -it lognog-api /bin/sh
   cd /app/scripts
   chmod +x download-geoip.sh
   MAXMIND_ACCOUNT_ID=your_id MAXMIND_LICENSE_KEY=your_key ./download-geoip.sh
   exit
   ```

3. **Restart the API container:**
   ```bash
   docker-compose restart api
   ```

### Manual Setup

1. **Download databases manually:**
   - Go to: https://www.maxmind.com/en/accounts/current/geoip/downloads
   - Download `GeoLite2-City` (GZIP format)
   - Download `GeoLite2-ASN` (GZIP format)

2. **Extract and place databases:**
   ```bash
   # Create directory
   mkdir -p /data/geoip

   # Extract City database
   tar -xzf GeoLite2-City_*.tar.gz
   mv GeoLite2-City_*/GeoLite2-City.mmdb /data/geoip/

   # Extract ASN database
   tar -xzf GeoLite2-ASN_*.tar.gz
   mv GeoLite2-ASN_*/GeoLite2-ASN.mmdb /data/geoip/
   ```

3. **Set environment variable (if needed):**
   ```bash
   export GEOIP_DATA_PATH=/data/geoip
   ```

4. **Restart LogNog API**

## Verification

Check if GeoIP is working:

```bash
# Using curl
curl http://localhost:4000/geoip/status

# Expected response:
{
  "enabled": true,
  "city_db_available": true,
  "asn_db_available": true,
  "city_db_path": "/data/geoip/GeoLite2-City.mmdb",
  "asn_db_path": "/data/geoip/GeoLite2-ASN.mmdb",
  "city_db_size": 72345678,
  "asn_db_size": 8234567,
  "city_db_modified": "2025-01-15T12:00:00.000Z",
  "asn_db_modified": "2025-01-15T12:00:00.000Z"
}
```

Test a lookup:

```bash
curl http://localhost:4000/geoip/lookup/8.8.8.8

# Expected response:
{
  "ip": "8.8.8.8",
  "country_code": "US",
  "country_name": "United States",
  "latitude": 37.751,
  "longitude": -97.822,
  "asn": 15169,
  "as_org": "Google LLC"
}
```

## Database Updates

MaxMind updates GeoLite2 databases **weekly on Tuesdays**. To keep your databases current:

### Automated Updates (Cron)

Add to your crontab:

```bash
# Update GeoIP databases every Wednesday at 3 AM
0 3 * * 3 docker exec lognog-api /app/scripts/download-geoip.sh
```

### Manual Updates

Simply re-run the download script:

```bash
docker exec -it lognog-api /bin/sh
MAXMIND_ACCOUNT_ID=your_id MAXMIND_LICENSE_KEY=your_key /app/scripts/download-geoip.sh
```

## Usage

### API Endpoints

- `GET /geoip/status` - Check GeoIP status
- `GET /geoip/lookup/:ip` - Lookup single IP
- `POST /geoip/lookup` - Batch lookup (body: `{"ips": ["8.8.8.8", "1.1.1.1"]}`)
- `GET /geoip/cache/stats` - View cache statistics
- `POST /geoip/cache/clear` - Clear lookup cache

### In LogNog UI

1. Navigate to **Settings → GeoIP**
2. View database status and last update time
3. Test lookups with the test tool
4. View setup instructions

### Future: DSL Integration (Coming Soon)

GeoIP enrichment in queries (planned):

```
search source_ip=*
  | eval country=geoip_country(source_ip)
  | eval city=geoip_city(source_ip)
  | stats count by country
```

## Troubleshooting

### "GeoIP service not available"

- Ensure databases are in the correct location: `/data/geoip/`
- Check file permissions (databases must be readable by the API process)
- Verify database files are not corrupted
- Check API logs for errors: `docker logs lognog-api`

### "No data found for this IP address"

- Private IPs (10.x.x.x, 192.168.x.x, etc.) are not in the GeoIP database
- Some public IPs may not have location data
- This is expected behavior

### Download errors

- Verify your MaxMind Account ID and License Key are correct
- Ensure you have an active MaxMind account
- Check your internet connection
- MaxMind may rate-limit downloads

## File Locations

- **Docker volume:** `geoip-data` → `/data/geoip` inside container
- **City database:** `/data/geoip/GeoLite2-City.mmdb` (~70MB)
- **ASN database:** `/data/geoip/GeoLite2-ASN.mmdb` (~8MB)
- **Download script:** `/app/scripts/download-geoip.sh`

## Performance

- Lookups are **cached** in memory for fast repeated queries
- Cache size: 10,000 entries (LRU eviction)
- Typical lookup time: <1ms (cached), <5ms (uncached)
- No external API calls - all lookups are local

## Privacy

GeoIP lookups are performed **100% locally** using downloaded databases. No IP addresses are sent to external services.

## License

MaxMind GeoLite2 databases are provided under the Creative Commons Attribution-ShareAlike 4.0 International License.

## Support

For issues with GeoIP functionality, check:
1. API logs: `docker logs lognog-api`
2. Database status: `curl http://localhost:4000/geoip/status`
3. LogNog documentation: https://github.com/yourusername/lognog
4. MaxMind support: https://support.maxmind.com/

## Additional Resources

- MaxMind GeoLite2: https://dev.maxmind.com/geoip/geolite2-free-geolocation-data
- GeoIP2 Database Format: https://maxmind.github.io/MaxMind-DB/
- LogNog Documentation: See main README.md
