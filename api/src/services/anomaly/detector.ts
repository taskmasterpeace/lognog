/**
 * Anomaly Detector Service
 *
 * Detects anomalous behavior by comparing current values against
 * established baselines using statistical methods.
 *
 * Supports multiple anomaly types:
 * - Spike: Value significantly above baseline
 * - Drop: Value significantly below baseline
 * - Time anomaly: Activity at unusual hours
 * - New behavior: Entity seen for first time
 */

import { executeQuery } from '../../db/clickhouse.js';
import {
  EntityType,
  getBaseline,
  getExpectedValue,
  calculateDeviationScore,
} from './baseline-calculator.js';

// Types
export type AnomalyType = 'spike' | 'drop' | 'time_anomaly' | 'new_behavior' | 'peer_anomaly';
export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface AnomalyEvent {
  id?: string;
  timestamp: Date;
  entityType: EntityType;
  entityId: string;
  anomalyType: AnomalyType;
  metricName: string;
  observedValue: number;
  expectedValue: number;
  deviationScore: number;
  severity: Severity;
  riskScore: number;
  relatedLogs: string[];
  contextData: Record<string, unknown>;
}

export interface DetectionConfig {
  // Thresholds for deviation scores (z-scores)
  spikeThreshold: number;     // Default: 3.0 (3 std devs above)
  dropThreshold: number;      // Default: -3.0 (3 std devs below)
  criticalThreshold: number;  // Default: 5.0 (5 std devs)

  // Time-based detection
  offHoursStart: number;      // Default: 22 (10 PM)
  offHoursEnd: number;        // Default: 6 (6 AM)

  // Sample size requirements
  minSamples: number;         // Default: 5

  // Related logs to fetch
  relatedLogsLimit: number;   // Default: 10
}

const DEFAULT_CONFIG: DetectionConfig = {
  spikeThreshold: 3.0,
  dropThreshold: -3.0,
  criticalThreshold: 5.0,
  offHoursStart: 22,
  offHoursEnd: 6,
  minSamples: 5,
  relatedLogsLimit: 10,
};

/**
 * Calculate risk score (0-100) based on deviation and context
 */
export function calculateRiskScore(
  deviationScore: number,
  anomalyType: AnomalyType,
  entityType: EntityType
): number {
  // Base score from deviation (0-60)
  const absDeviation = Math.abs(deviationScore);
  let baseScore = Math.min(60, absDeviation * 15);

  // Adjust based on anomaly type (0-20)
  const typeMultiplier: Record<AnomalyType, number> = {
    spike: 1.0,
    drop: 0.8,
    time_anomaly: 1.2,
    new_behavior: 0.6,
    peer_anomaly: 1.1,
  };
  baseScore *= typeMultiplier[anomalyType];

  // Adjust based on entity type (0-20)
  const entityMultiplier: Record<EntityType, number> = {
    user: 1.2,      // User anomalies are more concerning
    host: 1.0,
    ip: 1.1,
    app: 0.9,
  };
  baseScore *= entityMultiplier[entityType];

  // Cap at 100
  return Math.min(100, Math.round(baseScore));
}

/**
 * Determine severity based on risk score
 */
export function determineSeverity(riskScore: number): Severity {
  if (riskScore >= 80) return 'critical';
  if (riskScore >= 60) return 'high';
  if (riskScore >= 40) return 'medium';
  return 'low';
}

/**
 * Map entity type to log field for queries
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
 * Fetch related logs for context
 */
async function getRelatedLogs(
  entityType: EntityType,
  entityId: string,
  timestamp: Date,
  limit: number
): Promise<string[]> {
  const entityField = getEntityField(entityType);
  const windowStart = new Date(timestamp.getTime() - 60 * 60 * 1000); // 1 hour before

  const query = `
    SELECT message
    FROM lognog.logs
    WHERE ${entityField} = '${entityId}'
      AND timestamp >= parseDateTimeBestEffort('${windowStart.toISOString()}')
      AND timestamp <= parseDateTimeBestEffort('${timestamp.toISOString()}')
    ORDER BY timestamp DESC
    LIMIT ${limit}
  `;

  const results = await executeQuery<{ message: string }>(query);
  return results.map(r => r.message);
}

