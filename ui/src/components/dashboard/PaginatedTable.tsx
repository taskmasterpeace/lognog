import { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUp,
  ArrowDown,
  ExternalLink,
} from 'lucide-react';

interface PaginatedTableProps {
  data: Record<string, unknown>[];
  columns?: string[];
  pageSize?: number;
  onRowClick?: (row: Record<string, unknown>) => void;
}

export function PaginatedTable({
  data,
  columns: propColumns,
  pageSize: initialPageSize = 25,
  onRowClick,
}: PaginatedTableProps) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const columns = useMemo(() => {
    if (propColumns && propColumns.length > 0) return propColumns;
    if (data.length === 0) return [];
    return Object.keys(data[0]);
  }, [data, propColumns]);

  const sortedData = useMemo(() => {
    if (!sortColumn) return data;

    return [...data].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];

      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      const comparison =
        typeof aVal === 'number' && typeof bVal === 'number'
          ? aVal - bVal
          : String(aVal).localeCompare(String(bVal));

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data, sortColumn, sortDirection]);

  const paginatedData = useMemo(() => {
    const start = page * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, page, pageSize]);

  const totalPages = Math.ceil(data.length / pageSize);
  const startIndex = page * pageSize + 1;
  const endIndex = Math.min((page + 1) * pageSize, data.length);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
    setPage(0);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(0);
  };

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        No data
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white dark:bg-slate-800 z-10">
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  onClick={() => handleSort(column)}
                  className="text-left p-2 border-b border-slate-200 dark:border-slate-700 font-medium text-slate-600 dark:text-slate-400 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>{column}</span>
                    {sortColumn === column && (
                      sortDirection === 'asc' ? (
                        <ArrowUp className="w-3.5 h-3.5 text-amber-500" />
                      ) : (
                        <ArrowDown className="w-3.5 h-3.5 text-amber-500" />
                      )
                    )}
                  </div>
                </th>
              ))}
              {onRowClick && <th className="w-10" />}
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((row, i) => (
              <tr
                key={i}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                  onRowClick ? 'cursor-pointer' : ''
                }`}
              >
                {columns.map((column) => (
                  <td
                    key={column}
                    className="p-2 border-b border-slate-100 dark:border-slate-700/50 text-slate-700 dark:text-slate-300"
                  >
                    {formatCellValue(row[column])}
                  </td>
                ))}
                {onRowClick && (
                  <td className="p-2 border-b border-slate-100 dark:border-slate-700/50">
                    <ExternalLink className="w-4 h-4 text-slate-400" />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-2 py-2 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <span>Show</span>
          <select
            value={pageSize}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            className="px-2 py-1 border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-sm"
          >
            {[10, 25, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <span>per page</span>
        </div>

        <div className="text-sm text-slate-600 dark:text-slate-400">
          Showing {startIndex}-{endIndex} of {data.length}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(0)}
            disabled={page === 0}
            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title="First page"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1 mx-2">
            {generatePageNumbers(page, totalPages).map((p, i) =>
              p === '...' ? (
                <span key={`ellipsis-${i}`} className="px-2 text-slate-400">
                  ...
                </span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p as number)}
                  className={`px-2.5 py-1 rounded text-sm ${
                    page === p
                      ? 'bg-amber-500 text-white'
                      : 'hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {(p as number) + 1}
                </button>
              )
            )}
          </div>

          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => setPage(totalPages - 1)}
            disabled={page >= totalPages - 1}
            className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Last page"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function generatePageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i);
  }

  const pages: (number | '...')[] = [];

  if (current <= 3) {
    pages.push(0, 1, 2, 3, 4, '...', total - 1);
  } else if (current >= total - 4) {
    pages.push(0, '...', total - 5, total - 4, total - 3, total - 2, total - 1);
  } else {
    pages.push(0, '...', current - 1, current, current + 1, '...', total - 1);
  }

  return pages;
}

export default PaginatedTable;
