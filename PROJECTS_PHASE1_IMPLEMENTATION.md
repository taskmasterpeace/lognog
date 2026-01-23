# Projects System - Phase 1 Implementation

**Status:** ✅ Complete (Backend Only)

## Overview

Implemented the Projects system for LogNog to organize dashboards, alerts, and reports by project. This is Phase 1 focusing on the backend infrastructure.

## What Was Implemented

### 1. Database Schema (`api/src/db/sqlite.ts`)

#### New Tables

**projects**
```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  logo_url TEXT,
  accent_color TEXT,
  sort_order INTEGER DEFAULT 0,
  is_archived INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
)
```

**dashboard_logos**
```sql
CREATE TABLE dashboard_logos (
  id TEXT PRIMARY KEY,
  dashboard_id TEXT NOT NULL,
  logo_url TEXT NOT NULL,
  label TEXT,
  position INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (dashboard_id) REFERENCES dashboards(id) ON DELETE CASCADE
)
```

#### Schema Modifications

**dashboards table**
- Added: `project_id` column (references projects.id)

**dashboard_panels table** (for provenance tracking)
- Added: `source_panel_id` - Original panel ID if copied
- Added: `source_dashboard_id` - Original dashboard ID
- Added: `source_project_id` - Original project ID
- Added: `copied_at` - Timestamp when copied
- Added: `copy_generation` - Number of copy iterations (0 = original)

### 2. TypeScript Interfaces

```typescript
interface Project {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logo_url?: string;
  accent_color?: string;
  sort_order: number;
  is_archived: number;
  created_at: string;
  updated_at: string;
}

interface DashboardLogo {
  id: string;
  dashboard_id: string;
  logo_url: string;
  label?: string;
  position: number;
  created_at: string;
}
```

### 3. Database Functions

**Projects**
- `createProject(name, slug, options)` - Create new project
- `getProjects()` - List all active projects
- `getProject(id)` - Get single project by ID
- `getProjectBySlug(slug)` - Get project by slug
- `updateProject(id, updates)` - Update project
- `deleteProject(id)` - Delete project
- `getDashboardsByProject(projectId)` - Get dashboards in project

**Dashboard Logos**
- `addDashboardLogo(dashboardId, logoUrl, options)` - Add logo to dashboard
- `getDashboardLogos(dashboardId)` - Get all logos for dashboard
- `removeDashboardLogo(id)` - Delete logo
- `reorderDashboardLogos(dashboardId, logoIds)` - Reorder logos

### 4. API Routes (`api/src/routes/projects.ts`)

#### Projects
- `GET /projects` - List all projects
- `GET /projects/:id` - Get single project
- `GET /projects/slug/:slug` - Get project by slug
- `POST /projects` - Create new project
- `PUT /projects/:id` - Update project
- `DELETE /projects/:id` - Delete project
- `GET /projects/:id/dashboards` - Get dashboards in project

#### Dashboard Logos (added to `api/src/routes/dashboards.ts`)
- `GET /dashboards/:id/logos` - Get dashboard logos
- `POST /dashboards/:id/logos` - Add logo to dashboard
- `DELETE /dashboards/:id/logos/:logoId` - Remove logo
- `PUT /dashboards/:id/logos/reorder` - Reorder logos

### 5. Migration Script

**Location:** `api/scripts/migrate-to-projects.ts`

**What it does:**
1. Gets unique `app_scope` values from dashboards
2. Creates a project for each app_scope
3. Updates dashboards to reference their project_id
4. Creates "Hey You're Hired" project with HYH branding
5. Creates "General" project for default/empty scopes

**Run with:**
```bash
cd api
npx tsx scripts/migrate-to-projects.ts
```

### 6. Test Script

**Location:** `api/scripts/test-projects-api.ts`

Tests all CRUD operations and dashboard logo functionality.

**Run with:**
```bash
cd api
npx tsx scripts/test-projects-api.ts
```

## Database Changes Applied

The migration was successfully run on the existing database:

```
✓ Created project: Directors Palette (directors-palette)
✓ Created project: Hey Youre Hired (hey-youre-hired)
✓ Created General project
✓ Migrated 12/12 dashboards to projects
```