/**
 * Detect statistical anomalies for an entity
 */
export async function detectStatisticalAnomalies(
  entityType: EntityType,
  entityId: string,
  metricName: string,
  currentValue: number,
  timestamp: Date = new Date(),
  config: Partial<DetectionConfig> = {}
): Promise<AnomalyEvent[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const anomalies: AnomalyEvent[] = [];

  // Get expected value from baseline
  const expected = await getExpectedValue(entityType, entityId, metricName, timestamp);

  if (!expected) {
    // No baseline exists - could be new behavior
    return [];
  }

  // Calculate deviation score (z-score)
  const deviationScore = calculateDeviationScore(currentValue, expected.expected, expected.stdDev);

  // Check for spike
  if (deviationScore >= cfg.spikeThreshold) {
    const riskScore = calculateRiskScore(deviationScore, 'spike', entityType);
    const relatedLogs = await getRelatedLogs(entityType, entityId, timestamp, cfg.relatedLogsLimit);

    anomalies.push({
      timestamp,
      entityType,
      entityId,
      anomalyType: 'spike',
      metricName,
      observedValue: currentValue,
      expectedValue: expected.expected,
      deviationScore,
      severity: determineSeverity(riskScore),
      riskScore,
      relatedLogs,
      contextData: {
        stdDev: expected.stdDev,
        threshold: cfg.spikeThreshold,
      },
    });
  }

  // Check for drop
  if (deviationScore <= cfg.dropThreshold) {
    const riskScore = calculateRiskScore(deviationScore, 'drop', entityType);
    const relatedLogs = await getRelatedLogs(entityType, entityId, timestamp, cfg.relatedLogsLimit);

    anomalies.push({
      timestamp,
      entityType,
      entityId,
      anomalyType: 'drop',
      metricName,
      observedValue: currentValue,
      expectedValue: expected.expected,
      deviationScore,
      severity: determineSeverity(riskScore),
      riskScore,
      relatedLogs,
      contextData: {
        stdDev: expected.stdDev,
        threshold: cfg.dropThreshold,
      },
    });
  }

  return anomalies;
}

/**
 * Detect time-based anomalies (activity at unusual hours)
 */
export async function detectTimeAnomalies(
  entityType: EntityType,
  entityId: string,
  timestamp: Date = new Date(),
  config: Partial<DetectionConfig> = {}
): Promise<AnomalyEvent[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const anomalies: AnomalyEvent[] = [];

  const hour = timestamp.getHours();
  const isOffHours = hour >= cfg.offHoursStart || hour < cfg.offHoursEnd;

  if (!isOffHours) {
    return [];
  }

  // Check if entity normally has activity at this hour
  const dayOfWeek = timestamp.getDay();
  const baselines = await getBaseline(entityType, entityId, 'event_count', hour, dayOfWeek);

  if (baselines.length > 0 && baselines[0].sampleCount >= cfg.minSamples) {
    // Entity has normal activity at this time
    return [];
  }

  // Get current activity count for this hour
  const entityField = getEntityField(entityType);
  const hourStart = new Date(timestamp);
  hourStart.setMinutes(0, 0, 0);

  const query = `
    SELECT count() as count
    FROM lognog.logs
    WHERE ${entityField} = '${entityId}'
      AND timestamp >= parseDateTimeBestEffort('${hourStart.toISOString()}')
  `;

  const results = await executeQuery<{ count: number }>(query);
  const currentCount = results[0]?.count || 0;

  if (currentCount > 0) {
    const riskScore = calculateRiskScore(2.5, 'time_anomaly', entityType);
    const relatedLogs = await getRelatedLogs(entityType, entityId, timestamp, cfg.relatedLogsLimit);

    anomalies.push({
      timestamp,
      entityType,
      entityId,
      anomalyType: 'time_anomaly',
      metricName: 'activity_hour',
      observedValue: currentCount,
      expectedValue: 0,
      deviationScore: 2.5, // Moderate deviation for time anomaly
      severity: determineSeverity(riskScore),
      riskScore,
      relatedLogs,
      contextData: {
        hour,
        isOffHours: true,
        offHoursRange: `${cfg.offHoursStart}:00 - ${cfg.offHoursEnd}:00`,
      },
    });
  }

  return anomalies;
}

