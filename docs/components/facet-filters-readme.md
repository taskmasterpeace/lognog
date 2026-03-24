# FacetFilters Component

A Splunk-style faceted filter component for quick filtering of search results.

## Features

- **Collapsible Panels**: Each facet field can be expanded/collapsed
- **Checkboxes with Counts**: Shows value counts as badges next to each option
- **Selected Filter Highlighting**: Active filters are highlighted in blue
- **Clear All Button**: Quickly remove all active filters
- **Smart Labels**: Automatically formats severity levels and field names
- **Color-Coded Severity**: Each severity level has its own color scheme
- **Responsive Design**: Optimized for sidebar layouts

## Props

```typescript
interface FacetFiltersProps {
  facets: Facet[];
  selectedFilters: Record<string, string[]>;
  onFilterChange: (field: string, values: string[]) => void;
}

interface Facet {
  field: string;
  values: FacetValue[];
}

interface FacetValue {
  value: string;
  count: number;
}
```

## Usage Example

```tsx
import { useState } from 'react';
import FacetFilters, { Facet } from './components/FacetFilters';

function SearchPage() {
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({});

  // Example facet data (typically from API)
  const facets: Facet[] = [
    {
      field: 'severity',
      values: [
        { value: '0', count: 5 },    // Emergency
        { value: '3', count: 145 },  // Error
        { value: '4', count: 342 },  // Warning
      ],
    },
    {
      field: 'hostname',
      values: [
        { value: 'web-server-01', count: 523 },
        { value: 'web-server-02', count: 498 },
        { value: 'db-server-01', count: 234 },
      ],
    },
  ];

  return (
    <div className="flex h-screen">
      {/* Sidebar with facet filters */}
      <div className="w-64">
        <FacetFilters
          facets={facets}
          selectedFilters={selectedFilters}
          onFilterChange={(field, values) => {
            setSelectedFilters(prev => ({
              ...prev,
              [field]: values,
            }));
          }}
        />
      </div>

      {/* Main content */}
      <div className="flex-1">
        {/* Your search results */}
      </div>
    </div>
  );
}
```

## Integration with SearchPage

1. **Add state for selected filters**:
   ```tsx
   const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({});
   ```

2. **Modify your search API to return facets**:
   The backend should calculate top 10 values per field with counts.

3. **Apply filters to search query**:
   Convert `selectedFilters` to DSL filter clauses before executing search.

   Example:
   ```tsx
   // { severity: ['3', '4'], hostname: ['web-server-01'] }
   // becomes: "severity=3 OR severity=4" AND "hostname=web-server-01"
   ```

4. **Layout**:
   ```tsx
   <div className="flex h-full">
     <div className="w-64">
       <FacetFilters
         facets={searchResults?.facets || []}
         selectedFilters={selectedFilters}
         onFilterChange={setSelectedFilters}
       />
     </div>
     <div className="flex-1">
       {/* Existing search results */}
     </div>
   </div>
   ```

## Supported Fields

The component has built-in labels and formatting for:

- **severity**: Shows "Emergency", "Alert", "Critical", etc. with color coding
- **hostname**: Labeled as "Host"
- **app_name**: Labeled as "App Name"
- **source_ip**: Labeled as "Source IP"
- **facility**: Labeled as "Facility"

Other fields will display as-is with proper capitalization.

## Styling

The component uses TailwindCSS and follows the existing LogNog design system:

- Matches the color scheme (slate grays, sky blues)
- Uses Lucide icons (ChevronDown, ChevronRight, X)
- Responsive and accessible
- Smooth transitions and hover states

## Backend API Example

Your search API should return facets alongside results:

```json
{
  "results": [...],
  "count": 1234,
  "facets": [
    {
      "field": "severity",
      "values": [
        { "value": "3", "count": 145 },
        { "value": "4", "count": 342 }
      ]
    },
    {
      "field": "hostname",
      "values": [
        { "value": "web-server-01", "count": 523 },
        { "value": "web-server-02", "count": 498 }
      ]
    }
  ]
}
```

To calculate facets in ClickHouse:

```sql
-- Get top 10 hostnames with counts
SELECT hostname, COUNT(*) as count
FROM logs
WHERE <your_search_conditions>
GROUP BY hostname
ORDER BY count DESC
LIMIT 10
```
