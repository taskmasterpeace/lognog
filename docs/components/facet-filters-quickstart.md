# FacetFilters Quick Start

Get up and running with FacetFilters in 5 minutes.

## 1. Import the Component

```tsx
import { FacetFilters, Facet } from './components';
// or
import FacetFilters, { Facet } from './components/FacetFilters';
```

## 2. Add State

```tsx
const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({});
```

## 3. Use the Component

```tsx
<div className="flex h-screen">
  {/* Sidebar */}
  <div className="w-64">
    <FacetFilters
      facets={myFacets}
      selectedFilters={selectedFilters}
      onFilterChange={(field, values) => {
        setSelectedFilters(prev => ({ ...prev, [field]: values }));
      }}
    />
  </div>

  {/* Main Content */}
  <div className="flex-1 p-6">
    {/* Your content here */}
  </div>
</div>
```

## 4. Sample Data

```tsx
const myFacets: Facet[] = [
  {
    field: 'severity',
    values: [
      { value: '0', count: 5 },
      { value: '3', count: 145 },
      { value: '4', count: 342 },
    ],
  },
  {
    field: 'hostname',
    values: [
      { value: 'web-server-01', count: 523 },
      { value: 'web-server-02', count: 498 },
    ],
  },
];
```

## 5. Access Selected Filters

```tsx
// selectedFilters structure:
// {
//   severity: ['0', '3'],
//   hostname: ['web-server-01']
// }

// Use it in your search query:
console.log(selectedFilters.severity);  // ['0', '3']
console.log(selectedFilters.hostname);  // ['web-server-01']
```

## Complete Minimal Example

```tsx
import { useState } from 'react';
import { FacetFilters, Facet } from './components';

export default function MyPage() {
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({});

  const facets: Facet[] = [
    {
      field: 'severity',
      values: [
        { value: '3', count: 145 },
        { value: '4', count: 342 },
      ],
    },
  ];

  return (
    <div className="flex h-screen">
      <div className="w-64">
        <FacetFilters
          facets={facets}
          selectedFilters={selectedFilters}
          onFilterChange={(field, values) => {
            setSelectedFilters(prev => ({ ...prev, [field]: values }));
            console.log(`${field} filters:`, values);
          }}
        />
      </div>
      <div className="flex-1 p-6">
        <pre>{JSON.stringify(selectedFilters, null, 2)}</pre>
      </div>
    </div>
  );
}
```

## That's It!

The component is fully self-contained and requires no additional configuration.

See `FacetFilters.README.md` for full documentation.
See `FacetFilters.INTEGRATION.md` for backend integration.
