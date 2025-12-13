/**
 * GeoIP Service - Geographic IP lookup using MaxMind GeoLite2
 *
 * Provides country, city, and ASN information for IP addresses.
 * Gracefully handles missing databases.
 */

import maxmind, { CityResponse, AsnResponse, Reader } from 'maxmind';
import path from 'path';
import fs from 'fs';

export interface GeoIPResult {
  ip: string;
  country_code?: string;
  country_name?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  accuracy_radius?: number;
  timezone?: string;
  asn?: number;
  as_org?: string;
  is_anonymous_proxy?: boolean;
  is_satellite_provider?: boolean;
}

export interface GeoIPStatus {
  enabled: boolean;
  city_db_available: boolean;
  asn_db_available: boolean;
  city_db_path?: string;
  asn_db_path?: string;
  city_db_size?: number;
  asn_db_size?: number;
  city_db_modified?: string;
  asn_db_modified?: string;
  error?: string;
}

export class GeoIPService {
  private cityReader: Reader<CityResponse> | null = null;
  private asnReader: Reader<AsnResponse> | null = null;
  private initialized = false;
  private dataPath: string;
  private lookupCache: Map<string, GeoIPResult | null> = new Map();
  private cacheMaxSize = 10000;

  constructor(dataPath?: string) {
    this.dataPath = dataPath || process.env.GEOIP_DATA_PATH || '/data/geoip';
  }

  /**
   * Initialize GeoIP databases.
   * Must be called before lookup methods.
   */
  async initialize(): Promise<boolean> {
    const cityPath = path.join(this.dataPath, 'GeoLite2-City.mmdb');
    const asnPath = path.join(this.dataPath, 'GeoLite2-ASN.mmdb');

    try {
      // Try to open City database
      if (fs.existsSync(cityPath)) {
        this.cityReader = await maxmind.open<CityResponse>(cityPath);
        console.log(`GeoIP: City database loaded from ${cityPath}`);
      } else {
        console.log(`GeoIP: City database not found at ${cityPath}`);
      }

      // Try to open ASN database
      if (fs.existsSync(asnPath)) {
        this.asnReader = await maxmind.open<AsnResponse>(asnPath);
        console.log(`GeoIP: ASN database loaded from ${asnPath}`);
      } else {
        console.log(`GeoIP: ASN database not found at ${asnPath}`);
      }

      this.initialized = this.cityReader !== null || this.asnReader !== null;

      if (this.initialized) {
        console.log('GeoIP: Service initialized successfully');
      } else {
        console.log('GeoIP: Service not available (no databases found)');
      }

      return this.initialized;
    } catch (error) {
      console.error('GeoIP: Failed to initialize databases:', error);
      return false;
    }
  }

  /**
   * Check if GeoIP is available.
   */
  isAvailable(): boolean {
    return this.initialized;
  }

  /**
   * Get GeoIP service status.
   */
  getStatus(): GeoIPStatus {
    const cityPath = path.join(this.dataPath, 'GeoLite2-City.mmdb');
    const asnPath = path.join(this.dataPath, 'GeoLite2-ASN.mmdb');

    const status: GeoIPStatus = {
      enabled: this.initialized,
      city_db_available: this.cityReader !== null,
      asn_db_available: this.asnReader !== null,
    };

    try {
      if (fs.existsSync(cityPath)) {
        const cityStats = fs.statSync(cityPath);
        status.city_db_path = cityPath;
        status.city_db_size = cityStats.size;
        status.city_db_modified = cityStats.mtime.toISOString();
      }

      if (fs.existsSync(asnPath)) {
        const asnStats = fs.statSync(asnPath);
        status.asn_db_path = asnPath;
        status.asn_db_size = asnStats.size;
        status.asn_db_modified = asnStats.mtime.toISOString();
      }
    } catch (error) {
      status.error = error instanceof Error ? error.message : 'Unknown error';
    }

    return status;
  }

