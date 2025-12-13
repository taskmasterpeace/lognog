const API_URL = 'http://localhost:4000';

const DEMO_USER = {
  username: 'demo',
  email: 'demo@lognog.local',
  password: 'DemoPassword123!'
};

async function getToken() {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: DEMO_USER.username,
      password: DEMO_USER.password
    })
  });

  if (!res.ok) {
    throw new Error('Login failed');
  }

  const data = await res.json();
  return data.accessToken;
}

async function getDashboards(token) {
  const res = await fetch(`${API_URL}/dashboards`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return res.json();
}

async function addPanelToDashboard(token, dashboardId, panel) {
  const res = await fetch(`${API_URL}/dashboards/${dashboardId}/panels`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(panel)
  });

  if (res.ok) {
    return await res.json();
  } else {
    console.log('  Panel creation failed:', await res.text());
    return null;
  }
}

async function setupDashboardPanels(token) {
  console.log('Setting up dashboard panels...');

  const dashboards = await getDashboards(token);
  console.log(`Found ${dashboards.length} dashboards`);

  if (dashboards.length === 0) {
    console.log('No dashboards found, creating one...');
    const res = await fetch(`${API_URL}/dashboards`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: 'System Overview',
        description: 'Overview of system health and log activity'
      })
    });
    const newDashboard = await res.json();
    dashboards.push(newDashboard);
  }

  const dashboard = dashboards[0];
  console.log(`Adding panels to dashboard: ${dashboard.name} (${dashboard.id})`);

  const panels = [
    {
      title: 'Events by Severity',
      query: 'search * | stats count by severity',
      visualization: 'pie',
      options: { showLegend: true },
      position: { x: 0, y: 0, width: 4, height: 2 }
    },
    {
      title: 'Top Hosts',
      query: 'search * | stats count by hostname | sort desc | limit 5',
      visualization: 'bar',
      options: { showLegend: false },
      position: { x: 4, y: 0, width: 4, height: 2 }
    },
    {
      title: 'Events Over Time',
      query: 'search * | timechart count',
      visualization: 'line',
      options: { showLegend: true },
      position: { x: 8, y: 0, width: 4, height: 2 }
    },
    {
      title: 'Top Applications',
      query: 'search * | stats count by app_name | sort desc | limit 5',
      visualization: 'bar',
      options: { showLegend: false },
      position: { x: 0, y: 2, width: 6, height: 2 }
    },
    {
      title: 'Recent Errors',
      query: 'search severity<=3 | table timestamp hostname app_name message | limit 10',
      visualization: 'table',
      options: {},
      position: { x: 6, y: 2, width: 6, height: 2 }
    }
  ];

  for (const panel of panels) {
    const result = await addPanelToDashboard(token, dashboard.id, panel);
    if (result) {
      console.log(`  Added panel: ${panel.title}`);
    }
  }

  return dashboard.id;
}

async function createAlert(token) {
  console.log('Creating sample alert...');

  const alert = {
    name: 'High Error Rate Alert',
    description: 'Alert when error count exceeds threshold in 15 minute window',
    search_query: 'search severity<=3 | stats count',
    trigger_type: 'threshold',
    trigger_condition: 'greater_than',
    trigger_threshold: 10,
    schedule_type: 'interval',
    cron_expression: '*/5 * * * *',
    time_range: '15m',
    severity: 'high',
    actions: [
      { type: 'log', config: {} }
    ],
    enabled: true
  };

  const res = await fetch(`${API_URL}/alerts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(alert)
  });

  if (res.ok) {
    const data = await res.json();
    console.log('Alert created:', data.name);
    return data;
  } else {
    const text = await res.text();
    if (text.includes('already exists') || text.includes('UNIQUE constraint')) {
      console.log('Alert already exists');
    } else {
      console.log('Alert creation failed:', text);
    }
  }
}

async function main() {
  try {
    console.log('Setting up demo data...\n');

    const token = await getToken();
    console.log('Authenticated!\n');

    const dashboardId = await setupDashboardPanels(token);
    console.log(`\nDashboard ID for screenshots: ${dashboardId}\n`);

    await createAlert(token);
    console.log('');

    console.log('Demo data setup complete!');
    console.log('\nUse this dashboard ID in screenshots:', dashboardId);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