/**
 * Detect new entity behavior (first time seen)
 */
export async function detectNewBehavior(
  entityType: EntityType,
  entityId: string,
  timestamp: Date = new Date(),
  config: Partial<DetectionConfig> = {}
): Promise<AnomalyEvent[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const entityField = getEntityField(entityType);

  // Check if entity has any historical data
  const query = `
    SELECT
      min(timestamp) as first_seen,
      count() as total_events
    FROM lognog.logs
    WHERE ${entityField} = '${entityId}'
  `;

  const results = await executeQuery<{ first_seen: string; total_events: number }>(query);

  if (!results[0] || results[0].total_events === 0) {
    return [];
  }

  const firstSeen = new Date(results[0].first_seen);
  const hoursSinceFirstSeen = (timestamp.getTime() - firstSeen.getTime()) / (1000 * 60 * 60);

  // If entity was first seen less than 24 hours ago, it's new
  if (hoursSinceFirstSeen < 24) {
    const riskScore = calculateRiskScore(1.5, 'new_behavior', entityType);
    const relatedLogs = await getRelatedLogs(entityType, entityId, timestamp, cfg.relatedLogsLimit);

    return [{
      timestamp,
      entityType,
      entityId,
      anomalyType: 'new_behavior',
      metricName: 'first_occurrence',
      observedValue: 1,
      expectedValue: 0,
      deviationScore: 1.5,
      severity: determineSeverity(riskScore),
      riskScore,
      relatedLogs,
      contextData: {
        firstSeen: firstSeen.toISOString(),
        hoursSinceFirstSeen,
        totalEvents: results[0].total_events,
      },
    }];
  }

  return [];
}

/**
 * Store anomaly event in ClickHouse
 */
export async function storeAnomaly(anomaly: AnomalyEvent): Promise<string> {
  const id = crypto.randomUUID();

  const query = `
    INSERT INTO lognog.anomalies
    (id, timestamp, entity_type, entity_id, anomaly_type, metric_name,
     observed_value, expected_value, deviation_score, risk_score, severity,
     related_logs, context_data)
    VALUES (
      '${id}',
      parseDateTimeBestEffort('${anomaly.timestamp.toISOString()}'),
      '${anomaly.entityType}',
      '${anomaly.entityId}',
      '${anomaly.anomalyType}',
      '${anomaly.metricName}',
      ${anomaly.observedValue},
      ${anomaly.expectedValue},
      ${anomaly.deviationScore},
      ${anomaly.riskScore},
      '${anomaly.severity}',
      [${anomaly.relatedLogs.map(l => `'${l.replace(/'/g, "''").substring(0, 500)}'`).join(',')}],
      '${JSON.stringify(anomaly.contextData).replace(/'/g, "''")}'
    )
  `;

  await executeQuery(query);
  return id;
}

/**
 * Get anomaly events with filtering
 */
export async function getAnomalies(options: {
  entityType?: EntityType;
  entityId?: string;
  anomalyType?: AnomalyType;
  severity?: Severity;
  minRiskScore?: number;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
}): Promise<AnomalyEvent[]> {
  const conditions: string[] = [];

  if (options.entityType) {
    conditions.push(`entity_type = '${options.entityType}'`);
  }
  if (options.entityId) {
    conditions.push(`entity_id = '${options.entityId}'`);
  }
  if (options.anomalyType) {
    conditions.push(`anomaly_type = '${options.anomalyType}'`);
  }
  if (options.severity) {
    conditions.push(`severity = '${options.severity}'`);
  }
  if (options.minRiskScore !== undefined) {
    conditions.push(`risk_score >= ${options.minRiskScore}`);
  }
  if (options.startTime) {
    conditions.push(`timestamp >= parseDateTimeBestEffort('${options.startTime.toISOString()}')`);
  }
  if (options.endTime) {
    conditions.push(`timestamp <= parseDateTimeBestEffort('${options.endTime.toISOString()}')`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = options.limit || 100;
  const offset = options.offset || 0;

  const query = `
    SELECT
      id,
      timestamp,
      entity_type,
      entity_id,
      anomaly_type,
      metric_name,
      observed_value,
      expected_value,
      deviation_score,
      risk_score,
      severity,
      llm_analysis,
      related_logs,
      context_data
    FROM lognog.anomalies
    ${whereClause}
    ORDER BY timestamp DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  const results = await executeQuery<{
    id: string;
    timestamp: string;
    entity_type: string;
    entity_id: string;
    anomaly_type: string;
    metric_name: string;
    observed_value: number;
    expected_value: number;
    deviation_score: number;
    risk_score: number;
    severity: string;
    llm_analysis: string;
    related_logs: string[];
    context_data: string;
  }>(query);

  return results.map(r => ({
    id: r.id,
    timestamp: new Date(r.timestamp),
    entityType: r.entity_type as EntityType,
    entityId: r.entity_id,
    anomalyType: r.anomaly_type as AnomalyType,
    metricName: r.metric_name,
    observedValue: r.observed_value,
    expectedValue: r.expected_value,
    deviationScore: r.deviation_score,
    riskScore: r.risk_score,
    severity: r.severity as Severity,
    relatedLogs: r.related_logs || [],
    contextData: r.context_data ? JSON.parse(r.context_data) : {},
  }));
}

