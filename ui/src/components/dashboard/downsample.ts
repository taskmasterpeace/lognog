/**
 * Largest-Triangle-Three-Buckets (LTTB) downsampling for time-series charts.
 * A timechart over a long range at a fine span can return thousands of points;
 * drawing them all is slow and adds no visual detail past screen resolution.
 * LTTB reduces the point count while preserving the visual shape (peaks/troughs),
 * far better than naive every-Nth sampling.
 */

interface XY {
  x: number;
  y: number;
  row: Record<string, unknown>;
}

function lttb(data: XY[], threshold: number): XY[] {
  const n = data.length;
  if (threshold >= n || threshold <= 2) return data;

  const sampled: XY[] = [data[0]];
  const bucketSize = (n - 2) / (threshold - 2);
  let a = 0;

  for (let i = 0; i < threshold - 2; i++) {
    // Average point of the NEXT bucket.
    const avgStart = Math.floor((i + 1) * bucketSize) + 1;
    const avgEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, n);
    const avgLen = Math.max(1, avgEnd - avgStart);
    let avgX = 0;
    let avgY = 0;
    for (let j = avgStart; j < avgEnd; j++) {
      avgX += data[j].x;
      avgY += data[j].y;
    }
    avgX /= avgLen;
    avgY /= avgLen;

    // Pick the point in THIS bucket forming the largest triangle with a and avg.
    const rangeStart = Math.floor(i * bucketSize) + 1;
    const rangeEnd = Math.floor((i + 1) * bucketSize) + 1;
    const pa = data[a];
    let maxArea = -1;
    let next = rangeStart;
    for (let j = rangeStart; j < rangeEnd; j++) {
      const area = Math.abs((pa.x - avgX) * (data[j].y - pa.y) - (pa.x - data[j].x) * (avgY - pa.y)) / 2;
      if (area > maxArea) {
        maxArea = area;
        next = j;
      }
    }
    sampled.push(data[next]);
    a = next;
  }

  sampled.push(data[n - 1]);
  return sampled;
}

/**
 * Downsample chart rows to at most `maxPoints`, keeping full rows (all series
 * columns) so multi-series charts stay aligned. Returns the input unchanged when
 * it's already small enough or the x column isn't time-like.
 */
export function downsampleRows(
  rows: Record<string, unknown>[],
  xKey: string,
  yKey: string | undefined,
  maxPoints = 800,
): Record<string, unknown>[] {
  if (!yKey || rows.length <= maxPoints) return rows;
  const points: XY[] = rows.map((row, idx) => {
    const t = new Date(String(row[xKey]).replace(' ', 'T')).getTime();
    return { x: Number.isNaN(t) ? idx : t, y: Number(row[yKey]) || 0, row };
  });
  return lttb(points, maxPoints).map((p) => p.row);
}