## API Integration

The projects router is registered in `api/src/index.ts`:

```typescript
import projectsRouter from './routes/projects.js';
app.use('/projects', projectsRouter);
```

## Dashboard Updates

**Dashboard creation** now accepts `project_id`:
```typescript
POST /dashboards
{
  "name": "My Dashboard",
  "description": "...",
  "project_id": "uuid-here"  // NEW
}
```

**Dashboard updates** support `project_id`:
```typescript
PUT /dashboards/:id
{
  "project_id": "new-project-id"  // Can move to different project
}
```

## Example API Usage

### Create a Project
```bash
curl -X POST http://localhost:4000/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Project",
    "slug": "my-project",
    "description": "Project description",
    "accent_color": "#3b82f6"
  }'
```

### Get All Projects
```bash
curl http://localhost:4000/projects
```

### Get Dashboards in a Project
```bash
curl http://localhost:4000/projects/{project-id}/dashboards
```

### Add Logo to Dashboard
```bash
curl -X POST http://localhost:4000/dashboards/{dashboard-id}/logos \
  -H "Content-Type: application/json" \
  -d '{
    "logo_url": "https://example.com/logo.png",
    "label": "Main Logo",
    "position": 0
  }'
```

## What's NOT Implemented (Phase 2)

The following items are **NOT** included in Phase 1:

1. **UI Components** - No React components for project management
2. **Project Selector** - No dropdown/picker in the UI
3. **Dashboard Organization UI** - No project-based filtering in UI
4. **Project Settings Page** - No UI for editing projects
5. **Logo Management UI** - No UI for dashboard logos
6. **Navigation Changes** - UI still uses old app_scope navigation

## Next Steps (Phase 2)

1. **Create UI Components**
   - ProjectSelector component
   - ProjectList component
   - ProjectForm (create/edit)
   - DashboardLogoManager component

2. **Update Navigation**
   - Replace app_scope dropdown with project selector
   - Add project filtering to dashboard list
   - Add project sidebar/navigation

3. **Dashboard UI Updates**
   - Show project in dashboard header
   - Add logo display to dashboard view
   - Add "Move to project" action

4. **Settings Page**
   - Project management page
   - CRUD operations for projects
   - Drag-and-drop logo management

## Testing

### Database Functions
All database functions tested and working:
```
✓ getProjects()
✓ getProject(id)
✓ createProject()
✓ updateProject()
✓ getDashboardsByProject()
✓ addDashboardLogo()
✓ getDashboardLogos()
```

### Build Status
```
npm run build - ✅ SUCCESS
No TypeScript errors
```

### Migration Status
```
Migration script - ✅ SUCCESS
12/12 dashboards migrated
3 projects created
```

## Files Modified/Created

### Modified
- `api/src/db/sqlite.ts` - Added schema, interfaces, functions
- `api/src/routes/dashboards.ts` - Added logo routes, project_id support
- `api/src/index.ts` - Registered projects router

### Created
- `api/src/routes/projects.ts` - Projects API routes
- `api/scripts/migrate-to-projects.ts` - Migration script
- `api/scripts/test-projects-api.ts` - Test script
- `PROJECTS_PHASE1_IMPLEMENTATION.md` - This document

## Backward Compatibility

- ✅ `app_scope` field still exists on dashboards
- ✅ Existing APIs continue to work
- ✅ `project_id` is optional (NULL allowed)
- ✅ Migration is idempotent (can run multiple times safely)

## Important Notes

1. **Slug must be unique** - Enforced at database level
2. **Project name must be unique** - Enforced at database level
3. **Archived projects** are filtered out of `getProjects()` by default
4. **Dashboard logos** support up to 4 positions (0-3)
5. **Provenance tracking** on panels enables future copy/template features

## Code Quality

- ✅ Follows existing LogNog code patterns
- ✅ TypeScript types for all interfaces
- ✅ Error handling in API routes
- ✅ Proper foreign key constraints
- ✅ Indexed columns for performance
- ✅ Transaction-safe migrations

---

**Implementation Date:** 2026-01-23
**Developer:** Claude (Code Quality Officer)
**Status:** Backend Complete, UI Pending
