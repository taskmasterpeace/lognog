import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import searchRouter from './search.js';

// Create a test app
const app = express();
app.use(express.json());
app.use('/search', searchRouter);

describe('Saved Search Export/Import', () => {
  const testSearchIds: string[] = [];

  // Helper to create a test search
  async function createTestSearch(name: string, query: string, description?: string) {
    const res = await request(app)
      .post('/search/saved')
      .send({ name, query, description });
    if (res.body.id) testSearchIds.push(res.body.id);
    return res;
  }

  // Cleanup after tests
  afterAll(async () => {
    for (const id of testSearchIds) {
      await request(app).delete(`/search/saved/${id}`);
    }
  });

  describe('Single Export (POST /search/saved/:id/export)', () => {
    it('should export a saved search with correct structure', async () => {
      // Create a test search
      const createRes = await createTestSearch(
        'Export Test',
        'search error | stats count',
        'Test description'
      );
      expect(createRes.status).toBe(201);
      const searchId = createRes.body.id;

      // Export it
      const exportRes = await request(app)
        .post(`/search/saved/${searchId}/export`)
        .send();

      expect(exportRes.status).toBe(200);
      expect(exportRes.body).toMatchObject({
        name: 'Export Test',
        query: 'search error | stats count',
        description: 'Test description',
        version: '1.0',
      });
      expect(exportRes.body.exported_at).toBeDefined();
    });

    it('should return 404 for non-existent saved search', async () => {
      const res = await request(app)
        .post('/search/saved/non-existent-id/export')
        .send();

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Saved search not found');
    });
  });

  describe('Single Import (POST /search/saved/import)', () => {
    it('should import a saved search from template', async () => {
      const template = {
        name: 'Imported Search',
        query: 'search warning',
        description: 'Imported test',
        exported_at: '2024-01-01T00:00:00.000Z',
        version: '1.0',
      };

      const res = await request(app)
        .post('/search/saved/import')
        .send({ template });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Imported Search');
      expect(res.body.query).toBe('search warning');
      expect(res.body.description).toBe('Imported test');
      testSearchIds.push(res.body.id);
    });

    it('should allow name override during import', async () => {
      const template = {
        name: 'Original Name',
        query: 'search test',
      };

      const res = await request(app)
        .post('/search/saved/import')
        .send({ template, name: 'Override Name' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Override Name');
      testSearchIds.push(res.body.id);
    });

    it('should return 400 for missing template', async () => {
      const res = await request(app)
        .post('/search/saved/import')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('template');
    });

    it('should return 400 for missing name in template', async () => {
      const res = await request(app)
        .post('/search/saved/import')
        .send({ template: { query: 'search *' } });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('name');
    });

    it('should return 400 for missing query in template', async () => {
      const res = await request(app)
        .post('/search/saved/import')
        .send({ template: { name: 'Test' } });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('query');
    });
  });

  describe('Bulk Export (POST /search/saved/export)', () => {
    beforeAll(async () => {
      // Create multiple test searches
      await createTestSearch('Bulk Test 1', 'search bulk1');
      await createTestSearch('Bulk Test 2', 'search bulk2');
      await createTestSearch('Bulk Test 3', 'search bulk3');
    });

    it('should export all saved searches', async () => {
      const res = await request(app)
        .post('/search/saved/export')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.type).toBe('saved_searches');
      expect(res.body.count).toBeGreaterThanOrEqual(3);
      expect(res.body.searches).toHaveLength(res.body.count);
      expect(res.body.version).toBe('1.0');
      expect(res.body.exported_at).toBeDefined();
    });

    it('should export only specified IDs', async () => {
      const idsToExport = testSearchIds.slice(0, 2);
      const res = await request(app)
        .post('/search/saved/export')
        .send({ ids: idsToExport });

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(2);
      expect(res.body.searches).toHaveLength(2);
    });

    it('should return empty array for non-existent IDs', async () => {
      const res = await request(app)
        .post('/search/saved/export')
        .send({ ids: ['fake-id-1', 'fake-id-2'] });

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
      expect(res.body.searches).toHaveLength(0);
    });
  });

  describe('Bulk Import (POST /search/saved/import-bulk)', () => {
    it('should import multiple searches', async () => {
      const searches = [
        { name: 'Bulk Import 1', query: 'search import1' },
        { name: 'Bulk Import 2', query: 'search import2', description: 'With desc' },
        { name: 'Bulk Import 3', query: 'search import3' },
      ];

      const res = await request(app)
        .post('/search/saved/import-bulk')
        .send({ searches });

      expect(res.status).toBe(201);
      expect(res.body.type).toBe('saved_searches_import');
      expect(res.body.successful_count).toBe(3);
      expect(res.body.failed_count).toBe(0);
      expect(res.body.successful).toHaveLength(3);
      expect(res.body.imported_at).toBeDefined();

      // Track for cleanup
      res.body.successful.forEach((s: { id: string }) => testSearchIds.push(s.id));
    });

    it('should handle partial failures', async () => {
      const searches = [
        { name: 'Valid', query: 'search valid' },
        { name: 'Invalid - no query' }, // Missing query
        { query: 'missing name' }, // Missing name
        { name: 'Valid 2', query: 'search valid2' },
      ];

      const res = await request(app)
        .post('/search/saved/import-bulk')
        .send({ searches });

      expect(res.status).toBe(201); // Partial success
      expect(res.body.successful_count).toBe(2);
      expect(res.body.failed_count).toBe(2);
      expect(res.body.failed.some((f: { error: string }) => f.error.includes('query'))).toBe(true);
      expect(res.body.failed.some((f: { error: string }) => f.error.includes('name'))).toBe(true);

      res.body.successful.forEach((s: { id: string }) => testSearchIds.push(s.id));
    });

    it('should return 400 when all imports fail', async () => {
      const searches = [
        { name: 'No query 1' },
        { query: 'no name' },
      ];

      const res = await request(app)
        .post('/search/saved/import-bulk')
        .send({ searches });

      expect(res.status).toBe(400);
      expect(res.body.successful_count).toBe(0);
      expect(res.body.failed_count).toBe(2);
    });

    it('should return 400 for empty searches array', async () => {
      const res = await request(app)
        .post('/search/saved/import-bulk')
        .send({ searches: [] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('empty');
    });

    it('should return 400 for missing searches field', async () => {
      const res = await request(app)
        .post('/search/saved/import-bulk')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('searches');
    });
  });

  describe('Round-trip Export/Import', () => {
    it('should preserve data through export and import', async () => {
      // Create a search
      const createRes = await createTestSearch(
        'Round Trip Test',
        'search status=500 | stats count by host',
        'Original description'
      );
      const originalId = createRes.body.id;

      // Export it
      const exportRes = await request(app)
        .post(`/search/saved/${originalId}/export`)
        .send();

      expect(exportRes.status).toBe(200);

      // Import it with a new name
      const importRes = await request(app)
        .post('/search/saved/import')
        .send({ template: exportRes.body, name: 'Round Trip Copy' });

      expect(importRes.status).toBe(201);
      expect(importRes.body.name).toBe('Round Trip Copy');
      expect(importRes.body.query).toBe(exportRes.body.query);
      expect(importRes.body.description).toBe(exportRes.body.description);
      testSearchIds.push(importRes.body.id);
    });

    it('should preserve bulk export/import data', async () => {
      // Export all
      const exportRes = await request(app)
        .post('/search/saved/export')
        .send({});

      expect(exportRes.status).toBe(200);
      const originalCount = exportRes.body.count;

      // Import the bulk export
      const importRes = await request(app)
        .post('/search/saved/import-bulk')
        .send({ searches: exportRes.body.searches });

      expect(importRes.status).toBe(201);
      expect(importRes.body.successful_count).toBe(originalCount);

      importRes.body.successful.forEach((s: { id: string }) => testSearchIds.push(s.id));
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in name and query', async () => {
      const template = {
        name: 'Special "quotes" & <chars>',
        query: 'search "message" | where status > 400',
        description: 'Test <>"\'\\/&',
      };

      const res = await request(app)
        .post('/search/saved/import')
        .send({ template });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe(template.name);
      expect(res.body.query).toBe(template.query);
      testSearchIds.push(res.body.id);
    });

    it('should handle unicode characters', async () => {
      const template = {
        name: 'Unicode 日本語 émoji 🚀',
        query: 'search 日本語',
        description: '测试 unicode 🎉',
      };

      const res = await request(app)
        .post('/search/saved/import')
        .send({ template });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe(template.name);
      expect(res.body.query).toBe(template.query);
      testSearchIds.push(res.body.id);
    });

    it('should handle very long queries', async () => {
      const longQuery = 'search error | ' + 'stats count by field | '.repeat(50) + 'head 100';
      const template = {
        name: 'Long Query Search',
        query: longQuery,
      };

      const res = await request(app)
        .post('/search/saved/import')
        .send({ template });

      expect(res.status).toBe(201);
      expect(res.body.query).toBe(longQuery);
      testSearchIds.push(res.body.id);
    });

    it('should handle null description', async () => {
      const template = {
        name: 'Null Description',
        query: 'search test',
        description: null,
      };

      const res = await request(app)
        .post('/search/saved/import')
        .send({ template });

      expect(res.status).toBe(201);
      testSearchIds.push(res.body.id);
    });

    it('should handle extra fields from external exports', async () => {
      const template = {
        name: 'External Export',
        query: 'search external',
        description: 'From another system',
        exported_at: '2023-01-01T00:00:00.000Z',
        version: '1.0',
        // Extra fields that might come from external systems
        source_environment: 'production',
        created_by: 'user@example.com',
        custom_field: 'custom value',
      };

      const res = await request(app)
        .post('/search/saved/import')
        .send({ template });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('External Export');
      expect(res.body.query).toBe('search external');
      testSearchIds.push(res.body.id);
    });

    it('should handle large bulk imports', async () => {
      const searches = Array.from({ length: 20 }, (_, i) => ({
        name: `Large Import ${i + 1}`,
        query: `search large_test_${i + 1}`,
        description: `Search ${i + 1} of 20`,
      }));

      const res = await request(app)
        .post('/search/saved/import-bulk')
        .send({ searches });

      expect(res.status).toBe(201);
      expect(res.body.successful_count).toBe(20);
      expect(res.body.failed_count).toBe(0);

      res.body.successful.forEach((s: { id: string }) => testSearchIds.push(s.id));
    });
  });
});
