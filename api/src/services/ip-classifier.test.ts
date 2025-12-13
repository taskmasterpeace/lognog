import { describe, it, expect } from 'vitest';
import {
  classifyIP,
  classifyIPs,
  isValidIPv4,
  isInternalIP,
  isPublicIP,
  isPrivateIP,
  isLoopbackIP,
  isLinkLocalIP,
  isMulticastIP,
  isReservedIP,
} from './ip-classifier.js';

describe('IP Classifier', () => {
  describe('isValidIPv4', () => {
    it('should validate correct IPv4 addresses', () => {
      expect(isValidIPv4('192.168.1.1')).toBe(true);
      expect(isValidIPv4('10.0.0.1')).toBe(true);
      expect(isValidIPv4('8.8.8.8')).toBe(true);
      expect(isValidIPv4('0.0.0.0')).toBe(true);
      expect(isValidIPv4('255.255.255.255')).toBe(true);
      expect(isValidIPv4('127.0.0.1')).toBe(true);
    });

    it('should reject invalid IPv4 addresses', () => {
      expect(isValidIPv4('256.1.1.1')).toBe(false);
      expect(isValidIPv4('192.168.1')).toBe(false);
      expect(isValidIPv4('192.168.1.1.1')).toBe(false);
      expect(isValidIPv4('abc.def.ghi.jkl')).toBe(false);
      expect(isValidIPv4('192.168.-1.1')).toBe(false);
      expect(isValidIPv4('')).toBe(false);
      expect(isValidIPv4('not an ip')).toBe(false);
    });
  });

  describe('classifyIP - RFC 1918 Private Addresses', () => {
    it('should identify Class A private addresses (10.0.0.0/8)', () => {
      const result = classifyIP('10.0.0.1');
      expect(result.type).toBe('private');
      expect(result.is_internal).toBe(true);
      expect(result.risk_level).toBe('low');
      expect(result.range_name).toBe('RFC1918 Class A');

      expect(classifyIP('10.255.255.255').type).toBe('private');
      expect(classifyIP('10.128.64.32').type).toBe('private');
    });

    it('should identify Class B private addresses (172.16.0.0/12)', () => {
      const result = classifyIP('172.16.0.1');
      expect(result.type).toBe('private');
      expect(result.is_internal).toBe(true);
      expect(result.risk_level).toBe('low');
      expect(result.range_name).toBe('RFC1918 Class B');

      expect(classifyIP('172.31.255.255').type).toBe('private');
      expect(classifyIP('172.20.10.5').type).toBe('private');
    });

    it('should NOT identify non-private 172.x addresses', () => {
      expect(classifyIP('172.15.255.255').type).toBe('public');
      expect(classifyIP('172.32.0.1').type).toBe('public');
    });

    it('should identify Class C private addresses (192.168.0.0/16)', () => {
      const result = classifyIP('192.168.1.1');
      expect(result.type).toBe('private');
      expect(result.is_internal).toBe(true);
      expect(result.risk_level).toBe('low');
      expect(result.range_name).toBe('RFC1918 Class C');

      expect(classifyIP('192.168.255.255').type).toBe('private');
      expect(classifyIP('192.168.0.1').type).toBe('private');
    });
  });

  describe('classifyIP - Loopback Addresses', () => {
    it('should identify loopback addresses (127.0.0.0/8)', () => {
      const result = classifyIP('127.0.0.1');
      expect(result.type).toBe('loopback');
      expect(result.is_internal).toBe(true);
      expect(result.risk_level).toBe('none');
      expect(result.range_name).toBe('Loopback');

      expect(classifyIP('127.255.255.255').type).toBe('loopback');
      expect(classifyIP('127.1.2.3').type).toBe('loopback');
    });
  });

  describe('classifyIP - Link-Local Addresses', () => {
    it('should identify link-local/APIPA addresses (169.254.0.0/16)', () => {
      const result = classifyIP('169.254.1.1');
      expect(result.type).toBe('link_local');
      expect(result.is_internal).toBe(true);
      expect(result.risk_level).toBe('none');
      expect(result.range_name).toBe('Link-Local');

      expect(classifyIP('169.254.0.0').type).toBe('link_local');
      expect(classifyIP('169.254.255.255').type).toBe('link_local');
    });
  });

  describe('classifyIP - Multicast Addresses', () => {
    it('should identify multicast addresses (224.0.0.0/4)', () => {
      const result = classifyIP('224.0.0.1');
      expect(result.type).toBe('multicast');
      expect(result.is_internal).toBe(true);
      expect(result.risk_level).toBe('none');
      expect(result.range_name).toBe('Multicast');

      expect(classifyIP('239.255.255.255').type).toBe('multicast');
      expect(classifyIP('230.1.2.3').type).toBe('multicast');
    });
  });

  describe('classifyIP - Reserved Addresses', () => {
    it('should identify Class E reserved addresses (240.0.0.0/4)', () => {
      const result = classifyIP('240.0.0.1');
      expect(result.type).toBe('reserved');
      expect(result.is_internal).toBe(true);
      expect(result.risk_level).toBe('none');

      expect(classifyIP('255.255.255.255').type).toBe('reserved');
    });

    it('should identify This Network addresses (0.0.0.0/8)', () => {
      const result = classifyIP('0.0.0.0');
      expect(result.type).toBe('reserved');
      expect(result.is_internal).toBe(true);
      expect(result.range_name).toBe('This Network');

      expect(classifyIP('0.255.255.255').type).toBe('reserved');
    });

    it('should identify TEST-NET-1 (192.0.2.0/24)', () => {
      const result = classifyIP('192.0.2.1');
      expect(result.type).toBe('reserved');
      expect(result.range_name).toBe('TEST-NET-1');
    });

    it('should identify TEST-NET-2 (198.51.100.0/24)', () => {
      const result = classifyIP('198.51.100.1');
      expect(result.type).toBe('reserved');
      expect(result.range_name).toBe('TEST-NET-2');
    });

    it('should identify TEST-NET-3 (203.0.113.0/24)', () => {
      const result = classifyIP('203.0.113.1');
      expect(result.type).toBe('reserved');
      expect(result.range_name).toBe('TEST-NET-3');
    });
  });

  describe('classifyIP - Carrier-Grade NAT', () => {
    it('should identify Carrier-Grade NAT addresses (100.64.0.0/10)', () => {
      const result = classifyIP('100.64.0.1');
      expect(result.type).toBe('private');
      expect(result.is_internal).toBe(true);
      expect(result.range_name).toBe('Carrier-Grade NAT');

      expect(classifyIP('100.127.255.255').type).toBe('private');
    });
  });

  describe('classifyIP - Public Addresses', () => {
    it('should identify public addresses', () => {
      const result = classifyIP('8.8.8.8');
      expect(result.type).toBe('public');
      expect(result.is_internal).toBe(false);
      expect(result.risk_level).toBe('external');
      expect(result.description).toContain('Public');

      // Cloudflare DNS
      expect(classifyIP('1.1.1.1').type).toBe('public');

      // Google DNS
      expect(classifyIP('8.8.4.4').type).toBe('public');

      // Arbitrary public IPs
      expect(classifyIP('93.184.216.34').type).toBe('public');
      expect(classifyIP('151.101.1.140').type).toBe('public');
    });

    it('should NOT classify edge cases as private', () => {
      // Just outside 172.16-31.x range
      expect(classifyIP('172.15.0.1').type).toBe('public');
      expect(classifyIP('172.32.0.1').type).toBe('public');

      // Just outside 192.168.x range
      expect(classifyIP('192.167.1.1').type).toBe('public');
      expect(classifyIP('192.169.1.1').type).toBe('public');

      // Just outside 10.x range
      expect(classifyIP('9.255.255.255').type).toBe('public');
      expect(classifyIP('11.0.0.0').type).toBe('public');
    });
  });

  describe('classifyIP - Invalid IPs', () => {
    it('should handle invalid IPs gracefully', () => {
      const result = classifyIP('invalid');
      expect(result.type).toBe('reserved');
      expect(result.description).toContain('Invalid');

      expect(classifyIP('').type).toBe('reserved');
      expect(classifyIP('999.999.999.999').type).toBe('reserved');
    });
  });

  describe('classifyIPs - Batch Classification', () => {
    it('should classify multiple IPs', () => {
      const ips = ['192.168.1.1', '8.8.8.8', '10.0.0.1', '127.0.0.1'];
      const results = classifyIPs(ips);

      expect(results.size).toBe(4);
      expect(results.get('192.168.1.1')?.type).toBe('private');
      expect(results.get('8.8.8.8')?.type).toBe('public');
      expect(results.get('10.0.0.1')?.type).toBe('private');
      expect(results.get('127.0.0.1')?.type).toBe('loopback');
    });

    it('should deduplicate IPs', () => {
      const ips = ['192.168.1.1', '192.168.1.1', '8.8.8.8', '8.8.8.8'];
      const results = classifyIPs(ips);

      expect(results.size).toBe(2);
    });
  });

  describe('Helper Functions', () => {
    it('isInternalIP should work correctly', () => {
      expect(isInternalIP('192.168.1.1')).toBe(true);
      expect(isInternalIP('10.0.0.1')).toBe(true);
      expect(isInternalIP('127.0.0.1')).toBe(true);
      expect(isInternalIP('169.254.1.1')).toBe(true);
      expect(isInternalIP('8.8.8.8')).toBe(false);
    });

    it('isPublicIP should work correctly', () => {
      expect(isPublicIP('8.8.8.8')).toBe(true);
      expect(isPublicIP('1.1.1.1')).toBe(true);
      expect(isPublicIP('192.168.1.1')).toBe(false);
      expect(isPublicIP('10.0.0.1')).toBe(false);
      expect(isPublicIP('127.0.0.1')).toBe(false);
    });

    it('isPrivateIP should work correctly', () => {
      expect(isPrivateIP('192.168.1.1')).toBe(true);
      expect(isPrivateIP('10.0.0.1')).toBe(true);
      expect(isPrivateIP('172.16.0.1')).toBe(true);
      expect(isPrivateIP('100.64.0.1')).toBe(true); // CGN
      expect(isPrivateIP('8.8.8.8')).toBe(false);
      expect(isPrivateIP('127.0.0.1')).toBe(false); // loopback, not private
    });

    it('isLoopbackIP should work correctly', () => {
      expect(isLoopbackIP('127.0.0.1')).toBe(true);
      expect(isLoopbackIP('127.255.255.255')).toBe(true);
      expect(isLoopbackIP('192.168.1.1')).toBe(false);
      expect(isLoopbackIP('8.8.8.8')).toBe(false);
    });

    it('isLinkLocalIP should work correctly', () => {
      expect(isLinkLocalIP('169.254.1.1')).toBe(true);
      expect(isLinkLocalIP('169.254.255.255')).toBe(true);
      expect(isLinkLocalIP('192.168.1.1')).toBe(false);
      expect(isLinkLocalIP('8.8.8.8')).toBe(false);
    });

    it('isMulticastIP should work correctly', () => {
      expect(isMulticastIP('224.0.0.1')).toBe(true);
      expect(isMulticastIP('239.255.255.255')).toBe(true);
      expect(isMulticastIP('192.168.1.1')).toBe(false);
      expect(isMulticastIP('8.8.8.8')).toBe(false);
    });

    it('isReservedIP should work correctly', () => {
      expect(isReservedIP('0.0.0.0')).toBe(true);
      expect(isReservedIP('240.0.0.1')).toBe(true);
      expect(isReservedIP('255.255.255.255')).toBe(true);
      expect(isReservedIP('192.0.2.1')).toBe(true); // TEST-NET-1
      expect(isReservedIP('192.168.1.1')).toBe(false);
      expect(isReservedIP('8.8.8.8')).toBe(false);
    });
  });

  describe('Real-World Examples', () => {
    it('should correctly classify common private IPs', () => {
      // Home routers
      expect(classifyIP('192.168.1.1').type).toBe('private');
      expect(classifyIP('192.168.0.1').type).toBe('private');

      // Corporate networks
      expect(classifyIP('10.10.10.10').type).toBe('private');
      expect(classifyIP('172.16.5.100').type).toBe('private');

      // Docker default bridge
      expect(classifyIP('172.17.0.1').type).toBe('private');
    });

    it('should correctly classify common public IPs', () => {
      // DNS servers
      expect(classifyIP('8.8.8.8').type).toBe('public'); // Google
      expect(classifyIP('1.1.1.1').type).toBe('public'); // Cloudflare
      expect(classifyIP('9.9.9.9').type).toBe('public'); // Quad9

      // Web servers (example)
      expect(classifyIP('93.184.216.34').type).toBe('public');
    });

    it('should correctly classify localhost variations', () => {
      expect(classifyIP('127.0.0.1').type).toBe('loopback');
      expect(classifyIP('127.1.1.1').type).toBe('loopback');
    });

    it('should correctly classify APIPA addresses', () => {
      // Windows APIPA when DHCP fails
      expect(classifyIP('169.254.123.45').type).toBe('link_local');
    });
  });

  describe('Edge Cases and Boundaries', () => {
    it('should handle boundary IPs correctly', () => {
      // 10.x boundaries
      expect(classifyIP('10.0.0.0').type).toBe('private');
      expect(classifyIP('10.255.255.255').type).toBe('private');
      expect(classifyIP('9.255.255.255').type).toBe('public');
      expect(classifyIP('11.0.0.0').type).toBe('public');

      // 172.16-31 boundaries
      expect(classifyIP('172.16.0.0').type).toBe('private');
      expect(classifyIP('172.31.255.255').type).toBe('private');
      expect(classifyIP('172.15.255.255').type).toBe('public');
      expect(classifyIP('172.32.0.0').type).toBe('public');

      // 192.168 boundaries
      expect(classifyIP('192.168.0.0').type).toBe('private');
      expect(classifyIP('192.168.255.255').type).toBe('private');
      expect(classifyIP('192.167.255.255').type).toBe('public');
      expect(classifyIP('192.169.0.0').type).toBe('public');
    });

    it('should handle extreme values', () => {
      expect(classifyIP('0.0.0.0').type).toBe('reserved');
      expect(classifyIP('255.255.255.255').type).toBe('reserved');
    });
  });
});