/**
 * Get anomaly by ID
 */
export async function getAnomalyById(id: string): Promise<AnomalyEvent | null> {
  const anomalies = await getAnomalies({ limit: 1 });
  // This is a simplified version - in production we'd query by ID directly
  const query = `
    SELECT *
    FROM lognog.anomalies
    WHERE id = '${id}'
    LIMIT 1
  `;

  const results = await executeQuery<{
    id: string;
    timestamp: string;
    entity_type: string;
    entity_id: string;
    anomaly_type: string;
    metric_name: string;
    observed_value: number;
    expected_value: number;
    deviation_score: number;
    risk_score: number;
    severity: string;
    llm_analysis: string;
    related_logs: string[];
    context_data: string;
  }>(query);

  if (results.length === 0) return null;

  const r = results[0];
  return {
    id: r.id,
    timestamp: new Date(r.timestamp),
    entityType: r.entity_type as EntityType,
    entityId: r.entity_id,
    anomalyType: r.anomaly_type as AnomalyType,
    metricName: r.metric_name,
    observedValue: r.observed_value,
    expectedValue: r.expected_value,
    deviationScore: r.deviation_score,
    riskScore: r.risk_score,
    severity: r.severity as Severity,
    relatedLogs: r.related_logs || [],
    contextData: r.context_data ? JSON.parse(r.context_data) : {},
  };
}

/**
 * Submit user feedback on anomaly (true/false positive)
 */
export async function submitFeedback(id: string, isFalsePositive: boolean): Promise<void> {
  const query = `
    ALTER TABLE lognog.anomalies
    UPDATE
      is_false_positive = ${isFalsePositive ? 1 : 0},
      feedback_at = now()
    WHERE id = '${id}'
  `;

  await executeQuery(query);
}

/**
 * Get anomaly dashboard summary
 */