  /**
   * Lookup geographic information for an IP address.
   */
  lookup(ip: string): GeoIPResult | null {
    if (!this.initialized) {
      return null;
    }

    // Check cache first
    if (this.lookupCache.has(ip)) {
      return this.lookupCache.get(ip) || null;
    }

    const result: GeoIPResult = { ip };
    let hasData = false;

    // City lookup
    if (this.cityReader) {
      try {
        const city = this.cityReader.get(ip);
        if (city) {
          result.country_code = city.country?.iso_code;
          result.country_name = city.country?.names?.en;
          result.city = city.city?.names?.en;
          result.latitude = city.location?.latitude;
          result.longitude = city.location?.longitude;
          result.accuracy_radius = city.location?.accuracy_radius;
          result.timezone = city.location?.time_zone;
          result.is_anonymous_proxy = city.traits?.is_anonymous_proxy;
          result.is_satellite_provider = city.traits?.is_satellite_provider;
          hasData = true;
        }
      } catch (error) {
        // IP not found in database - this is normal for private IPs
      }
    }

    // ASN lookup
    if (this.asnReader) {
      try {
        const asn = this.asnReader.get(ip);
        if (asn) {
          result.asn = asn.autonomous_system_number;
          result.as_org = asn.autonomous_system_organization;
          hasData = true;
        }
      } catch (error) {
        // IP not found in database
      }
    }

    const finalResult = hasData ? result : null;

    // Cache the result (even if null)
    this.cacheResult(ip, finalResult);

    return finalResult;
  }

  /**
   * Batch lookup multiple IPs.
   */
  batchLookup(ips: string[]): Map<string, GeoIPResult | null> {
    const results = new Map<string, GeoIPResult | null>();

    for (const ip of ips) {
      if (!results.has(ip)) {
        results.set(ip, this.lookup(ip));
      }
    }

    return results;
  }

  /**
   * Helper method to get just the country code for an IP.
   */
  getCountryCode(ip: string): string | null {
    const result = this.lookup(ip);
    return result?.country_code || null;
  }

  /**
   * Helper method to get just the country name for an IP.
   */
  getCountryName(ip: string): string | null {
    const result = this.lookup(ip);
    return result?.country_name || null;
  }

  /**
   * Helper method to get just the city for an IP.
   */
  getCity(ip: string): string | null {
    const result = this.lookup(ip);
    return result?.city || null;
  }

  /**
   * Clear the lookup cache.
   */
  clearCache(): void {
    this.lookupCache.clear();
  }

  /**
   * Get cache statistics.
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.lookupCache.size,
      maxSize: this.cacheMaxSize,
    };
  }

  /**
   * Cache a lookup result with LRU eviction.
   */
  private cacheResult(ip: string, result: GeoIPResult | null): void {
    // Simple LRU: if cache is full, delete the first (oldest) entry
    if (this.lookupCache.size >= this.cacheMaxSize) {
      const firstKey = this.lookupCache.keys().next().value;
      if (firstKey !== undefined) {
        this.lookupCache.delete(firstKey);
      }
    }

    this.lookupCache.set(ip, result);
  }
}

// Singleton instance
let geoipService: GeoIPService | null = null;

/**
 * Get the singleton GeoIP service instance.
 */
export async function getGeoIPService(): Promise<GeoIPService> {
  if (!geoipService) {
    geoipService = new GeoIPService();
    await geoipService.initialize();
  }
  return geoipService;
}

/**
 * Quick lookup function for use in other modules.
 */
export async function geolocate(ip: string): Promise<GeoIPResult | null> {
  const service = await getGeoIPService();
  return service.lookup(ip);
}

/**
 * Quick country lookup function.
 */
export async function getCountryCode(ip: string): Promise<string | null> {
  const service = await getGeoIPService();
  return service.getCountryCode(ip);
}

/**
 * Quick city lookup function.
 */
export async function getCity(ip: string): Promise<string | null> {
  const service = await getGeoIPService();
  return service.getCity(ip);
}
