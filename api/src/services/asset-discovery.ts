/**
 * Asset & Identity Discovery Service
 *
 * Automatically discovers assets (hosts, IPs) and identities (users)
 * from log data in ClickHouse.
 */

import { executeQuery } from '../db/clickhouse.js';
import {
  AssetType,
  IdentityType,
  upsertAssetFromDiscovery,
  upsertIdentityFromDiscovery,
  linkAssetIdentity,
  getAssetByIdentifier,
  getIdentityByIdentifier,
} from '../db/sqlite.js';

interface DiscoveryResult {
  discovered: number;
  updated: number;
  errors: number;
}

/**
 * Discover assets (hosts, IPs) from log data
 */
export async function discoverAssetsFromLogs(lookbackHours: number = 24): Promise<DiscoveryResult> {
  const result: DiscoveryResult = { discovered: 0, updated: 0, errors: 0 };

  try {
    // Discover hostnames
    const hostQuery = `
      SELECT DISTINCT
        hostname,
        min(timestamp) as first_seen,
        max(timestamp) as last_seen,
        count() as event_count
      FROM lognog.logs
      WHERE timestamp >= now() - INTERVAL ${lookbackHours} HOUR
        AND hostname != ''
        AND hostname IS NOT NULL
      GROUP BY hostname
      ORDER BY event_count DESC
      LIMIT 1000
    `;

    const hosts = await executeQuery<{
      hostname: string;
      first_seen: string;
      last_seen: string;
      event_count: number;
    }>(hostQuery);

    for (const host of hosts) {
      try {
        const existing = getAssetByIdentifier('server', host.hostname);
        const asset = upsertAssetFromDiscovery('server', host.hostname, host.last_seen);

        if (existing) {
          result.updated++;
        } else {
          result.discovered++;
        }
      } catch (err) {
        console.error(`Error discovering host ${host.hostname}:`, err);
        result.errors++;
      }
    }

    // Discover source IPs
    const ipQuery = `
      SELECT DISTINCT
        toString(source_ip) as ip,
        min(timestamp) as first_seen,
        max(timestamp) as last_seen,
        count() as event_count
      FROM lognog.logs
      WHERE timestamp >= now() - INTERVAL ${lookbackHours} HOUR
        AND source_ip IS NOT NULL
        AND source_ip != toIPv4('0.0.0.0')
      GROUP BY source_ip
      ORDER BY event_count DESC
      LIMIT 1000
    `;

    const ips = await executeQuery<{
      ip: string;
      first_seen: string;
      last_seen: string;
      event_count: number;
    }>(ipQuery);

    for (const ip of ips) {
      try {
        // Determine asset type based on IP characteristics
        const assetType: AssetType = isPrivateIP(ip.ip) ? 'workstation' : 'network_device';
        const existing = getAssetByIdentifier(assetType, ip.ip);
        upsertAssetFromDiscovery(assetType, ip.ip, ip.last_seen);

        if (existing) {
          result.updated++;
        } else {
          result.discovered++;
        }
      } catch (err) {
        console.error(`Error discovering IP ${ip.ip}:`, err);
        result.errors++;
      }
    }

    // Discover app names as potential container/service assets
    const appQuery = `
      SELECT DISTINCT
        app_name,
        min(timestamp) as first_seen,
        max(timestamp) as last_seen,
        count() as event_count
      FROM lognog.logs
      WHERE timestamp >= now() - INTERVAL ${lookbackHours} HOUR
        AND app_name != ''
        AND app_name IS NOT NULL
      GROUP BY app_name
      ORDER BY event_count DESC
      LIMIT 500
    `;

    const apps = await executeQuery<{
      app_name: string;
      first_seen: string;
      last_seen: string;
      event_count: number;
    }>(appQuery);

    for (const app of apps) {
      try {
        const existing = getAssetByIdentifier('container', app.app_name);
        upsertAssetFromDiscovery('container', app.app_name, app.last_seen);

        if (existing) {
          result.updated++;
        } else {
          result.discovered++;
        }
      } catch (err) {
        console.error(`Error discovering app ${app.app_name}:`, err);
        result.errors++;
      }
    }

  } catch (error) {
    console.error('Error in asset discovery:', error);
    throw error;
  }

  return result;
}

/**
 * Discover identities (users) from log data
 */
