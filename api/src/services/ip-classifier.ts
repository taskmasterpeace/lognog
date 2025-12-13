/**
 * IP Classification Service
 *
 * Classifies IP addresses without external API calls (fully offline).
 * Identifies private, public, loopback, reserved, and special-use IP addresses.
 *
 * Based on:
 * - RFC 1918 (Private Internet)
 * - RFC 5735 (Special Use IPv4 Addresses)
 * - RFC 6598 (Carrier-Grade NAT)
 */

export type IPType =
  | 'private'      // RFC 1918 private addresses
  | 'public'       // Routable public addresses
  | 'loopback'     // 127.0.0.0/8
  | 'reserved'     // Reserved/special use
  | 'multicast'    // 224.0.0.0/4
  | 'link_local';  // 169.254.0.0/16 (APIPA)

export type RiskLevel = 'none' | 'low' | 'unknown' | 'external';

export interface IPClassification {
  ip: string;
  type: IPType;
  is_internal: boolean;
  risk_level: RiskLevel;
  range_name?: string;
  description?: string;
}

interface IPRange {
  start: string;
  end: string;
  type: IPType;
  name: string;
  description?: string;
}

/**
 * RFC 1918 Private Address Ranges
 */
const PRIVATE_RANGES: IPRange[] = [
  {
    start: '10.0.0.0',
    end: '10.255.255.255',
    type: 'private',
    name: 'RFC1918 Class A',
    description: 'Private network (10.0.0.0/8)',
  },
  {
    start: '172.16.0.0',
    end: '172.31.255.255',
    type: 'private',
    name: 'RFC1918 Class B',
    description: 'Private network (172.16.0.0/12)',
  },
  {
    start: '192.168.0.0',
    end: '192.168.255.255',
    type: 'private',
    name: 'RFC1918 Class C',
    description: 'Private network (192.168.0.0/16)',
  },
];

/**
 * Special-Use and Reserved IPv4 Addresses
 */
const SPECIAL_RANGES: IPRange[] = [
  // Loopback
  {
    start: '127.0.0.0',
    end: '127.255.255.255',
    type: 'loopback',
    name: 'Loopback',
    description: 'Loopback addresses (127.0.0.0/8)',
  },

  // Link-Local (APIPA)
  {
    start: '169.254.0.0',
    end: '169.254.255.255',
    type: 'link_local',
    name: 'Link-Local',
    description: 'Link-local/APIPA (169.254.0.0/16)',
  },

  // Multicast
  {
    start: '224.0.0.0',
    end: '239.255.255.255',
    type: 'multicast',
    name: 'Multicast',
    description: 'Multicast addresses (224.0.0.0/4)',
  },

  // Reserved Class E
  {
    start: '240.0.0.0',
    end: '255.255.255.255',
    type: 'reserved',
    name: 'Reserved',
    description: 'Reserved for future use (240.0.0.0/4)',
  },

  // This Network
  {
    start: '0.0.0.0',
    end: '0.255.255.255',
    type: 'reserved',
    name: 'This Network',
    description: 'This network (0.0.0.0/8)',
  },

  // Carrier-Grade NAT (RFC 6598)
  {
    start: '100.64.0.0',
    end: '100.127.255.255',
    type: 'private',
    name: 'Carrier-Grade NAT',
    description: 'Shared Address Space (100.64.0.0/10)',
  },

  // IETF Protocol Assignments
  {
    start: '192.0.0.0',
    end: '192.0.0.255',
    type: 'reserved',
    name: 'IETF Protocol',
    description: 'IETF Protocol Assignments (192.0.0.0/24)',
  },

  // TEST-NET-1 (Documentation)
  {
    start: '192.0.2.0',
    end: '192.0.2.255',
    type: 'reserved',
    name: 'TEST-NET-1',
    description: 'Documentation and examples (192.0.2.0/24)',
  },

  // 6to4 Relay Anycast
  {
    start: '192.88.99.0',
    end: '192.88.99.255',
    type: 'reserved',
    name: '6to4 Relay',
    description: '6to4 Relay Anycast (192.88.99.0/24)',
  },

  // TEST-NET-2 (Documentation)
  {
    start: '198.51.100.0',
    end: '198.51.100.255',
    type: 'reserved',
    name: 'TEST-NET-2',
    description: 'Documentation and examples (198.51.100.0/24)',
  },

  // TEST-NET-3 (Documentation)
  {
    start: '203.0.113.0',
    end: '203.0.113.255',
    type: 'reserved',
    name: 'TEST-NET-3',
    description: 'Documentation and examples (203.0.113.0/24)',
  },

  // Benchmarking
  {
    start: '198.18.0.0',
    end: '198.19.255.255',
    type: 'reserved',
    name: 'Benchmarking',
    description: 'Benchmarking (198.18.0.0/15)',
  },
];

