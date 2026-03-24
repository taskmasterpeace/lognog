# Phase 2: Source Templates System - Manual Integration Steps

The implementation is complete! All files have been created. Due to file locking during development, these two files need manual updates:

## 1. Register Templates Route in API (api/src/index.ts)

Add these import statements at the top:
```typescript
import templatesRouter from './routes/templates.js';
import { seedBuiltinTemplates } from './data/builtin-templates.js';
```

Add the templates router with other API routes:
```typescript
app.use('/templates', templatesRouter);
```

Add the templates path to the SPA fallback exclusion list:
```typescript
if (req.path.startsWith('/auth') ||
    req.path.startsWith('/ingest') ||
    // ... other paths ...
    req.path.startsWith('/templates') ||  // ADD THIS LINE
    req.path.startsWith('/health') ||
```

Seed built-in templates on server startup (in the app.listen callback):
```typescript
app.listen(PORT, () => {
  console.log(`LogNog API server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);

  // Seed built-in templates on startup
  try {
    seedBuiltinTemplates();
  } catch (error) {
    console.error('Error seeding templates:', error);
  }

  // Start the report scheduler
  startScheduler();
});
```

## 2. Add Data Sources Page to UI (ui/src/App.tsx)

Add the import:
```typescript
import DataSourcesPage from './pages/DataSourcesPage';
```

Add the navigation link in the sidebar (in the Layout component):
```typescript
<p className="px-3 py-2 mt-6 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
  Configuration
</p>
<NavLink to="/data-sources" icon={Database}>Data Sources</NavLink>
<NavLink to="/knowledge" icon={BookOpen}>Knowledge</NavLink>
```

Add the route in AppRoutes (place it before /docs route):
```typescript
<Route
  path="/data-sources"
  element={
    <ProtectedRoute>
      <Layout>
        <DataSourcesPage />
      </Layout>
    </ProtectedRoute>
  }
/>
```

## That's it!

After making these changes:
1. Restart the API server
2. Rebuild the UI if needed
3. Navigate to /data-sources to see the new Data Sources page with 8 built-in templates

The system includes:
- MySQL Error Log & Slow Query Log
- PostgreSQL
- MongoDB
- Apache & Nginx Access Logs
- Windows Security Events
- IIS Access Logs

Each template includes:
- Setup instructions with real configuration examples
- Agent configuration (for LogNog In)
- Syslog configuration examples
- Field extraction patterns (regex/JSON path)
- Sample log lines
- Example queries
