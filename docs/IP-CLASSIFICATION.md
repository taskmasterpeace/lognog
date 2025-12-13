# IP Classification Feature

## Overview

LogNog includes built-in IP address classification that works completely offline without external API calls. This is a low-lift cybersecurity feature that helps identify internal vs. external traffic, detect private networks, and classify special-use IP addresses.

## Features

- **Fully offline**: No external API calls required
- **Fast**: Pure TypeScript implementation with no dependencies
- **Comprehensive**: Classifies all major IP address types based on RFCs
- **Dual backend**: Works with both ClickHouse and SQLite backends
- **DSL integration**: Use IP classification functions directly in queries

## IP Address Types

| Type | Description | Examples |
|------|-------------|----------|
| `private` | RFC 1918 private addresses + Carrier-Grade NAT | 10.x.x.x, 172.16-31.x.x, 192.168.x.x, 100.64-127.x.x |
| `public` | Routable public IP addresses | 8.8.8.8, 1.1.1.1 |
| `loopback` | Loopback addresses | 127.0.0.1 |
| `link_local` | Link-local/APIPA addresses | 169.254.x.x |
| `multicast` | Multicast addresses | 224.0.0.0 - 239.255.255.255 |
| `reserved` | Reserved for special use | 0.0.0.0, 192.0.2.x (TEST-NET), etc. |

## API Endpoints

### Classify Single IP

**GET** `/utils/classify-ip?ip=192.168.1.1`

```json
{
  "success": true,
  "classification": {
    "ip": "192.168.1.1",
    "type": "private",
    "is_internal": true,
    "risk_level": "low",
    "range_name": "RFC1918 Class C",
    "description": "Private network (192.168.0.0/16)"
  }
}
```

### Classify Multiple IPs (Batch)

**POST** `/utils/classify-ips`

```json
{
  "ips": ["192.168.1.1", "8.8.8.8", "127.0.0.1"]
}
```

Response:
```json
{
  "success": true,
  "count": 3,
  "classifications": {
    "192.168.1.1": {
      "ip": "192.168.1.1",
      "type": "private",
      "is_internal": true,
      "risk_level": "low",
      "range_name": "RFC1918 Class C"
    },
    "8.8.8.8": {
      "ip": "8.8.8.8",
      "type": "public",
      "is_internal": false,
      "risk_level": "external"
    },
    "127.0.0.1": {
      "ip": "127.0.0.1",
      "type": "loopback",
      "is_internal": true,
      "risk_level": "none",
      "range_name": "Loopback"
    }
  }
}
```

## DSL Query Functions

### `classify_ip(ip_field)`

Returns the type of the IP address as a string.

**Example:**
```
search source_ip=*
| eval ip_type=classify_ip(source_ip)
| stats count by ip_type
```

**Result:**
```
ip_type    count
-------    -----
private    1234
public     567
loopback   12
```

### `is_public_ip(ip_field)`

Returns `true` if the IP is a public (routable) address.

**Example:**
```
search *
| where is_public_ip(source_ip)
| table timestamp source_ip hostname message
```

### `is_private_ip(ip_field)`

Returns `true` if the IP is RFC 1918 private or Carrier-Grade NAT.

**Example:**
```
search *
| where is_private_ip(source_ip)
| stats count by hostname
```

### `is_internal_ip(ip_field)`

Returns `true` if the IP is internal (private, loopback, link-local, reserved, multicast).

**Example:**
```
search *
| where NOT is_internal_ip(source_ip)
| table timestamp source_ip message
| sort desc timestamp
| limit 100
```

### Other Helper Functions

- `is_loopback_ip(ip_field)` - Checks for loopback addresses (127.x.x.x)
- `is_link_local_ip(ip_field)` - Checks for link-local/APIPA (169.254.x.x)
- `is_multicast_ip(ip_field)` - Checks for multicast addresses
- `is_reserved_ip(ip_field)` - Checks for reserved addresses

## Use Cases

### 1. Detect External Connections

Find all connections from public IP addresses:

```
search *
| where is_public_ip(source_ip)
| stats count by source_ip hostname
| sort desc count
```

### 2. Identify Private Network Traffic

Group logs by IP type to understand your network topology:

```
search *
| eval ip_type=classify_ip(source_ip)
| stats count by ip_type
```

### 3. Alert on External Access

Create an alert for connections from non-internal IPs:

```
search app_name="ssh"
| where NOT is_internal_ip(source_ip)
| stats count
```

### 4. Network Segmentation Analysis

Analyze traffic patterns between internal and external networks:

```
search *
| eval source_type=classify_ip(source_ip)
| eval dest_type=classify_ip(dest_ip)
| stats count by source_type dest_type
```

## RFC References

The IP classifier implements the following RFCs:

- **RFC 1918**: Private Internet Address Allocation
  - 10.0.0.0/8 (Class A)
  - 172.16.0.0/12 (Class B)
  - 192.168.0.0/16 (Class C)

- **RFC 5735**: Special Use IPv4 Addresses
  - 0.0.0.0/8 (This Network)
  - 127.0.0.0/8 (Loopback)
  - 169.254.0.0/16 (Link-Local)
  - 192.0.0.0/24 (IETF Protocol Assignments)
  - 192.0.2.0/24 (TEST-NET-1)
  - 198.51.100.0/24 (TEST-NET-2)
  - 203.0.113.0/24 (TEST-NET-3)
  - 224.0.0.0/4 (Multicast)
  - 240.0.0.0/4 (Reserved)

- **RFC 6598**: Carrier-Grade NAT
  - 100.64.0.0/10 (Shared Address Space)

## Implementation Details

### Service Layer (`api/src/services/ip-classifier.ts`)

Pure TypeScript implementation with no external dependencies:
- Converts IPs to 32-bit integers for efficient range checking
- Pre-computed IP ranges for all special-use addresses
- Batch classification with automatic deduplication

### DSL Integration

#### ClickHouse Backend
Uses native `toIPv4()` function and `BETWEEN` for efficient IP range queries:
```sql
SELECT multiIf(
  toIPv4(source_ip) BETWEEN toIPv4('10.0.0.0') AND toIPv4('10.255.255.255'), 'private',
  toIPv4(source_ip) BETWEEN toIPv4('127.0.0.0') AND toIPv4('127.255.255.255'), 'loopback',
  -- ... more ranges ...
  'public'
) AS ip_type
```

#### SQLite Backend
Custom IP-to-number conversion for range checking:
```sql
SELECT CASE
  WHEN (ip_numeric BETWEEN 167772160 AND 184549375) THEN 'private'  -- 10.x.x.x
  WHEN (ip_numeric BETWEEN 2130706432 AND 2147483647) THEN 'loopback'  -- 127.x.x.x
  -- ... more ranges ...
  ELSE 'public'
END AS ip_type
```

## Performance

- **API**: < 1ms per IP classification
- **Batch API**: ~0.1ms per IP (with deduplication)
- **DSL queries**: Compiled to native SQL, no overhead

## Testing

Comprehensive test suite with 33 test cases covering:
- All RFC 1918 private ranges
- RFC 5735 special-use addresses
- RFC 6598 Carrier-Grade NAT
- Edge cases and boundary conditions
- Real-world examples (Google DNS, Cloudflare, etc.)

Run tests:
```bash
cd api
npm test -- ip-classifier.test.ts
```

## Future Enhancements

Potential additions (not yet implemented):
- IPv6 support
- User-defined custom IP ranges/classifications
- GeoIP integration (Phase 5 of roadmap)
- IP reputation scoring
- WHOIS lookups
