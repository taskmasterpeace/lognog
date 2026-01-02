/**
 * Baseline Calculator Service
 *
 * Calculates and maintains statistical baselines for entity behavior
 * using exponential moving averages (EMA) and standard deviation.
 *
 * Used for anomaly detection by establishing "normal" behavior patterns
 * for users, hosts, IPs, and applications.
 */

import { executeQuery } from '../../db/clickhouse.js';

// Types
export type EntityType = 'user' | 'host' | 'ip' | 'app';

export interface BaselineConfig {
  lookbackDays: number;      // How far back to look for baseline calculation (default: 14)
  minSamples: number;        // Minimum samples required for valid baseline (default: 10)
  emaAlpha: number;          // EMA smoothing factor, 0-1 (default: 0.3, higher = more recent weight)
}

export interface EntityBaseline {
  entityType: EntityType;
  entityId: string;
  metricName: string;
  hourOfDay: number;
  dayOfWeek: number;
  avgValue: number;
  stdDev: number;
  minValue: number;
  maxValue: number;
  sampleCount: number;
  lastUpdated: Date;
}

export interface BaselineMetric {
  timestamp: Date;
  value: number;
}

// Default configuration
const DEFAULT_CONFIG: BaselineConfig = {
  lookbackDays: 14,
  minSamples: 10,
  emaAlpha: 0.3,
};

/**
 * Calculate exponential moving average
 * EMA gives more weight to recent values
 */
export function calculateEMA(values: number[], alpha: number = 0.3): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];

  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = alpha * values[i] + (1 - alpha) * ema;
  }
  return ema;
}

/**
 * Calculate standard deviation
 */
export function calculateStdDev(values: number[], mean?: number): number {
  if (values.length < 2) return 0;

  const avg = mean ?? values.reduce((sum, v) => sum + v, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - avg, 2));
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;

  return Math.sqrt(variance);
}

/**
 * Calculate simple moving average
 */