export async function getAnomalyDashboard(hoursBack: number = 24): Promise<{
  totalAnomalies: number;
  bySeverity: Record<Severity, number>;
  byType: Record<AnomalyType, number>;
  topEntities: { entityType: EntityType; entityId: string; count: number; avgRisk: number }[];
  recentTrend: { hour: string; count: number }[];
}> {
  const startTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  // Total and by severity
  const severityQuery = `
    SELECT
      count() as total,
      countIf(severity = 'low') as low,
      countIf(severity = 'medium') as medium,
      countIf(severity = 'high') as high,
      countIf(severity = 'critical') as critical
    FROM lognog.anomalies
    WHERE timestamp >= parseDateTimeBestEffort('${startTime.toISOString()}')
      AND (is_false_positive IS NULL OR is_false_positive = 0)
  `;

  // By type
  const typeQuery = `
    SELECT
      anomaly_type,
      count() as count
    FROM lognog.anomalies
    WHERE timestamp >= parseDateTimeBestEffort('${startTime.toISOString()}')
      AND (is_false_positive IS NULL OR is_false_positive = 0)
    GROUP BY anomaly_type
  `;

  // Top entities
  const entitiesQuery = `
    SELECT
      entity_type,
      entity_id,
      count() as count,
      avg(risk_score) as avg_risk
    FROM lognog.anomalies
    WHERE timestamp >= parseDateTimeBestEffort('${startTime.toISOString()}')
      AND (is_false_positive IS NULL OR is_false_positive = 0)
    GROUP BY entity_type, entity_id
    ORDER BY count DESC
    LIMIT 10
  `;

  // Hourly trend
  const trendQuery = `
    SELECT
      toStartOfHour(timestamp) as hour,
      count() as count
    FROM lognog.anomalies
    WHERE timestamp >= parseDateTimeBestEffort('${startTime.toISOString()}')
      AND (is_false_positive IS NULL OR is_false_positive = 0)
    GROUP BY hour
    ORDER BY hour
  `;

  const [severityResults, typeResults, entityResults, trendResults] = await Promise.all([
    executeQuery<{ total: number; low: number; medium: number; high: number; critical: number }>(severityQuery),
    executeQuery<{ anomaly_type: string; count: number }>(typeQuery),
    executeQuery<{ entity_type: string; entity_id: string; count: number; avg_risk: number }>(entitiesQuery),
    executeQuery<{ hour: string; count: number }>(trendQuery),
  ]);

  const severity = severityResults[0] || { total: 0, low: 0, medium: 0, high: 0, critical: 0 };

  const byType: Record<string, number> = {};
  for (const r of typeResults) {
    byType[r.anomaly_type] = r.count;
  }

  return {
    totalAnomalies: severity.total,
    bySeverity: {
      low: severity.low,
      medium: severity.medium,
      high: severity.high,
      critical: severity.critical,
    },
    byType: byType as Record<AnomalyType, number>,
    topEntities: entityResults.map(r => ({
      entityType: r.entity_type as EntityType,
      entityId: r.entity_id,
      count: r.count,
      avgRisk: r.avg_risk,
    })),
    recentTrend: trendResults.map(r => ({
      hour: r.hour,
      count: r.count,
    })),
  };
}

/**
 * Run full anomaly detection for all entities
 */
export async function runDetection(
  entityTypes: EntityType[] = ['host', 'user', 'app'],
  metricNames: string[] = ['event_count', 'error_count'],
  config: Partial<DetectionConfig> = {}
): Promise<{ detected: number; stored: number; errors: number }> {
  let detected = 0;
  let stored = 0;
  let errors = 0;

  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  for (const entityType of entityTypes) {
    const entityField = getEntityField(entityType);

    // Get entities with recent activity
    const query = `
      SELECT
        ${entityField} as entity,
        count() as count
      FROM lognog.logs
      WHERE timestamp >= parseDateTimeBestEffort('${hourAgo.toISOString()}')
        AND ${entityField} != ''
      GROUP BY entity
    `;

    const entities = await executeQuery<{ entity: string; count: number }>(query);

    for (const { entity, count } of entities) {
      for (const metricName of metricNames) {
        try {
          // Get current value based on metric
          let currentValue = count;
          if (metricName === 'error_count') {
            const errorQuery = `
              SELECT countIf(severity <= 3) as errors
              FROM lognog.logs
              WHERE ${entityField} = '${entity}'
                AND timestamp >= parseDateTimeBestEffort('${hourAgo.toISOString()}')
            `;
            const errorResults = await executeQuery<{ errors: number }>(errorQuery);
            currentValue = errorResults[0]?.errors || 0;
          }

          // Run detection
          const anomalies = await detectStatisticalAnomalies(
            entityType,
            entity,
            metricName,
            currentValue,
            now,
            config
          );

          detected += anomalies.length;

          // Store anomalies
          for (const anomaly of anomalies) {
            await storeAnomaly(anomaly);
            stored++;
          }
        } catch (error) {
          console.error(`Detection error for ${entityType}/${entity}/${metricName}:`, error);
          errors++;
        }
      }

      // Also check for time anomalies
      try {
        const timeAnomalies = await detectTimeAnomalies(entityType, entity, now, config);
        detected += timeAnomalies.length;
        for (const anomaly of timeAnomalies) {
          await storeAnomaly(anomaly);
          stored++;
        }
      } catch (error) {
        console.error(`Time anomaly detection error for ${entityType}/${entity}:`, error);
        errors++;
      }
    }
  }

  return { detected, stored, errors };
}
