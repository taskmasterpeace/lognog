-- LogNog ClickHouse Schema
-- Optimized for log storage and fast querying

CREATE DATABASE IF NOT EXISTS lognog;

-- Main logs table with columnar storage optimized for time-series queries
CREATE TABLE IF NOT EXISTS lognog.logs
(
    -- Core fields
    timestamp DateTime64(3) DEFAULT now64(3),
    received_at DateTime64(3) DEFAULT now64(3),

    -- Syslog standard fields
    facility UInt8 DEFAULT 1,
    severity UInt8 DEFAULT 6,
    priority UInt16 DEFAULT 14,

    -- Source identification
    hostname LowCardinality(String) DEFAULT '',
    app_name LowCardinality(String) DEFAULT '',
    proc_id String DEFAULT '',
    msg_id String DEFAULT '',

    -- Message content
    message String,
    raw String DEFAULT '',

    -- Structured data (JSON)
    structured_data String DEFAULT '{}',

    -- Parsed fields for common log types
    source_ip IPv4 DEFAULT toIPv4('0.0.0.0'),
    dest_ip IPv4 DEFAULT toIPv4('0.0.0.0'),
    source_port UInt16 DEFAULT 0,
    dest_port UInt16 DEFAULT 0,
    protocol LowCardinality(String) DEFAULT '',
    action LowCardinality(String) DEFAULT '',
    user LowCardinality(String) DEFAULT '',

    -- Indexing helpers
    index_name LowCardinality(String) DEFAULT 'main',

    -- Full-text search
    message_tokens Array(String) DEFAULT []
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, hostname, app_name)
TTL toDateTime(timestamp) + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

-- Materialized view for fast hostname lookups
CREATE MATERIALIZED VIEW IF NOT EXISTS lognog.logs_by_host
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (hostname, toStartOfHour(timestamp))
AS SELECT
    hostname,
    toStartOfHour(timestamp) as hour,
    count() as log_count,
    countIf(severity <= 3) as error_count,
    countIf(severity = 4) as warning_count
FROM lognog.logs
GROUP BY hostname, hour;

-- Materialized view for app statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS lognog.logs_by_app
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (app_name, toStartOfHour(timestamp))
AS SELECT
    app_name,
    toStartOfHour(timestamp) as hour,
    count() as log_count,
    countIf(severity <= 3) as error_count
FROM lognog.logs
GROUP BY app_name, hour;

-- Severity level mapping table
CREATE TABLE IF NOT EXISTS lognog.severity_levels
(
    level UInt8,
    name String,
    color String
)
ENGINE = Memory;

INSERT INTO lognog.severity_levels VALUES
    (0, 'Emergency', '#FF0000'),
    (1, 'Alert', '#FF3300'),
    (2, 'Critical', '#FF6600'),
    (3, 'Error', '#FF9900'),
    (4, 'Warning', '#FFCC00'),
    (5, 'Notice', '#99CC00'),
    (6, 'Informational', '#00CC00'),
    (7, 'Debug', '#0099CC');

-- Facility mapping table
CREATE TABLE IF NOT EXISTS lognog.facility_names
(
    facility UInt8,
    name String
)
ENGINE = Memory;

INSERT INTO lognog.facility_names VALUES
    (0, 'kern'), (1, 'user'), (2, 'mail'), (3, 'daemon'),
    (4, 'auth'), (5, 'syslog'), (6, 'lpr'), (7, 'news'),
    (8, 'uucp'), (9, 'cron'), (10, 'authpriv'), (11, 'ftp'),
    (16, 'local0'), (17, 'local1'), (18, 'local2'), (19, 'local3'),
    (20, 'local4'), (21, 'local5'), (22, 'local6'), (23, 'local7');