/**
 * Convert dotted-decimal IP address to 32-bit integer
 */
function ipToNumber(ip: string): number {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) {
    throw new Error(`Invalid IP address format: ${ip}`);
  }

  // Use unsigned right shift to ensure positive 32-bit integer
  return ((parts[0] << 24) >>> 0) + ((parts[1] << 16) >>> 0) + ((parts[2] << 8) >>> 0) + (parts[3] >>> 0);
}

/**
 * Check if IP is within a given range
 */
function isInRange(ip: string, start: string, end: string): boolean {
  try {
    const ipNum = ipToNumber(ip);
    const startNum = ipToNumber(start);
    const endNum = ipToNumber(end);

    return ipNum >= startNum && ipNum <= endNum;
  } catch {
    return false;
  }
}

/**
 * Validate IPv4 address format
 */
export function isValidIPv4(ip: string): boolean {
  if (!ip || typeof ip !== 'string') {
    return false;
  }

  // Check basic pattern
  const pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = ip.match(pattern);

  if (!match) {
    return false;
  }

  // Validate each octet is 0-255
  const parts = ip.split('.').map(Number);
  return parts.every(p => !isNaN(p) && p >= 0 && p <= 255);
}

/**
 * Classify an IPv4 address
 */
export function classifyIP(ip: string): IPClassification {
  // Validate IP format
  if (!isValidIPv4(ip)) {
    return {
      ip,
      type: 'reserved',
      is_internal: false,
      risk_level: 'none',
      description: 'Invalid IPv4 address',
    };
  }

  // Check special ranges first (higher priority)
  for (const range of SPECIAL_RANGES) {
    if (isInRange(ip, range.start, range.end)) {
      return {
        ip,
        type: range.type,
        is_internal: true,
        risk_level: 'none',
        range_name: range.name,
        description: range.description,
      };
    }
  }

  // Check private ranges (RFC 1918)
  for (const range of PRIVATE_RANGES) {
    if (isInRange(ip, range.start, range.end)) {
      return {
        ip,
        type: 'private',
        is_internal: true,
        risk_level: 'low',
        range_name: range.name,
        description: range.description,
      };
    }
  }

  // Default: Public IP address
  return {
    ip,
    type: 'public',
    is_internal: false,
    risk_level: 'external',
    description: 'Public routable IP address',
  };
}

/**
 * Batch classify multiple IP addresses (deduplicates automatically)
 */
export function classifyIPs(ips: string[]): Map<string, IPClassification> {
  const results = new Map<string, IPClassification>();

  for (const ip of ips) {
    if (!results.has(ip)) {
      results.set(ip, classifyIP(ip));
    }
  }

  return results;
}

/**
 * Quick check: Is this IP internal/private?
 */
export function isInternalIP(ip: string): boolean {
  const classification = classifyIP(ip);
  return classification.is_internal;
}

/**
 * Quick check: Is this IP public?
 */
export function isPublicIP(ip: string): boolean {
  const classification = classifyIP(ip);
  return classification.type === 'public';
}

/**
 * Quick check: Is this IP private (RFC 1918)?
 */
export function isPrivateIP(ip: string): boolean {
  const classification = classifyIP(ip);
  return classification.type === 'private';
}

/**
 * Quick check: Is this IP a loopback address?
 */
export function isLoopbackIP(ip: string): boolean {
  const classification = classifyIP(ip);
  return classification.type === 'loopback';
}

/**
 * Quick check: Is this IP link-local (APIPA)?
 */
export function isLinkLocalIP(ip: string): boolean {
  const classification = classifyIP(ip);
  return classification.type === 'link_local';
}

/**
 * Quick check: Is this IP multicast?
 */
export function isMulticastIP(ip: string): boolean {
  const classification = classifyIP(ip);
  return classification.type === 'multicast';
}

/**
 * Quick check: Is this IP reserved?
 */
export function isReservedIP(ip: string): boolean {
  const classification = classifyIP(ip);
  return classification.type === 'reserved';
}
