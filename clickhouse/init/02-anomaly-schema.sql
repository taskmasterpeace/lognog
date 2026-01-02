-- LogNog Anomaly Detection Schema
-- Tables for entity baselines and anomaly events

-- Entity baselines for anomaly detection
-- Stores moving averages and standard deviations for entity metrics
CREATE TABLE IF NOT EXISTS lognog.entity_baselines
(
    -- Entity identification
    entity_type LowCardinality(String),  -- 'user', 'host', 'ip', 'app'
    entity_id String,
    metric_name LowCardinality(String),  -- 'login_count', 'bytes_sent', 'error_rate'

    -- Time-based baselines (for detecting unusual activity at certain times)
    hour_of_day UInt8,      -- 0-23
    day_of_week UInt8,      -- 0-6 (Sunday = 0)

    -- Statistical values
    avg_value Float64,
    std_dev Float64,
    min_value Float64,
    max_value Float64,
    sample_count UInt32,

    -- Metadata
    last_updated DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(last_updated)
PARTITION BY entity_type
ORDER BY (entity_type, entity_id, metric_name, hour_of_day, day_of_week)
SETTINGS index_granularity = 8192;

-- Anomaly events table
-- Stores detected anomalies with risk scores and LLM analysis
CREATE TABLE IF NOT EXISTS lognog.anomalies
(
    -- Primary identification
    id UUID DEFAULT generateUUIDv4(),
    timestamp DateTime DEFAULT now(),

    -- Entity that exhibited anomalous behavior
    entity_type LowCardinality(String),
    entity_id String,

    -- Anomaly details
    anomaly_type LowCardinality(String),  -- 'spike', 'drop', 'new_behavior', 'time_anomaly', 'peer_anomaly'
    metric_name String,

    -- Observed vs expected
    observed_value Float64,
    expected_value Float64,
    deviation_score Float64,  -- Number of standard deviations from mean

    -- Risk assessment
    risk_score UInt8,  -- 0-100
    severity LowCardinality(String),  -- 'low', 'medium', 'high', 'critical'

    -- LLM analysis
    llm_analysis String DEFAULT '',
    suggested_actions Array(String) DEFAULT [],

    -- Related data
    related_logs Array(String) DEFAULT [],  -- Sample log IDs
    context_data String DEFAULT '{}',  -- JSON with additional context

    -- User feedback
    is_false_positive Nullable(UInt8),  -- NULL = no feedback, 0 = true positive, 1 = false positive
    feedback_at Nullable(DateTime),

    -- Indexes for faster queries
    INDEX idx_entity (entity_type, entity_id) TYPE bloom_filter GRANULARITY 4,
    INDEX idx_risk (risk_score) TYPE minmax GRANULARITY 4,
    INDEX idx_anomaly_type (anomaly_type) TYPE set(10) GRANULARITY 4
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, entity_type, entity_id)
TTL toDateTime(timestamp) + INTERVAL 365 DAY
SETTINGS index_granularity = 8192;

-- Materialized view for entity risk aggregation
CREATE MATERIALIZED VIEW IF NOT EXISTS lognog.entity_risk_summary
ENGINE = SummingMergeTree()
PARTITION BY entity_type
ORDER BY (entity_type, entity_id)
AS SELECT
    entity_type,
    entity_id,
    count() as anomaly_count,
    sum(risk_score) as total_risk_score,
    max(risk_score) as max_risk_score,
    max(timestamp) as last_anomaly_at
FROM lognog.anomalies
WHERE is_false_positive IS NULL OR is_false_positive = 0
GROUP BY entity_type, entity_id;

-- Materialized view for hourly anomaly trends
CREATE MATERIALIZED VIEW IF NOT EXISTS lognog.anomaly_trends
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (hour, anomaly_type, severity)
AS SELECT
    toStartOfHour(timestamp) as hour,
    anomaly_type,
    severity,
    count() as anomaly_count,
    avg(risk_score) as avg_risk_score
FROM lognog.anomalies
GROUP BY hour, anomaly_type, severity;
