// Pre-built dashboard templates for common homelab log sources

export interface DashboardTemplateData {
  name: string;
  description: string;
  category: string;
  required_sources: string[];
  template: {
    name: string;
    description: string;
    logo_url?: string;
    accent_color?: string;
    panels: Array<{
      title: string;
      query: string;
      visualization: string;
      position_x: number;
      position_y: number;
      width: number;
      height: number;
    }>;
    variables?: Array<{
      name: string;
      label: string;
      type: 'query' | 'custom';
      query?: string;
      include_all: boolean;
      multi_select: boolean;
    }>;
  };
}

export const DASHBOARD_TEMPLATES: DashboardTemplateData[] = [
  // pfSense Security Dashboard
  {
    name: 'pfSense Security Dashboard',
    description: 'Monitor firewall blocks, VPN connections, and security events from pfSense',
    category: 'network',
    required_sources: ['pfsense', 'filterlog', 'openvpn'],
    template: {
      name: 'pfSense Security',
      description: 'Firewall and VPN monitoring for pfSense',
      accent_color: '#DC2626',
      panels: [
        {
          title: 'Total Firewall Blocks (24h)',
          query: 'search app_name=filterlog action=block | stats count',
          visualization: 'stat',
          position_x: 0, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'VPN Connections',
          query: 'search app_name=openvpn message~"connected" | stats dc(user)',
          visualization: 'stat',
          position_x: 3, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Unique Blocked IPs',
          query: 'search app_name=filterlog action=block | stats dc(src_ip)',
          visualization: 'stat',
          position_x: 6, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'States Used',
          query: 'search app_name=pfsense message~"states" | stats latest(states)',
          visualization: 'stat',
          position_x: 9, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Firewall Blocks Over Time',
          query: 'search app_name=filterlog action=block | timechart span=1h count',
          visualization: 'line',
          position_x: 0, position_y: 2, width: 8, height: 3,
        },
        {
          title: 'Top Blocked Ports',
          query: 'search app_name=filterlog action=block | stats count by dst_port | sort desc count | limit 10',
          visualization: 'pie',
          position_x: 8, position_y: 2, width: 4, height: 3,
        },
        {
          title: 'Top Blocked Source IPs',
          query: 'search app_name=filterlog action=block | stats count by src_ip | sort desc count | limit 15',
          visualization: 'bar',
          position_x: 0, position_y: 5, width: 6, height: 4,
        },
        {
          title: 'Recent VPN Activity',
          query: 'search app_name=openvpn | table timestamp user message | limit 20',
          visualization: 'table',
          position_x: 6, position_y: 5, width: 6, height: 4,
        },
        {
          title: 'Recent Firewall Events',
          query: 'search app_name=filterlog | table timestamp action src_ip dst_ip dst_port | limit 25',
          visualization: 'table',
          position_x: 0, position_y: 9, width: 12, height: 4,
        },
      ],
      variables: [
        {
          name: 'action',
          label: 'Action',
          type: 'custom',
          include_all: true,
          multi_select: false,
        },
      ],
    },
  },

  // Docker Container Health
  {
    name: 'Docker Container Health',
    description: 'Monitor Docker container status, restarts, and logs',
    category: 'application',
    required_sources: ['docker'],
    template: {
      name: 'Docker Overview',
      description: 'Container health and log monitoring',
      accent_color: '#2496ED',
      panels: [
        {
          title: 'Active Containers',
          query: 'search source_type=docker event=start | stats dc(container)',
          visualization: 'stat',
          position_x: 0, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Container Restarts',
          query: 'search source_type=docker event=restart | stats count',
          visualization: 'stat',
          position_x: 3, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Error Count',
          query: 'search source_type=docker severity>=error | stats count',
          visualization: 'stat',
          position_x: 6, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Warning Count',
          query: 'search source_type=docker severity=warning | stats count',
          visualization: 'stat',
          position_x: 9, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Container Activity Over Time',
          query: 'search source_type=docker | timechart span=1h count by container',
          visualization: 'line',
          position_x: 0, position_y: 2, width: 8, height: 3,
        },
        {
          title: 'Events by Container',
          query: 'search source_type=docker | stats count by container | sort desc count | limit 10',
          visualization: 'pie',
          position_x: 8, position_y: 2, width: 4, height: 3,
        },
        {
          title: 'Container Restarts by Name',
          query: 'search source_type=docker event=restart | stats count by container | sort desc count',
          visualization: 'bar',
          position_x: 0, position_y: 5, width: 6, height: 4,
        },
        {
          title: 'Error Rate by Container',
          query: 'search source_type=docker severity>=error | stats count by container | sort desc count | limit 10',
          visualization: 'bar',
          position_x: 6, position_y: 5, width: 6, height: 4,
        },
        {
          title: 'Recent Container Events',
          query: 'search source_type=docker | table timestamp container event message | limit 50',
          visualization: 'table',
          position_x: 0, position_y: 9, width: 12, height: 4,
        },
      ],
      variables: [
        {
          name: 'container',
          label: 'Container',
          type: 'query',
          query: 'search source_type=docker | stats count by container | table container',
          include_all: true,
          multi_select: true,
        },
      ],
    },
  },

  // Windows Security Events
  {
    name: 'Windows Security Dashboard',
    description: 'Monitor Windows security events, logins, and account changes',
    category: 'security',
    required_sources: ['windows', 'security'],
    template: {
      name: 'Windows Security',
      description: 'Security event monitoring for Windows systems',
      accent_color: '#0078D4',
      panels: [
        {
          title: 'Failed Logins (24h)',
          query: 'search source_type=windows EventID=4625 | stats count',
          visualization: 'stat',
          position_x: 0, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Successful Logins',
          query: 'search source_type=windows EventID=4624 | stats count',
          visualization: 'stat',
          position_x: 3, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Account Changes',
          query: 'search source_type=windows EventID=4720 OR EventID=4722 OR EventID=4723 | stats count',
          visualization: 'stat',
          position_x: 6, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Unique Users',
          query: 'search source_type=windows EventID=4624 | stats dc(TargetUserName)',
          visualization: 'stat',
          position_x: 9, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Login Attempts Over Time',
          query: 'search source_type=windows EventID=4624 OR EventID=4625 | eval status=if(EventID=4624,"Success","Failed") | timechart span=1h count by status',
          visualization: 'line',
          position_x: 0, position_y: 2, width: 8, height: 3,
        },
        {
          title: 'Login Types',
          query: 'search source_type=windows EventID=4624 | stats count by LogonType | sort desc count',
          visualization: 'pie',
          position_x: 8, position_y: 2, width: 4, height: 3,
        },
        {
          title: 'Failed Logins by User',
          query: 'search source_type=windows EventID=4625 | stats count by TargetUserName | sort desc count | limit 10',
          visualization: 'bar',
          position_x: 0, position_y: 5, width: 6, height: 4,
        },
        {
          title: 'Failed Logins by Source IP',
          query: 'search source_type=windows EventID=4625 | stats count by IpAddress | sort desc count | limit 10',
          visualization: 'bar',
          position_x: 6, position_y: 5, width: 6, height: 4,
        },
        {
          title: 'Recent Security Events',
          query: 'search source_type=windows | table timestamp EventID hostname TargetUserName message | limit 50',
          visualization: 'table',
          position_x: 0, position_y: 9, width: 12, height: 4,
        },
      ],
      variables: [
        {
          name: 'hostname',
          label: 'Host',
          type: 'query',
          query: 'search source_type=windows | stats count by hostname | table hostname',
          include_all: true,
          multi_select: true,
        },
      ],
    },
  },

  // Nginx/Web Server Dashboard
  {
    name: 'Web Server Dashboard',
    description: 'Monitor Nginx/Apache access logs, response codes, and traffic',
    category: 'web',
    required_sources: ['nginx', 'apache', 'web'],
    template: {
      name: 'Web Server',
      description: 'HTTP traffic and error monitoring',
      accent_color: '#009639',
      panels: [
        {
          title: 'Total Requests (24h)',
          query: 'search source_type=nginx OR source_type=apache | stats count',
          visualization: 'stat',
          position_x: 0, position_y: 0, width: 3, height: 2,
        },
        {
          title: '5xx Errors',
          query: 'search source_type=nginx status>=500 | stats count',
          visualization: 'stat',
          position_x: 3, position_y: 0, width: 3, height: 2,
        },
        {
          title: '4xx Errors',
          query: 'search source_type=nginx status>=400 status<500 | stats count',
          visualization: 'stat',
          position_x: 6, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Unique Visitors',
          query: 'search source_type=nginx | stats dc(client_ip)',
          visualization: 'stat',
          position_x: 9, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Requests Over Time',
          query: 'search source_type=nginx | timechart span=1h count',
          visualization: 'line',
          position_x: 0, position_y: 2, width: 8, height: 3,
        },
        {
          title: 'Response Codes',
          query: 'search source_type=nginx | stats count by status | sort desc count',
          visualization: 'pie',
          position_x: 8, position_y: 2, width: 4, height: 3,
        },
        {
          title: 'Top URLs',
          query: 'search source_type=nginx | stats count by request_uri | sort desc count | limit 15',
          visualization: 'bar',
          position_x: 0, position_y: 5, width: 6, height: 4,
        },
        {
          title: 'Top Client IPs',
          query: 'search source_type=nginx | stats count by client_ip | sort desc count | limit 15',
          visualization: 'bar',
          position_x: 6, position_y: 5, width: 6, height: 4,
        },
        {
          title: 'Recent Errors',
          query: 'search source_type=nginx status>=400 | table timestamp status request_uri client_ip | limit 50',
          visualization: 'table',
          position_x: 0, position_y: 9, width: 12, height: 4,
        },
      ],
      variables: [
        {
          name: 'status',
          label: 'Status Code',
          type: 'query',
          query: 'search source_type=nginx | stats count by status | table status',
          include_all: true,
          multi_select: true,
        },
      ],
    },
  },

  // Minecraft Server Dashboard
  {
    name: 'Minecraft Server Dashboard',
    description: 'Monitor player activity, server health, and game events',
    category: 'game-server',
    required_sources: ['minecraft'],
    template: {
      name: 'Minecraft Server',
      description: 'Player and server monitoring for Minecraft',
      accent_color: '#62B47A',
      panels: [
        {
          title: 'Players Online',
          query: 'search source_type=minecraft event=join | stats dc(player)',
          visualization: 'stat',
          position_x: 0, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Total Joins Today',
          query: 'search source_type=minecraft event=join | stats count',
          visualization: 'stat',
          position_x: 3, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Server Errors',
          query: 'search source_type=minecraft severity>=error | stats count',
          visualization: 'stat',
          position_x: 6, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Chat Messages',
          query: 'search source_type=minecraft event=chat | stats count',
          visualization: 'stat',
          position_x: 9, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Player Activity Over Time',
          query: 'search source_type=minecraft event=join OR event=leave | timechart span=1h count by event',
          visualization: 'line',
          position_x: 0, position_y: 2, width: 8, height: 3,
        },
        {
          title: 'Event Types',
          query: 'search source_type=minecraft | stats count by event | sort desc count',
          visualization: 'pie',
          position_x: 8, position_y: 2, width: 4, height: 3,
        },
        {
          title: 'Most Active Players',
          query: 'search source_type=minecraft | stats count by player | sort desc count | limit 15',
          visualization: 'bar',
          position_x: 0, position_y: 5, width: 6, height: 4,
        },
        {
          title: 'Death Causes',
          query: 'search source_type=minecraft event=death | stats count by cause | sort desc count | limit 10',
          visualization: 'bar',
          position_x: 6, position_y: 5, width: 6, height: 4,
        },
        {
          title: 'Recent Server Events',
          query: 'search source_type=minecraft | table timestamp event player message | limit 50',
          visualization: 'table',
          position_x: 0, position_y: 9, width: 12, height: 4,
        },
      ],
    },
  },

  // System Overview Dashboard
  {
    name: 'System Overview Dashboard',
    description: 'General system monitoring with error rates, host activity, and log volume',
    category: 'system',
    required_sources: [],
    template: {
      name: 'System Overview',
      description: 'General log monitoring and system health',
      accent_color: '#6366F1',
      panels: [
        {
          title: 'Total Events (24h)',
          query: 'search * | stats count',
          visualization: 'stat',
          position_x: 0, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Error Count',
          query: 'search severity>=error | stats count',
          visualization: 'stat',
          position_x: 3, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Warning Count',
          query: 'search severity=warning | stats count',
          visualization: 'stat',
          position_x: 6, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Active Hosts',
          query: 'search * | stats dc(hostname)',
          visualization: 'stat',
          position_x: 9, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Events Over Time',
          query: 'search * | timechart span=1h count',
          visualization: 'line',
          position_x: 0, position_y: 2, width: 8, height: 3,
        },
        {
          title: 'Events by Severity',
          query: 'search * | stats count by severity | sort severity',
          visualization: 'pie',
          position_x: 8, position_y: 2, width: 4, height: 3,
        },
        {
          title: 'Top Hosts by Volume',
          query: 'search * | stats count by hostname | sort desc count | limit 15',
          visualization: 'bar',
          position_x: 0, position_y: 5, width: 6, height: 4,
        },
        {
          title: 'Top Applications',
          query: 'search * | stats count by app_name | sort desc count | limit 15',
          visualization: 'bar',
          position_x: 6, position_y: 5, width: 6, height: 4,
        },
        {
          title: 'Recent Errors',
          query: 'search severity>=error | table timestamp hostname app_name message | limit 50',
          visualization: 'table',
          position_x: 0, position_y: 9, width: 12, height: 4,
        },
      ],
      variables: [
        {
          name: 'hostname',
          label: 'Host',
          type: 'query',
          query: 'search * | stats count by hostname | table hostname',
          include_all: true,
          multi_select: true,
        },
        {
          name: 'severity',
          label: 'Severity',
          type: 'query',
          query: 'search * | stats count by severity | table severity',
          include_all: true,
          multi_select: true,
        },
      ],
    },
  },

  // Ubiquiti Network Dashboard
  {
    name: 'Ubiquiti Network Dashboard',
    description: 'Monitor UniFi network devices, client connections, and wireless traffic',
    category: 'network',
    required_sources: ['ubiquiti', 'unifi'],
    template: {
      name: 'Ubiquiti Network',
      description: 'UniFi network monitoring',
      accent_color: '#0559C9',
      panels: [
        {
          title: 'Connected Clients',
          query: 'search source_type=unifi event=connect | stats dc(client)',
          visualization: 'stat',
          position_x: 0, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Active APs',
          query: 'search source_type=unifi device_type=ap | stats dc(device)',
          visualization: 'stat',
          position_x: 3, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'New Connections',
          query: 'search source_type=unifi event=connect | stats count',
          visualization: 'stat',
          position_x: 6, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Disconnections',
          query: 'search source_type=unifi event=disconnect | stats count',
          visualization: 'stat',
          position_x: 9, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Client Connections Over Time',
          query: 'search source_type=unifi event=connect OR event=disconnect | timechart span=1h count by event',
          visualization: 'line',
          position_x: 0, position_y: 2, width: 8, height: 3,
        },
        {
          title: 'Clients by SSID',
          query: 'search source_type=unifi | stats dc(client) by ssid | sort desc dc(client)',
          visualization: 'pie',
          position_x: 8, position_y: 2, width: 4, height: 3,
        },
        {
          title: 'Top Access Points',
          query: 'search source_type=unifi | stats count by device | sort desc count | limit 10',
          visualization: 'bar',
          position_x: 0, position_y: 5, width: 6, height: 4,
        },
        {
          title: 'Client Activity',
          query: 'search source_type=unifi | stats count by client | sort desc count | limit 15',
          visualization: 'bar',
          position_x: 6, position_y: 5, width: 6, height: 4,
        },
        {
          title: 'Recent Network Events',
          query: 'search source_type=unifi | table timestamp event device client ssid message | limit 50',
          visualization: 'table',
          position_x: 0, position_y: 9, width: 12, height: 4,
        },
      ],
    },
  },
];

export default DASHBOARD_TEMPLATES;
