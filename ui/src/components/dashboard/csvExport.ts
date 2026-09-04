/**
 * Client-side CSV export for a panel's result rows. Includes a CSV-injection
 * guard (leading =,+,-,@ are neutralised) so a value can't execute as a formula
 * when the file is opened in a spreadsheet.
 */

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // CSV-injection guard
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (!rows || rows.length === 0) return '';
  const columns = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((k) => set.add(k));
      return set;
    }, new Set<string>()),
  );
  const header = columns.map(escapeCell).join(',');
  const body = rows.map((row) => columns.map((c) => escapeCell(row[c])).join(',')).join('\r\n');
  return `${header}\r\n${body}`;
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]): void {
  const csv = rowsToCsv(rows);
  // BOM so Excel reads UTF-8 correctly.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(filename || 'panel').replace(/[^\w.-]+/g, '_')}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