export function calculateSMA(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Get entity metric data from logs for baseline calculation
 */
async function getEntityMetrics(
  entityType: EntityType,
  entityId: string,
  metricName: string,
  lookbackDays: number
): Promise<BaselineMetric[]> {
  const entityField = getEntityField(entityType);

  // Query depends on metric type
  let query: string;

  switch (metricName) {
    case 'event_count':
      query = `
        SELECT
          toStartOfHour(timestamp) as hour,
          count() as value
        FROM lognog.logs
        WHERE ${entityField} = '${entityId}'
          AND timestamp >= now() - INTERVAL ${lookbackDays} DAY
        GROUP BY hour
        ORDER BY hour
      `;
      break;

    case 'error_count':
      query = `
        SELECT
          toStartOfHour(timestamp) as hour,
          countIf(severity <= 3) as value
        FROM lognog.logs
        WHERE ${entityField} = '${entityId}'
          AND timestamp >= now() - INTERVAL ${lookbackDays} DAY
        GROUP BY hour
        ORDER BY hour
      `;
      break;

    case 'bytes_sent':
      query = `
        SELECT
          toStartOfHour(timestamp) as hour,
          sum(toUInt64OrZero(JSONExtractString(structured_data, 'bytes'))) as value
        FROM lognog.logs
        WHERE ${entityField} = '${entityId}'
          AND timestamp >= now() - INTERVAL ${lookbackDays} DAY
        GROUP BY hour
        ORDER BY hour
      `;
      break;

    case 'unique_sources':
      query = `
        SELECT
          toStartOfHour(timestamp) as hour,
          uniq(source_ip) as value
        FROM lognog.logs
        WHERE ${entityField} = '${entityId}'
          AND timestamp >= now() - INTERVAL ${lookbackDays} DAY
        GROUP BY hour
        ORDER BY hour
      `;
      break;

    default:
      // Generic count
      query = `
        SELECT
          toStartOfHour(timestamp) as hour,
          count() as value
        FROM lognog.logs
        WHERE ${entityField} = '${entityId}'
          AND timestamp >= now() - INTERVAL ${lookbackDays} DAY
        GROUP BY hour
        ORDER BY hour
      `;
  }

  const results = await executeQuery<{ hour: string; value: number }>(query);

  return results.map(r => ({
    timestamp: new Date(r.hour),
    value: Number(r.value),
  }));
}

/**
 * Map entity type to log field
 */
function getEntityField(entityType: EntityType): string {
  switch (entityType) {
    case 'user':
      return 'user';
    case 'host':
      return 'hostname';
    case 'ip':
      return 'toString(source_ip)';
    case 'app':
      return 'app_name';
    default:
      return 'hostname';
  }
}

/**
 * Calculate baseline for a specific entity and metric
 */
export async function calculateBaseline(
  entityType: EntityType,
  entityId: string,
  metricName: string,
  config: Partial<BaselineConfig> = {}
): Promise<EntityBaseline[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Get historical metric data
  const metrics = await getEntityMetrics(entityType, entityId, metricName, cfg.lookbackDays);

  if (metrics.length < cfg.minSamples) {
    // Not enough data for baseline
    return [];
  }

  // Group by hour of day and day of week
  const grouped: Map<string, number[]> = new Map();

  for (const m of metrics) {
    const hourOfDay = m.timestamp.getHours();
    const dayOfWeek = m.timestamp.getDay();
    const key = `${hourOfDay}-${dayOfWeek}`;

    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(m.value);
  }

  // Calculate baselines for each time slot
  const baselines: EntityBaseline[] = [];

  for (const [key, values] of grouped) {
    if (values.length < 3) continue; // Need at least 3 samples per time slot

    const [hourOfDay, dayOfWeek] = key.split('-').map(Number);
    const avgValue = calculateEMA(values, cfg.emaAlpha);
    const stdDev = calculateStdDev(values, avgValue);

    baselines.push({
      entityType,
      entityId,
      metricName,
      hourOfDay,
      dayOfWeek,
      avgValue,
      stdDev,
      minValue: Math.min(...values),
      maxValue: Math.max(...values),
      sampleCount: values.length,
      lastUpdated: new Date(),
    });
  }

  return baselines;
}

/**
 * Store baselines in ClickHouse
 */
export async function storeBaselines(baselines: EntityBaseline[]): Promise<void> {
  if (baselines.length === 0) return;

  const values = baselines.map(b => `(
    '${b.entityType}',
    '${b.entityId}',
    '${b.metricName}',
    ${b.hourOfDay},
    ${b.dayOfWeek},
    ${b.avgValue},
    ${b.stdDev},
    ${b.minValue},
    ${b.maxValue},
    ${b.sampleCount},
    now()
  )`).join(',\n');

  const query = `
    INSERT INTO lognog.entity_baselines
    (entity_type, entity_id, metric_name, hour_of_day, day_of_week,
     avg_value, std_dev, min_value, max_value, sample_count, last_updated)
    VALUES ${values}
  `;

  await executeQuery(query);
}

/**
 * Get stored baseline for an entity
 */
export async function getBaseline(
  entityType: EntityType,
  entityId: string,
  metricName: string,
  hourOfDay?: number,
  dayOfWeek?: number
): Promise<EntityBaseline[]> {
  let query = `
    SELECT
      entity_type,
      entity_id,
      metric_name,
      hour_of_day,
      day_of_week,
      avg_value,
      std_dev,
      min_value,
      max_value,
      sample_count,
      last_updated
    FROM lognog.entity_baselines
    WHERE entity_type = '${entityType}'
      AND entity_id = '${entityId}'
      AND metric_name = '${metricName}'
  `;

  if (hourOfDay !== undefined) {
    query += ` AND hour_of_day = ${hourOfDay}`;
  }
  if (dayOfWeek !== undefined) {
    query += ` AND day_of_week = ${dayOfWeek}`;
  }

  query += ' ORDER BY hour_of_day, day_of_week';

  const results = await executeQuery<{
    entity_type: string;
    entity_id: string;
    metric_name: string;
    hour_of_day: number;
    day_of_week: number;
    avg_value: number;
    std_dev: number;
    min_value: number;
    max_value: number;
    sample_count: number;
    last_updated: string;
  }>(query);

  return results.map(r => ({
    entityType: r.entity_type as EntityType,
    entityId: r.entity_id,
    metricName: r.metric_name,
    hourOfDay: r.hour_of_day,
    dayOfWeek: r.day_of_week,
    avgValue: r.avg_value,
    stdDev: r.std_dev,
    minValue: r.min_value,
    maxValue: r.max_value,
    sampleCount: r.sample_count,
    lastUpdated: new Date(r.last_updated),
  }));
}

/**
 * Get all unique entities of a given type from logs
 */
export async function discoverEntities(
  entityType: EntityType,
  lookbackDays: number = 7
): Promise<string[]> {
  const entityField = getEntityField(entityType);

  const query = `
    SELECT DISTINCT ${entityField} as entity
    FROM lognog.logs
    WHERE timestamp >= now() - INTERVAL ${lookbackDays} DAY
      AND ${entityField} != ''
    ORDER BY entity
    LIMIT 1000
  `;

  const results = await executeQuery<{ entity: string }>(query);
  return results.map(r => r.entity);
}

/**
 * Calculate baselines for all entities of a given type
 */
export async function calculateAllBaselines(
  entityType: EntityType,
  metricNames: string[] = ['event_count', 'error_count'],
  config: Partial<BaselineConfig> = {}
): Promise<{ processed: number; errors: number }> {
  const entities = await discoverEntities(entityType, config.lookbackDays || 14);

  let processed = 0;
  let errors = 0;

  for (const entityId of entities) {
    for (const metricName of metricNames) {
      try {
        const baselines = await calculateBaseline(entityType, entityId, metricName, config);
        if (baselines.length > 0) {
          await storeBaselines(baselines);
          processed++;
        }
      } catch (error) {
        console.error(`Failed to calculate baseline for ${entityType}/${entityId}/${metricName}:`, error);
        errors++;
      }
    }
  }

  return { processed, errors };
}

/**
 * Calculate deviation score (z-score)
 * Returns how many standard deviations the value is from the mean
 */
export function calculateDeviationScore(value: number, mean: number, stdDev: number): number {
  if (stdDev === 0) {
    // If no variation, any difference is significant
    return value === mean ? 0 : Math.abs(value - mean) > 0 ? 3 : 0;
  }
  return (value - mean) / stdDev;
}

/**
 * Get expected value for current time
 */
export async function getExpectedValue(
  entityType: EntityType,
  entityId: string,
  metricName: string,
  timestamp: Date = new Date()
): Promise<{ expected: number; stdDev: number } | null> {
  const hourOfDay = timestamp.getHours();
  const dayOfWeek = timestamp.getDay();

  const baselines = await getBaseline(entityType, entityId, metricName, hourOfDay, dayOfWeek);

  if (baselines.length === 0) {
    return null;
  }

  return {
    expected: baselines[0].avgValue,
    stdDev: baselines[0].stdDev,
  };
}