export async function discoverIdentitiesFromLogs(lookbackHours: number = 24): Promise<DiscoveryResult> {
  const result: DiscoveryResult = { discovered: 0, updated: 0, errors: 0 };

  try {
    // Discover users from the 'user' field
    const userQuery = `
      SELECT DISTINCT
        user,
        min(timestamp) as first_seen,
        max(timestamp) as last_seen,
        count() as event_count,
        -- Heuristic: privileged if username contains admin, root, etc.
        multiIf(
          lower(user) LIKE '%admin%', 1,
          lower(user) LIKE '%root%', 1,
          lower(user) LIKE '%system%', 1,
          lower(user) LIKE '%service%', 1,
          0
        ) as is_privileged
      FROM lognog.logs
      WHERE timestamp >= now() - INTERVAL ${lookbackHours} HOUR
        AND user != ''
        AND user IS NOT NULL
        AND user != '-'
      GROUP BY user
      ORDER BY event_count DESC
      LIMIT 1000
    `;

    const users = await executeQuery<{
      user: string;
      first_seen: string;
      last_seen: string;
      event_count: number;
      is_privileged: number;
    }>(userQuery);

    for (const user of users) {
      try {
        // Determine identity type
        const identityType: IdentityType = user.user.includes('@')
          ? 'user'
          : user.is_privileged
            ? 'service_account'
            : 'user';

        const existing = getIdentityByIdentifier(identityType, user.user);
        upsertIdentityFromDiscovery(
          identityType,
          user.user,
          user.last_seen,
          user.is_privileged === 1
        );

        if (existing) {
          result.updated++;
        } else {
          result.discovered++;
        }
      } catch (err) {
        console.error(`Error discovering user ${user.user}:`, err);
        result.errors++;
      }
    }

  } catch (error) {
    console.error('Error in identity discovery:', error);
    throw error;
  }

  return result;
}

/**
 * Discover asset-identity relationships from logs
 */
export async function discoverAssetIdentityLinks(lookbackHours: number = 24): Promise<{
  links_created: number;
  links_updated: number;
  errors: number;
}> {
  const result = { links_created: 0, links_updated: 0, errors: 0 };

  try {
    // Find user -> host relationships
    const linkQuery = `
      SELECT
        hostname,
        user,
        min(timestamp) as first_seen,
        max(timestamp) as last_seen,
        count() as event_count
      FROM lognog.logs
      WHERE timestamp >= now() - INTERVAL ${lookbackHours} HOUR
        AND hostname != ''
        AND hostname IS NOT NULL
        AND user != ''
        AND user IS NOT NULL
        AND user != '-'
      GROUP BY hostname, user
      ORDER BY event_count DESC
      LIMIT 5000
    `;

    const links = await executeQuery<{
      hostname: string;
      user: string;
      first_seen: string;
      last_seen: string;
      event_count: number;
    }>(linkQuery);

    for (const link of links) {
      try {
        // Get or create the asset and identity
        const asset = getAssetByIdentifier('server', link.hostname);
        const identity = getIdentityByIdentifier('user', link.user);

        if (asset && identity) {
          const existingLink = linkAssetIdentity(
            asset.id,
            identity.id,
            'user',
            link.last_seen
          );

          if (existingLink) {
            result.links_updated++;
          } else {
            result.links_created++;
          }
        }
      } catch (err) {
        console.error(`Error linking ${link.hostname} -> ${link.user}:`, err);
        result.errors++;
      }
    }

  } catch (error) {
    console.error('Error in asset-identity link discovery:', error);
    throw error;
  }

  return result;
}

/**
 * Run full discovery (assets, identities, and links)
 */
export async function runFullDiscovery(lookbackHours: number = 24): Promise<{
  assets: DiscoveryResult;
  identities: DiscoveryResult;
  links: { links_created: number; links_updated: number; errors: number };
}> {
  const assets = await discoverAssetsFromLogs(lookbackHours);
  const identities = await discoverIdentitiesFromLogs(lookbackHours);
  const links = await discoverAssetIdentityLinks(lookbackHours);

  return { assets, identities, links };
}

/**
 * Helper: Check if IP is private (RFC 1918)
 */
function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return false;

  // 10.0.0.0/8
  if (parts[0] === 10) return true;

  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;

  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true;

  return false;
}
