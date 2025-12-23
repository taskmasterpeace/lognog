import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import dashboardsRouter from './dashboards.js';
import { closeDatabase } from '../db/sqlite.js';

describe('Dashboard Duplicate Feature', () => {
  let app: Express;
  let testDashboardId: string;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/dashboards', dashboardsRouter);
  });

  afterAll(() => {
    closeDatabase();
  });

  it('should create a test dashboard', async () => {
    const response = await request(app)
      .post('/dashboards')
      .send({ name: 'Test Dashboard for Duplicate', description: 'Test description' });

    expect(response.status).toBe(201);
    expect(response.body.name).toBe('Test Dashboard for Duplicate');
    testDashboardId = response.body.id;
  });

  it('should add branding to the dashboard', async () => {
    const response = await request(app)
      .put(`/dashboards/${testDashboardId}/branding`)
      .send({
        logo_url: 'https://example.com/logo.png',
        accent_color: '#0ea5e9',
        header_color: '#1e293b',
        description: 'Updated description',
      });

    expect(response.status).toBe(200);
    expect(response.body.logo_url).toBe('https://example.com/logo.png');
    expect(response.body.accent_color).toBe('#0ea5e9');
    expect(response.body.header_color).toBe('#1e293b');
  });

  it('should add a panel to the dashboard', async () => {
    const response = await request(app)
      .post(`/dashboards/${testDashboardId}/panels`)
      .send({
        title: 'Test Panel',
        query: 'search * | stats count by hostname',
        visualization: 'bar',
        options: { showLegend: true },
        position: { x: 0, y: 0, width: 6, height: 4 },
      });

    expect(response.status).toBe(201);
    expect(response.body.title).toBe('Test Panel');
    expect(response.body.visualization).toBe('bar');
  });

  it('should add a variable to the dashboard', async () => {
    const response = await request(app)
      .post(`/dashboards/${testDashboardId}/variables`)
      .send({
        name: 'host',
        label: 'Hostname',
        type: 'query',
        query: 'search * | stats count by hostname',
        default_value: '*',
        multi_select: true,
        include_all: true,
        sort_order: 0,
      });

    expect(response.status).toBe(201);
    expect(response.body.name).toBe('host');
    expect(response.body.multi_select).toBe(1);
    expect(response.body.include_all).toBe(1);
  });

  it('should duplicate the dashboard with all its contents', async () => {
    const response = await request(app)
      .post(`/dashboards/${testDashboardId}/duplicate`);

    expect(response.status).toBe(201);

    // Verify name has " - Copy" suffix
    expect(response.body.name).toBe('Test Dashboard for Duplicate - Copy');

    // Verify the duplicate has a different ID
    expect(response.body.id).not.toBe(testDashboardId);

    // Verify panels are copied
    expect(response.body.panels).toHaveLength(1);
    expect(response.body.panels[0].title).toBe('Test Panel');
    expect(response.body.panels[0].query).toBe('search * | stats count by hostname');
    expect(response.body.panels[0].visualization).toBe('bar');
    expect(response.body.panels[0].options.showLegend).toBe(true);
    expect(response.body.panels[0].position_x).toBe(0);
    expect(response.body.panels[0].position_y).toBe(0);
    expect(response.body.panels[0].width).toBe(6);
    expect(response.body.panels[0].height).toBe(4);
  });

  it('should copy branding settings to the duplicate', async () => {
    // First get the duplicate dashboard
    const dashboards = await request(app).get('/dashboards');
    const duplicate = dashboards.body.find((d: { name: string }) => d.name === 'Test Dashboard for Duplicate - Copy');

    expect(duplicate).toBeDefined();
    expect(duplicate.logo_url).toBe('https://example.com/logo.png');
    expect(duplicate.accent_color).toBe('#0ea5e9');
    expect(duplicate.header_color).toBe('#1e293b');
  });

  it('should copy variables to the duplicate', async () => {
    // Get the duplicate dashboard
    const dashboards = await request(app).get('/dashboards');
    const duplicate = dashboards.body.find((d: { name: string }) => d.name === 'Test Dashboard for Duplicate - Copy');

    // Get variables for the duplicate
    const variables = await request(app).get(`/dashboards/${duplicate.id}/variables`);

    expect(variables.body).toHaveLength(1);
    expect(variables.body[0].name).toBe('host');
    expect(variables.body[0].label).toBe('Hostname');
    expect(variables.body[0].type).toBe('query');
    expect(variables.body[0].multi_select).toBe(1);
    expect(variables.body[0].include_all).toBe(1);
  });

  it('should return 404 for non-existent dashboard', async () => {
    const response = await request(app)
      .post('/dashboards/non-existent-id/duplicate');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Dashboard not found');
  });

  it('should cleanup test dashboards', async () => {
    // Get all dashboards
    const dashboards = await request(app).get('/dashboards');

    // Delete test dashboards
    for (const dashboard of dashboards.body) {
      if (dashboard.name.includes('Test Dashboard for Duplicate')) {
        await request(app).delete(`/dashboards/${dashboard.id}`);
      }
    }
  });
});
