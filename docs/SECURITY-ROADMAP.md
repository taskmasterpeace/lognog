# LogNog Security Roadmap

## Transforming LogNog into a Cybersecurity Platform

This document outlines the planned security features and integrations that will transform LogNog from a general-purpose log management tool into a powerful cybersecurity platform suitable for SOC operations, threat detection, and incident response.

---

## Current Security Capabilities

### What LogNog Can Do Today

- **Log Collection**: Syslog (UDP/TCP), OpenTelemetry, Agent-based collection
- **Real-time Search**: Splunk-like DSL for log analysis
- **Alerting**: Threshold-based alerts with email, webhook, and log actions
- **File Integrity Monitoring (FIM)**: Track file changes on endpoints
- **Dashboards**: Custom visualizations for monitoring

### Firewall Log Analysis (Current)

LogNog already handles firewall logs effectively:

```
# Search all firewall blocks
search app_name=pfsense message~"BLOCK"

# Find port scans
search message~"port scan" | stats count by source_ip | sort desc

# Top blocked IPs
search app_name~"firewall" message~"block" | stats count by source_ip | sort desc | limit 10
```

---

## Phase 1: Threat Intelligence Integration

### 1.1 IP Reputation Lookups

**Free/Open Source Options:**

| Service | Free Tier | Features |
|---------|-----------|----------|
| [AbuseIPDB](https://www.abuseipdb.com/) | 1,000/day | IP abuse reports, confidence scores |
| [AlienVault OTX](https://otx.alienvault.com/) | Unlimited | Pulses, IOCs, STIX/TAXII |
| [GreyNoise](https://www.greynoise.io/) | 50/day | Internet scanner detection |
| [Shodan](https://www.shodan.io/) | Limited | Device/service identification |

**Implementation:**

```typescript
// Lookup table: ip_reputation
// Fields: ip, reputation_score, last_checked, source, tags

// Example usage in DSL:
search source_ip=* | lookup ip_reputation source_ip OUTPUT reputation_score, tags
| filter reputation_score < 50
| table timestamp, source_ip, reputation_score, message
```

**API Integration Example:**

```typescript
// POST /api/enrich/ip
async function enrichIP(ip: string): Promise<IPEnrichment> {
  const [abuseIPDB, otx] = await Promise.all([
    checkAbuseIPDB(ip),
    checkAlienVaultOTX(ip),
  ]);

  return {
    ip,
    abuse_confidence: abuseIPDB.confidence,
    is_tor: otx.pulse_info?.includes('tor'),
    is_vpn: otx.pulse_info?.includes('vpn'),
    country: abuseIPDB.country_code,
    isp: abuseIPDB.isp,
    tags: [...abuseIPDB.categories, ...otx.tags],
  };
}
```

### 1.2 GeoIP Enrichment

**Free Options:**

| Database | Accuracy | Features |
|----------|----------|----------|
| [MaxMind GeoLite2](https://dev.maxmind.com/geoip/geolite2-free-geolocation-data/) | ~99% country | Country, City, ASN |
| [DB-IP Lite](https://db-ip.com/db/lite.php) | ~95% country | Country, ASN |
| [IP-API](https://ip-api.com/) | Good | Real-time API (45/min free) |

**Implementation:**

```typescript
// Auto-enrich logs on ingestion
function enrichLog(log: LogEvent): LogEvent {
  if (log.source_ip) {
    const geo = geoip.lookup(log.source_ip);
    log.geo_country = geo?.country;
    log.geo_city = geo?.city;
    log.geo_lat = geo?.ll?.[0];
    log.geo_lon = geo?.ll?.[1];
  }
  return log;
}
```

**Dashboard Widget:**
- World map showing attack sources
- Top countries by blocked connections
- Geo-based alerting (e.g., alert on logins from unexpected countries)

### 1.3 Threat Feed Integration

**Free Feeds:**

| Feed | Content | Format |
|------|---------|--------|
| [AlienVault OTX](https://otx.alienvault.com/) | IOCs, Pulses | STIX/TAXII, API |
| [Abuse.ch](https://abuse.ch/) | Malware, Botnets | CSV, API |
| [EmergingThreats](https://rules.emergingthreats.net/) | IP blocklists | Text |
| [CIRCL MISP](https://www.circl.lu/services/misp-malware-information-sharing-platform/) | Malware info | MISP format |
| [Spamhaus](https://www.spamhaus.org/) | Spam, Botnets | DNS, API |

**Scheduled Feed Updates:**

```typescript
// Daily threat feed sync
schedule('0 3 * * *', async () => {
  await syncAlienVaultOTX();
  await syncAbuseCH();
  await syncEmergingThreats();
  console.log('Threat feeds updated');
});
```

---

## Phase 2: Detection Rules (Sigma)

### 2.1 Sigma Rule Support

[Sigma](https://github.com/SigmaHQ/sigma) is the standard for sharing detection rules across SIEM platforms.

**Implementation Plan:**

1. **Rule Parser**: Parse Sigma YAML rules
2. **DSL Compiler**: Convert Sigma to LogNog DSL
3. **Rule Repository**: Store and manage rules
4. **Scheduler**: Run detection rules on schedule

**Example Sigma Rule:**

```yaml
title: Brute Force Attack
status: stable
logsource:
  category: authentication
  product: linux
detection:
  selection:
    eventtype: authentication_failure
  condition: selection | count(source_ip) by target_user > 5
level: high
tags:
  - attack.credential_access
  - attack.t1110
```

**Converted to LogNog DSL:**

```
search eventtype=authentication_failure
| stats count by source_ip, target_user
| filter count > 5
```

### 2.2 MITRE ATT&CK Mapping

Map alerts and detections to the [MITRE ATT&CK](https://attack.mitre.org/) framework.

**Database Schema:**

```sql
CREATE TABLE mitre_techniques (
  id TEXT PRIMARY KEY,
  tactic TEXT,
  technique_name TEXT,
  description TEXT,
  detection_tips TEXT
);

CREATE TABLE alert_mitre_mapping (
  alert_id TEXT,
  technique_id TEXT,
  confidence TEXT -- high, medium, low
);
```

**UI Enhancement:**
- ATT&CK Matrix view
- Coverage analysis (which techniques are detected)
- Drill-down from technique to related alerts

### 2.3 Pre-built Detection Packs

**Security Detection Packs:**

| Pack | Detections | Source |
|------|------------|--------|
| SSH Security | Brute force, key changes, root login | Built-in |
| Windows Security | Failed logins, privilege escalation | Sigma |
| Network Security | Port scans, DDoS, C2 beaconing | Built-in |
| Web Security | SQL injection, XSS attempts, scanners | Built-in |
| Firewall | Blocked connections, policy violations | Built-in |

---

## Phase 3: Security Dashboards

### 3.1 SOC Dashboard

Pre-built security operations dashboard:

**Panels:**
- Active alerts (severity distribution)
- Events per second (with anomaly detection)
- Top attacking IPs (with reputation)
- Geographic attack map
- MITRE ATT&CK coverage
- Recent critical events

### 3.2 Threat Hunting Dashboard

**Panels:**
- Unusual process executions
- Rare DNS queries
- Long-running connections
- New user accounts
- Privilege escalations

### 3.3 Compliance Dashboard

**Panels:**
- Authentication events
- Configuration changes
- File integrity alerts
- Access to sensitive data
- Policy violations

---

## Phase 4: Advanced Features

### 4.1 Lookup Tables

Enhance logs with external data:

**Built-in Lookups:**

| Lookup | Fields | Source |
|--------|--------|--------|
| `ip_reputation` | score, country, isp, tags | AbuseIPDB, OTX |
| `geoip` | country, city, lat, lon | MaxMind GeoLite2 |
| `port_services` | service_name, description | IANA registry |
| `mitre_techniques` | tactic, technique, url | MITRE ATT&CK |
| `asset_inventory` | asset_name, owner, criticality | User-defined |

**DSL Usage:**

```
search source_ip=*
| lookup geoip source_ip OUTPUT country, city
| lookup ip_reputation source_ip OUTPUT reputation_score
| filter reputation_score < 30
| table timestamp, source_ip, country, city, reputation_score, message
```

### 4.2 Correlation Rules

Multi-event correlation for complex attack detection:

```yaml
name: Successful Login After Multiple Failures
correlation:
  - event: authentication_failure
    count: "> 5"
    window: 5m
    group_by: [source_ip, target_user]
  - event: authentication_success
    within: 1m
    match: [source_ip, target_user]
action:
  alert:
    severity: high
    title: "Brute Force Success Detected"
```

### 4.3 Case Management

Basic incident response workflow:

- Create cases from alerts
- Assign to analysts
- Track investigation progress
- Add notes and artifacts
- Close with resolution

### 4.4 API for External Tools

Integration endpoints for security tools:

```
POST /api/intel/check-ip     # Check IP reputation
POST /api/intel/check-hash   # Check file hash
POST /api/intel/submit-ioc   # Submit IOC
GET  /api/reports/compliance # Generate compliance report
```

---

## Implementation Priority

### High Priority (Next Release)

1. **GeoIP enrichment** - Add country/city to all logs with IPs
2. **IP reputation lookup table** - AbuseIPDB integration
3. **Pre-built security alerts** - SSH brute force, failed logins
4. **Security dashboard template**

### Medium Priority (Future)

1. Sigma rule support
2. AlienVault OTX integration
3. MITRE ATT&CK mapping
4. Threat feed scheduler

### Lower Priority (Roadmap)

1. Correlation rules
2. Case management
3. Compliance reporting
4. SOAR integrations

---

## Free Resources

### Threat Intelligence

- [AlienVault OTX](https://otx.alienvault.com/) - Free threat intelligence
- [AbuseIPDB](https://www.abuseipdb.com/) - IP reputation (1K/day free)
- [GreyNoise](https://www.greynoise.io/) - Internet scanner detection
- [URLhaus](https://urlhaus.abuse.ch/) - Malicious URL database
- [MalwareBazaar](https://bazaar.abuse.ch/) - Malware sample database

### Detection Rules

- [SigmaHQ](https://github.com/SigmaHQ/sigma) - 3000+ detection rules
- [Elastic Detection Rules](https://github.com/elastic/detection-rules)
- [Splunk Security Content](https://github.com/splunk/security_content)

### GeoIP Databases

- [MaxMind GeoLite2](https://dev.maxmind.com/geoip/geolite2-free-geolocation-data/)
- [DB-IP Lite](https://db-ip.com/db/lite.php)

### Reference

- [MITRE ATT&CK](https://attack.mitre.org/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)

---

## Contributing

We welcome contributions to LogNog's security features! Areas where help is needed:

- Sigma rule conversions
- Detection rule development
- Threat feed integrations
- Security dashboard templates
- Documentation

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

---

*This roadmap is a living document. Features and priorities may change based on community feedback and contributor availability.*
