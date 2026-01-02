/**
 * Anomaly Detection API Routes
 *
 * Endpoints for UEBA (User and Entity Behavior Analytics) functionality.
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/middleware.js';
import {
  // Baseline operations
  calculateBaseline,
  storeBaselines,
  getBaseline,
  discoverEntities,
  calculateAllBaselines,
  EntityType,

  // Anomaly detection
  AnomalyType,
  Severity,
  detectStatisticalAnomalies,
  detectTimeAnomalies,
  detectNewBehavior,
  getAnomalies,
  getAnomalyById,
  storeAnomaly,
  submitFeedback,
  getAnomalyDashboard,
  runDetection,

  // LLM analysis
  analyzeAnomaly,
  updateAnomalyWithAnalysis,
  isLLMAvailable,
} from '../services/anomaly/index.js';

const router = Router();

// ============================================================================
// BASELINE ENDPOINTS
// ============================================================================

/**
 * POST /api/anomaly/baselines/calculate
 * Trigger baseline calculation for all entities or specific entity
 */
router.post('/baselines/calculate', authenticate, async (req: Request, res: Response) => {
  try {
    const { entityType, entityId, metricName, config } = req.body;

    if (entityId && entityType && metricName) {
      // Calculate baseline for specific entity
      const baselines = await calculateBaseline(
        entityType as EntityType,
        entityId,
        metricName,
        config
      );

      if (baselines.length > 0) {
        await storeBaselines(baselines);
      }

      return res.json({
        message: `Calculated ${baselines.length} baseline entries`,
        entity: { type: entityType, id: entityId, metric: metricName },
        baselines,
      });
    }

    // Calculate baselines for all entities of a type
    const entityTypes: EntityType[] = entityType
      ? [entityType as EntityType]
      : ['host', 'user', 'app'];

    const metricNames = metricName ? [metricName] : ['event_count', 'error_count'];

    let totalProcessed = 0;
    let totalErrors = 0;

    for (const et of entityTypes) {
      const result = await calculateAllBaselines(et, metricNames, config);
      totalProcessed += result.processed;
      totalErrors += result.errors;
    }

    return res.json({
      message: 'Baseline calculation completed',
      processed: totalProcessed,
      errors: totalErrors,
      entityTypes,
      metricNames,
    });
  } catch (error) {
    console.error('Error calculating baselines:', error);
    return res.status(500).json({ error: 'Failed to calculate baselines' });
  }
});

/**
 * GET /api/anomaly/baselines/:entityType/:entityId
 * Get baselines for a specific entity
 */
router.get('/baselines/:entityType/:entityId', authenticate, async (req: Request, res: Response) => {
  try {
    const { entityType, entityId } = req.params;
    const { metricName, hourOfDay, dayOfWeek } = req.query;

    const baselines = await getBaseline(
      entityType as EntityType,
      entityId,
      metricName as string || 'event_count',
      hourOfDay !== undefined ? Number(hourOfDay) : undefined,
      dayOfWeek !== undefined ? Number(dayOfWeek) : undefined
    );

    return res.json({
      entity: { type: entityType, id: entityId },
      baselines,
      count: baselines.length,
    });
  } catch (error) {
    console.error('Error getting baselines:', error);
    return res.status(500).json({ error: 'Failed to get baselines' });
  }
});

/**
 * GET /api/anomaly/entities/:entityType
 * Discover entities of a given type
 */
router.get('/entities/:entityType', authenticate, async (req: Request, res: Response) => {
  try {
    const { entityType } = req.params;
    const { lookbackDays } = req.query;

    const entities = await discoverEntities(
      entityType as EntityType,
      lookbackDays ? Number(lookbackDays) : 7
    );

    return res.json({
      entityType,
      entities,
      count: entities.length,
    });
  } catch (error) {
    console.error('Error discovering entities:', error);
    return res.status(500).json({ error: 'Failed to discover entities' });
  }
});

// ============================================================================
// DETECTION ENDPOINTS
// ============================================================================

/**
 * POST /api/anomaly/detect
 * Run anomaly detection
 */
router.post('/detect', authenticate, async (req: Request, res: Response) => {
  try {
    const { entityTypes, metricNames, config } = req.body;

    const result = await runDetection(
      entityTypes || ['host', 'user', 'app'],
      metricNames || ['event_count', 'error_count'],
      config
    );

    return res.json({
      message: 'Detection completed',
      detected: result.detected,
      stored: result.stored,
      errors: result.errors,
    });
  } catch (error) {
    console.error('Error running detection:', error);
    return res.status(500).json({ error: 'Failed to run detection' });
  }
});

/**
 * POST /api/anomaly/detect/entity
 * Run detection for a specific entity
 */
