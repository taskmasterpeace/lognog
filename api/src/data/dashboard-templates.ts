// Pre-built dashboard templates for common homelab log sources

export interface DashboardTemplateData {
  name: string;
  description: string;
  category: string;
  required_sources: string[];
  template: {
    name: string;
    description?: string;
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
      options?: Record<string, any>;  // Panel-specific options (gauge thresholds, units, etc.)
    }>;
    variables?: Array<{
      name: string;
      label: string;
      type: 'query' | 'custom';
      query?: string;
      default_value?: string;
      options?: string[];
      include_all?: boolean;
      multi_select?: boolean;
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

  // ============================================
  // SaaS Conversion Funnel Dashboard
  // ============================================
  {
    name: 'SaaS Conversion Funnel',
    description: 'Track user journey from signup through payment - signups, profiles, checkouts, subscriptions',
    category: 'application',
    required_sources: ['hey-youre-hired', 'saas-analytics'],
    template: {
      name: 'Conversion Funnel',
      description: 'User acquisition and conversion analytics',
      logo_url: '/hey-youre-hired-logo.png',
      accent_color: '#3B82F6',
      panels: [
        // Row 1: Key Funnel Metrics
        {
          title: 'Signups (24h)',
          query: 'search message~"User signup completed" | stats count',
          visualization: 'stat',
          position_x: 0, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Profiles Created',
          query: 'search message~"Profile created" | stats count',
          visualization: 'stat',
          position_x: 3, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Checkouts Started',
          query: 'search message~"Checkout started" | stats count',
          visualization: 'stat',
          position_x: 6, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Paid Subscriptions',
          query: 'search message~"Subscription synced" status="active" | stats count',
          visualization: 'stat',
          position_x: 9, position_y: 0, width: 3, height: 2,
        },
        // Row 2: Trends
        {
          title: 'Signups Over Time',
          query: 'search message~"User signup completed" | timechart span=1h count',
          visualization: 'line',
          position_x: 0, position_y: 2, width: 6, height: 3,
        },
        {
          title: 'Signups by Source',
          query: 'search message~"User signup completed" | stats count by utm_source | sort desc count | limit 10',
          visualization: 'bar',
          position_x: 6, position_y: 2, width: 6, height: 3,
        },
        // Row 3: Feature Usage
        {
          title: 'Feature Usage',
          query: 'search message~"Feature used" OR message~"Feature completed" | stats count by message | sort desc count | limit 10',
          visualization: 'pie',
          position_x: 0, position_y: 5, width: 4, height: 3,
        },
        {
          title: 'Job Recommendations Performance',
          query: 'search message~"Feature completed: job_recommendations" | stats avg(duration_ms) as avg_ms, avg(jobs_found) as avg_jobs',
          visualization: 'stat',
          position_x: 4, position_y: 5, width: 4, height: 3,
        },
        {
          title: 'Subscriptions by Plan',
          query: 'search message~"Subscription synced" | stats count by plan_name | sort desc count',
          visualization: 'bar',
          position_x: 8, position_y: 5, width: 4, height: 3,
        },
        // Row 4: Errors
        {
          title: 'Error Rate Over Time',
          query: 'search message~"failed" OR message~"error" | timechart span=1h count',
          visualization: 'line',
          position_x: 0, position_y: 8, width: 6, height: 3,
        },
        {
          title: 'Errors by Type',
          query: 'search message~"failed" OR message~"error" | stats count by message | sort desc count | limit 10',
          visualization: 'table',
          position_x: 6, position_y: 8, width: 6, height: 3,
        },
        // Row 5: Recent Events
        {
          title: 'Recent Funnel Events',
          query: 'search message~"User signup completed" OR message~"Profile created" OR message~"Checkout started" OR message~"Subscription synced" | table timestamp message user_email utm_source plan_name | sort desc timestamp | limit 50',
          visualization: 'table',
          position_x: 0, position_y: 11, width: 12, height: 4,
        },
      ],
      variables: [
        {
          name: 'utm_source',
          label: 'UTM Source',
          type: 'query',
          query: 'search message~"User signup completed" | stats count by utm_source | table utm_source',
          include_all: true,
          multi_select: true,
        },
        {
          name: 'plan_name',
          label: 'Plan',
          type: 'query',
          query: 'search message~"Subscription synced" | stats count by plan_name | table plan_name',
          include_all: true,
          multi_select: true,
        },
      ],
    },
  },

  // ============================================
  // LogNog Self-Monitoring Dashboard
  // ============================================
  {
    name: 'LogNog Health',
    description: 'Monitor LogNog itself - API performance, query execution, alerts, and ingest rates',
    category: 'system',
    required_sources: ['lognog-internal'],
    template: {
      name: 'LogNog Health',
      description: 'Self-monitoring dashboard for LogNog operational health',
      accent_color: '#D97706',
      panels: [
        // Row 1: Key Metrics
        {
          title: 'API Requests (24h)',
          query: 'search app_scope="lognog" category="api" | stats count',
          visualization: 'stat',
          position_x: 0, position_y: 0, width: 2, height: 2,
        },
        {
          title: 'API Errors',
          query: 'search app_scope="lognog" category="api" success=false | stats count',
          visualization: 'stat',
          position_x: 2, position_y: 0, width: 2, height: 2,
        },
        {
          title: 'Avg Response (ms)',
          query: 'search app_scope="lognog" category="api" | stats avg(duration_ms)',
          visualization: 'stat',
          position_x: 4, position_y: 0, width: 2, height: 2,
        },
        {
          title: 'Queries Executed',
          query: 'search app_scope="lognog" category="search" | stats count',
          visualization: 'stat',
          position_x: 6, position_y: 0, width: 2, height: 2,
        },
        {
          title: 'Events Ingested',
          query: 'search app_scope="lognog" action="ingest.batch" | stats sum(event_count)',
          visualization: 'stat',
          position_x: 8, position_y: 0, width: 2, height: 2,
        },
        {
          title: 'Alerts Triggered',
          query: 'search app_scope="lognog" action="alert.triggered" | stats count',
          visualization: 'stat',
          position_x: 10, position_y: 0, width: 2, height: 2,
        },
        // Row 2: API Performance
        {
          title: 'API Request Rate',
          query: 'search app_scope="lognog" category="api" | timechart span=1h count',
          visualization: 'line',
          position_x: 0, position_y: 2, width: 6, height: 3,
        },
        {
          title: 'API Latency (p95)',
          query: 'search app_scope="lognog" category="api" | timechart span=1h p95(duration_ms)',
          visualization: 'line',
          position_x: 6, position_y: 2, width: 6, height: 3,
        },
        // Row 3: Error Analysis
        {
          title: 'Errors by Category',
          query: 'search app_scope="lognog" success=false | stats count by category | sort desc count',
          visualization: 'pie',
          position_x: 0, position_y: 5, width: 4, height: 3,
        },
        {
          title: 'Error Rate Over Time',
          query: 'search app_scope="lognog" success=false | timechart span=1h count',
          visualization: 'line',
          position_x: 4, position_y: 5, width: 8, height: 3,
        },
        // Row 4: Ingest & Queries
        {
          title: 'Ingest Rate by Source',
          query: 'search app_scope="lognog" action="ingest.batch" | timechart span=1h sum(event_count) by source_type',
          visualization: 'area',
          position_x: 0, position_y: 8, width: 6, height: 3,
        },
        {
          title: 'Query Performance',
          query: 'search app_scope="lognog" category="search" | timechart span=1h avg(duration_ms) p95(duration_ms)',
          visualization: 'line',
          position_x: 6, position_y: 8, width: 6, height: 3,
        },
        // Row 5: Auth & Alerts
        {
          title: 'Authentication Events',
          query: 'search app_scope="lognog" category="auth" | stats count by action | sort desc count',
          visualization: 'bar',
          position_x: 0, position_y: 11, width: 4, height: 3,
        },
        {
          title: 'Alert Summary',
          query: 'search app_scope="lognog" category="alert" | stats count by action | sort desc count',
          visualization: 'bar',
          position_x: 4, position_y: 11, width: 4, height: 3,
        },
        {
          title: 'Slow Queries (>5s)',
          query: 'search app_scope="lognog" action="search.slow" | table timestamp message duration_ms | sort desc timestamp | limit 20',
          visualization: 'table',
          position_x: 8, position_y: 11, width: 4, height: 3,
        },
        // Row 6: Recent Activity
        {
          title: 'Recent Errors',
          query: 'search app_scope="lognog" success=false | table timestamp category action message | sort desc timestamp | limit 25',
          visualization: 'table',
          position_x: 0, position_y: 14, width: 12, height: 4,
        },
      ],
      variables: [
        {
          name: 'category',
          label: 'Category',
          type: 'query',
          query: 'search app_scope="lognog" | stats count by category | table category',
          include_all: true,
          multi_select: true,
        },
      ],
    },
  },

  // Log Ingestion Health Dashboard - Built-in monitoring
  {
    name: 'Log Ingestion Health',
    description: 'Monitor log ingestion rates, volume by index, top sources, and identify potential issues with your log pipeline',
    category: 'system',
    required_sources: [],
    template: {
      name: 'Log Ingestion Health',
      description: 'Real-time monitoring of log ingestion pipeline health',
      accent_color: '#10B981',
      panels: [
        // Row 1: Key Stats
        {
          title: 'Total Logs (24h)',
          query: 'search * | stats count',
          visualization: 'stat',
          position_x: 0, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Logs Per Hour (avg)',
          query: 'search * | timechart span=1h count | stats avg(count)',
          visualization: 'stat',
          position_x: 3, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Unique Sources',
          query: 'search * | stats dc(hostname)',
          visualization: 'stat',
          position_x: 6, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Active Indexes',
          query: 'search * | stats dc(index_name)',
          visualization: 'stat',
          position_x: 9, position_y: 0, width: 3, height: 2,
        },
        // Row 2: Ingestion Over Time
        {
          title: 'Ingestion Rate Over Time',
          query: 'search * | timechart span=15m count',
          visualization: 'area',
          position_x: 0, position_y: 2, width: 8, height: 4,
        },
        {
          title: 'Logs by Index',
          query: 'search * | stats count by index_name | sort desc count | limit 10',
          visualization: 'pie',
          position_x: 8, position_y: 2, width: 4, height: 4,
        },
        // Row 3: Source Distribution
        {
          title: 'Top 10 Sources by Volume',
          query: 'search * | stats count by hostname | sort desc count | limit 10',
          visualization: 'bar',
          position_x: 0, position_y: 6, width: 6, height: 4,
        },
        {
          title: 'Severity Distribution',
          query: 'search * | stats count by severity | sort asc severity',
          visualization: 'pie',
          position_x: 6, position_y: 6, width: 3, height: 4,
        },
        {
          title: 'Error Rate',
          query: 'search severity<=3 | timechart span=1h count',
          visualization: 'line',
          position_x: 9, position_y: 6, width: 3, height: 4,
        },
        // Row 4: App Analysis
        {
          title: 'Top Applications',
          query: 'search * | stats count by app_name | sort desc count | limit 15',
          visualization: 'bar',
          position_x: 0, position_y: 10, width: 6, height: 4,
        },
        {
          title: 'Ingestion by Hour of Day',
          query: 'search * | eval hour=strftime(timestamp, "%H") | stats count by hour | sort asc hour',
          visualization: 'bar',
          position_x: 6, position_y: 10, width: 6, height: 4,
        },
        // Row 5: Recent Logs & Potential Issues
        {
          title: 'Recent Critical/Error Logs',
          query: 'search severity<=3 | table timestamp hostname app_name severity message | sort desc timestamp | limit 20',
          visualization: 'table',
          position_x: 0, position_y: 14, width: 12, height: 4,
        },
      ],
      variables: [
        {
          name: 'index_name',
          label: 'Index',
          type: 'query',
          query: 'search * | stats count by index_name | table index_name',
          include_all: true,
          multi_select: true,
        },
        {
          name: 'hostname',
          label: 'Source Host',
          type: 'query',
          query: 'search * | stats count by hostname | table hostname',
          include_all: true,
          multi_select: true,
        },
      ],
    },
  },

  // ============================================
  // HYH Activation Metrics Dashboard
  // ============================================
  {
    name: 'HYH Activation Metrics',
    description: 'Track user activation for Hey You\'re Hired - signup to first value within 48 hours',
    category: 'application',
    required_sources: ['hey-youre-hired'],
    template: {
      name: 'HYH Activation Metrics',
      logo_url: '/hey-youre-hired-logo.png',
      accent_color: '#3B82F6',
      panels: [
        // Row 1: Key Counts and Comparison
        {
          title: 'Signups (7 days)',
          query: 'search index=hey-youre-hired event_type="signup" earliest=-7d | stats dc(user_id) as count',
          visualization: 'stat',
          position_x: 0, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Activated (7 days)',
          query: 'search index=hey-youre-hired event_type="activated" earliest=-7d | stats dc(user_id) as count',
          visualization: 'stat',
          position_x: 3, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Signups (30 days)',
          query: 'search index=hey-youre-hired event_type="signup" earliest=-30d | stats dc(user_id) as count',
          visualization: 'stat',
          position_x: 6, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Activated (30 days)',
          query: 'search index=hey-youre-hired event_type="activated" earliest=-30d | stats dc(user_id) as count',
          visualization: 'stat',
          position_x: 9, position_y: 0, width: 3, height: 2,
        },
        {
          title: 'Signups vs Activated (7d)',
          query: 'search index=hey-youre-hired (event_type="signup" OR event_type="activated") earliest=-7d | stats dc(user_id) by event_type',
          visualization: 'bar',
          position_x: 0, position_y: 2, width: 6, height: 3,
        },
        {
          title: 'Signups vs Activated (30d)',
          query: 'search index=hey-youre-hired (event_type="signup" OR event_type="activated") earliest=-30d | stats dc(user_id) by event_type',
          visualization: 'bar',
          position_x: 6, position_y: 2, width: 6, height: 3,
        },
        // Row 3: First Smart Jobs Stats
        {
          title: 'First Smart Jobs Today',
          query: 'search index=hey-youre-hired event_type="first_smart_jobs" earliest=-1d | stats dc(user_id) as count',
          visualization: 'stat',
          position_x: 0, position_y: 5, width: 3, height: 2,
        },
        {
          title: 'First Smart Jobs (7d)',
          query: 'search index=hey-youre-hired event_type="first_smart_jobs" earliest=-7d | stats dc(user_id) as count',
          visualization: 'stat',
          position_x: 3, position_y: 5, width: 3, height: 2,
        },
        {
          title: 'First Smart Jobs (All Time)',
          query: 'search index=hey-youre-hired event_type="first_smart_jobs" | stats dc(user_id) as count',
          visualization: 'stat',
          position_x: 6, position_y: 5, width: 3, height: 2,
        },
        {
          title: 'Hours to Activation',
          query: 'search index=hey-youre-hired event_type="activated" | eval bucket=case(hours_to_activation < 1, "<1h", hours_to_activation < 6, "1-6h", hours_to_activation < 12, "6-12h", hours_to_activation < 24, "12-24h", hours_to_activation < 48, "24-48h") | stats count by bucket',
          visualization: 'pie',
          position_x: 9, position_y: 5, width: 3, height: 2,
        },
        // Row 4: Daily Activations Trend
        {
          title: 'Daily Activations (30d)',
          query: 'search index=hey-youre-hired event_type="activated" earliest=-30d | timechart span=1d dc(user_id) as activations',
          visualization: 'area',
          position_x: 0, position_y: 7, width: 12, height: 3,
        },
        // Row 5: Profile & Smart Jobs Trends
        {
          title: 'Profile Completions (30d)',
          query: 'search index=hey-youre-hired event_type="profile_complete" earliest=-30d | timechart span=1d dc(user_id) as completions',
          visualization: 'area',
          position_x: 0, position_y: 10, width: 6, height: 3,
        },
        {
          title: 'First Smart Jobs Runs (30d)',
          query: 'search index=hey-youre-hired event_type="first_smart_jobs" earliest=-30d | timechart span=1d dc(user_id) as first_runs',
          visualization: 'area',
          position_x: 6, position_y: 10, width: 6, height: 3,
        },
      ],
      variables: [
        {
          name: 'timerange',
          label: 'Time Range',
          type: 'custom',
          default_value: '-7d',
          options: ['-1d', '-7d', '-30d', '-90d'],
        },
      ],
    },
  },
];

export default DASHBOARD_TEMPLATES;
