# FacetFilters Integration Guide

Step-by-step guide to integrate FacetFilters into your SearchPage.

## Step 1: Update API Response Type

Add facets to your search API response type:

```typescript
// src/api/client.ts
export interface SearchResult {
  results: any[];
  count: number;
  sql?: string;
  facets?: Facet[];  // Add this
}

export interface Facet {
  field: string;
  values: FacetValue[];
}

export interface FacetValue {
  value: string;
  count: number;
}
```

## Step 2: Update SearchPage State

```typescript
// src/pages/SearchPage.tsx
import FacetFilters, { Facet } from '../components/FacetFilters';

export default function SearchPage() {
  const [query, setQuery] = useState('search *');
  const [timeRange, setTimeRange] = useState('-24h');
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({});  // Add this

  // ... rest of your state
}
```

## Step 3: Modify Search Mutation to Apply Filters

```typescript
const searchMutation = useMutation({
  mutationFn: () => {
    // Build filter clauses from selectedFilters
    const filterClauses: string[] = [];

    Object.entries(selectedFilters).forEach(([field, values]) => {
      if (values.length > 0) {
        if (values.length === 1) {
          filterClauses.push(`${field}=${values[0]}`);
        } else {
          // Multiple values: (field=val1 OR field=val2)
          const orClauses = values.map(v => `${field}=${v}`).join(' OR ');
          filterClauses.push(`(${orClauses})`);
        }
      }
    });

    // Append filters to the base query
    let finalQuery = query;
    if (filterClauses.length > 0) {
      // Insert after 'search' clause
      const filterString = filterClauses.join(' AND ');
      if (query.startsWith('search ')) {
        const searchTerm = query.substring(7);
        finalQuery = `search ${searchTerm} ${filterString}`;
      }
    }

    return executeSearch(finalQuery, timeRange || undefined);
  },
});
```

## Step 4: Update Layout to Include Sidebar

```typescript
return (
  <div className="h-full flex flex-col">
    {/* Header - keep your existing header code */}
    <div className="bg-white border-b border-slate-200 shadow-sm">
      {/* ... your existing header code ... */}
    </div>

    {/* Main Content - Split into sidebar and results */}
    <div className="flex-1 flex overflow-hidden">
      {/* Facet Filters Sidebar */}
      {searchMutation.data?.facets && searchMutation.data.facets.length > 0 && (
        <div className="w-64 flex-shrink-0 overflow-hidden">
          <FacetFilters
            facets={searchMutation.data.facets}
            selectedFilters={selectedFilters}
            onFilterChange={(field, values) => {
              setSelectedFilters(prev => ({
                ...prev,
                [field]: values,
              }));
              // Optionally: auto-trigger search when filters change
              // searchMutation.mutate();
            }}
          />
        </div>
      )}

      {/* Results Area */}
      <div className="flex-1 overflow-auto p-6">
        {/* ... your existing results rendering code ... */}
      </div>
    </div>
  </div>
);
```

## Step 5: Update Backend API (Node.js)

Add facet calculation to your search endpoint:

```typescript
// api/src/routes/search.ts
async function calculateFacets(
  baseQuery: string,
  limit: number = 10
): Promise<Facet[]> {
  const facets: Facet[] = [];
  const fields = ['severity', 'hostname', 'app_name'];

  for (const field of fields) {
    const sql = `
      SELECT ${field} as value, COUNT(*) as count
      FROM logs
      WHERE ${baseQuery}
      GROUP BY ${field}
      ORDER BY count DESC
      LIMIT ${limit}
    `;

    const result = await clickhouse.query(sql);
    const rows = await result.json();

    facets.push({
      field,
      values: rows.data.map((row: any) => ({
        value: String(row.value),
        count: Number(row.count),
      })),
    });
  }

  return facets;
}

// In your search route handler:
router.post('/search', async (req, res) => {
  // ... existing search logic ...

  const results = await executeQuery(sql);
  const facets = await calculateFacets(whereClause);

  res.json({
    results: results.data,
    count: results.count,
    sql: sql,
    facets: facets,  // Add this
  });
});
```

## Step 6: Optimize Facet Queries (ClickHouse)

For better performance, calculate facets in parallel:

```typescript
async function calculateFacets(whereClause: string): Promise<Facet[]> {
  const fields = ['severity', 'hostname', 'app_name'];

  // Execute all facet queries in parallel
  const facetPromises = fields.map(async (field) => {
    const sql = `
      SELECT ${field} as value, COUNT(*) as count
      FROM logs
      WHERE ${whereClause}
      GROUP BY ${field}
      ORDER BY count DESC
      LIMIT 10
    `;

    const result = await clickhouse.query(sql);
    const rows = await result.json();

    return {
      field,
      values: rows.data.map((row: any) => ({
        value: String(row.value),
        count: Number(row.count),
      })),
    };
  });

  return Promise.all(facetPromises);
}
```

## Step 7: Add Auto-Refresh on Filter Change (Optional)

If you want searches to automatically re-run when filters change:

```typescript
// Watch for filter changes and trigger search
useEffect(() => {
  if (Object.keys(selectedFilters).length > 0) {
    searchMutation.mutate();
  }
}, [selectedFilters]);
```

## Step 8: Display Active Filters as Chips (Optional)

Show active filters above results:

```typescript
{Object.entries(selectedFilters).map(([field, values]) => (
  values.length > 0 && (
    <div key={field} className="flex items-center gap-2 flex-wrap">
      <span className="text-sm font-medium text-slate-600">{field}:</span>
      {values.map(value => (
        <span
          key={value}
          className="inline-flex items-center gap-1 px-2 py-1 bg-sky-100 text-sky-700 rounded-full text-xs"
        >
          {value}
          <button
            onClick={() => {
              const newValues = values.filter(v => v !== value);
              setSelectedFilters(prev => ({ ...prev, [field]: newValues }));
            }}
            className="hover:text-sky-900"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
    </div>
  )
))}
```

## Complete Example

See the complete working example in `SearchPage.tsx` with FacetFilters integrated:

```typescript
<div className="flex h-full">
  {/* Sidebar */}
  <div className="w-64">
    <FacetFilters
      facets={searchResults?.facets || []}
      selectedFilters={selectedFilters}
      onFilterChange={setSelectedFilters}
    />
  </div>

  {/* Main */}
  <div className="flex-1">
    {/* Results */}
  </div>
</div>
```

## Performance Tips

1. **Lazy load facets**: Only calculate facets after initial search
2. **Cache facets**: Cache facet results for 30 seconds
3. **Limit values**: Show top 10 values per field (already implemented)
4. **Parallel queries**: Calculate all facets in parallel (shown above)
5. **Index optimization**: Ensure ClickHouse has proper indexes on facet fields

## Keyboard Shortcuts (Future Enhancement)

Consider adding:
- `Ctrl+K` to focus search
- `Ctrl+Shift+C` to clear all filters
- `Escape` to close sidebar