router.post('/detect/entity', authenticate, async (req: Request, res: Response) => {
  try {
    const { entityType, entityId, metricName, currentValue, timestamp, config } = req.body;

    if (!entityType || !entityId || currentValue === undefined) {
      return res.status(400).json({
        error: 'entityType, entityId, and currentValue are required',
      });
    }

    const ts = timestamp ? new Date(timestamp) : new Date();

    // Run all detection types
    const [statisticalAnomalies, timeAnomalies, newBehavior] = await Promise.all([
      detectStatisticalAnomalies(
        entityType as EntityType,
        entityId,
        metricName || 'event_count',
        currentValue,
        ts,
        config
      ),
      detectTimeAnomalies(entityType as EntityType, entityId, ts, config),
      detectNewBehavior(entityType as EntityType, entityId, ts, config),
    ]);

    const allAnomalies = [...statisticalAnomalies, ...timeAnomalies, ...newBehavior];

    // Store detected anomalies
    const storedIds: string[] = [];
    for (const anomaly of allAnomalies) {
      const id = await storeAnomaly(anomaly);
      storedIds.push(id);
    }

    return res.json({
      entity: { type: entityType, id: entityId },
      anomalies: allAnomalies,
      storedIds,
      count: allAnomalies.length,
    });
  } catch (error) {
    console.error('Error detecting anomalies for entity:', error);
    return res.status(500).json({ error: 'Failed to detect anomalies' });
  }
});

// ============================================================================
// ANOMALY EVENT ENDPOINTS
// ============================================================================

/**
 * GET /api/anomaly/events
 * List anomaly events with filtering
 */
router.get('/events', authenticate, async (req: Request, res: Response) => {
  try {
    const {
      entityType,
      entityId,
      anomalyType,
      severity,
      minRiskScore,
      startTime,
      endTime,
      limit,
      offset,
    } = req.query;

    const anomalies = await getAnomalies({
      entityType: entityType as EntityType | undefined,
      entityId: entityId as string | undefined,
      anomalyType: anomalyType as AnomalyType | undefined,
      severity: severity as Severity | undefined,
      minRiskScore: minRiskScore ? Number(minRiskScore) : undefined,
      startTime: startTime ? new Date(startTime as string) : undefined,
      endTime: endTime ? new Date(endTime as string) : undefined,
      limit: limit ? Number(limit) : 100,
      offset: offset ? Number(offset) : 0,
    });

    return res.json({
      anomalies,
      count: anomalies.length,
    });
  } catch (error) {
    console.error('Error getting anomalies:', error);
    return res.status(500).json({ error: 'Failed to get anomalies' });
  }
});

/**
 * GET /api/anomaly/events/:id
 * Get a specific anomaly event
 */
router.get('/events/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { analyze } = req.query;

    const anomaly = await getAnomalyById(id);

    if (!anomaly) {
      return res.status(404).json({ error: 'Anomaly not found' });
    }

    // Optionally run LLM analysis
    if (analyze === 'true') {
      const llmStatus = await isLLMAvailable();

      if (llmStatus.available) {
        const analysis = await analyzeAnomaly(anomaly);
        await updateAnomalyWithAnalysis(id, analysis);

        return res.json({
          anomaly: {
            ...anomaly,
            llmAnalysis: analysis,
          },
          analyzed: true,
          provider: llmStatus.provider,
        });
      }
    }

    return res.json({ anomaly });
  } catch (error) {
    console.error('Error getting anomaly:', error);
    return res.status(500).json({ error: 'Failed to get anomaly' });
  }
});

/**
 * POST /api/anomaly/feedback
 * Submit feedback on an anomaly (true/false positive)
 */
router.post('/feedback', authenticate, async (req: Request, res: Response) => {
  try {
    const { id, isFalsePositive } = req.body;

    if (!id || isFalsePositive === undefined) {
      return res.status(400).json({ error: 'id and isFalsePositive are required' });
    }

    await submitFeedback(id, isFalsePositive);

    return res.json({
      message: 'Feedback submitted',
      id,
      isFalsePositive,
    });
  } catch (error) {
    console.error('Error submitting feedback:', error);
    return res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

// ============================================================================
// DASHBOARD ENDPOINTS
// ============================================================================

/**
 * GET /api/anomaly/dashboard
 * Get anomaly dashboard summary
 */
router.get('/dashboard', authenticate, async (req: Request, res: Response) => {
  try {
    const { hoursBack } = req.query;

    const dashboard = await getAnomalyDashboard(
      hoursBack ? Number(hoursBack) : 24
    );

    return res.json(dashboard);
  } catch (error) {
    console.error('Error getting dashboard:', error);
    return res.status(500).json({ error: 'Failed to get dashboard' });
  }
});

// ============================================================================
// LLM ANALYSIS ENDPOINTS
// ============================================================================

/**
 * GET /api/anomaly/llm/status
 * Check LLM availability
 */
router.get('/llm/status', authenticate, async (_req: Request, res: Response) => {
  try {
    const status = await isLLMAvailable();
    return res.json(status);
  } catch (error) {
    console.error('Error checking LLM status:', error);
    return res.status(500).json({ error: 'Failed to check LLM status' });
  }
});

/**
 * POST /api/anomaly/analyze/:id
 * Analyze a specific anomaly with LLM
 */
router.post('/analyze/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const anomaly = await getAnomalyById(id);

    if (!anomaly) {
      return res.status(404).json({ error: 'Anomaly not found' });
    }

    const llmStatus = await isLLMAvailable();

    if (!llmStatus.available) {
      return res.status(503).json({
        error: 'LLM not available',
        message: 'Configure Ollama or set OPENROUTER_API_KEY',
      });
    }

    const analysis = await analyzeAnomaly(anomaly);
    await updateAnomalyWithAnalysis(id, analysis);

    return res.json({
      anomalyId: id,
      analysis,
      provider: llmStatus.provider,
    });
  } catch (error) {
    console.error('Error analyzing anomaly:', error);
    return res.status(500).json({ error: 'Failed to analyze anomaly' });
  }
});

export default router;
