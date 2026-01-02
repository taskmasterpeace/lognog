/**
 * Anomaly Detection Services
 *
 * Provides UEBA (User and Entity Behavior Analytics) capabilities
 * with statistical baseline detection and LLM-powered analysis.
 */

// Baseline Calculator
export {
  EntityType,
  BaselineConfig,
  EntityBaseline,
  BaselineMetric,
  calculateEMA,
  calculateStdDev,
  calculateSMA,
  calculateBaseline,
  storeBaselines,
  getBaseline,
  discoverEntities,
  calculateAllBaselines,
  calculateDeviationScore,
  getExpectedValue,
} from './baseline-calculator.js';

// Anomaly Detector
export {
  AnomalyType,
  Severity,
  AnomalyEvent,
  DetectionConfig,
  calculateRiskScore,
  determineSeverity,
  detectStatisticalAnomalies,
  detectTimeAnomalies,
  detectNewBehavior,
  storeAnomaly,
  getAnomalies,
  getAnomalyById,
  submitFeedback,
  getAnomalyDashboard,
  runDetection,
} from './detector.js';

// LLM Scorer
export {
  LLMAnalysis,
  AnalysisContext,
  analyzeAnomaly,
  batchAnalyzeAnomalies,
  updateAnomalyWithAnalysis,
  isLLMAvailable,
  getThreatTypeDescription,
} from './llm-scorer.js';
