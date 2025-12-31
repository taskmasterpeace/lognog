/**
 * LogNog Next.js Logger
 *
 * A lightweight TypeScript logger for Next.js applications that sends
 * structured logs to LogNog's /api/ingest/nextjs endpoint.
 *
 * Features:
 * - Batching (100 events or 5 seconds)
 * - Retry with exponential backoff
 * - Zero dependencies
 * - TypeScript support
 */

export interface LoggerConfig {
  endpoint: string;
  apiKey: string;
  batchSize?: number;
  batchIntervalMs?: number;
  retryAttempts?: number;
  sendInDevelopment?: boolean;
  debug?: boolean;
}

export interface ApiCallOptions {
  route: string;
  method: string;
  statusCode: number;
  durationMs: number;
  error?: string;
  requestId?: string;
  integration?: 'replicate' | 'supabase' | 'stripe' | 'openai' | string;
  integrationLatencyMs?: number;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface UserActionOptions {
  name: string;
  component: string;
  page: string;
  metadata?: Record<string, unknown>;
  userId?: string;
  sessionId?: string;
}

export interface PerformanceOptions {
  metric: 'FCP' | 'LCP' | 'TTFB' | 'CLS' | 'FID' | string;
  value: number;
  page: string;
  deviceType?: 'mobile' | 'tablet' | 'desktop';
  userId?: string;
  sessionId?: string;
}

export interface ErrorOptions {
  message: string;
  stack?: string;
  component?: string;
  page?: string;
  userAgent?: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

interface LogEvent {
  timestamp: number;
  type: 'api' | 'action' | 'performance' | 'error';
  environment?: string;
  deployment_id?: string;
  user_id?: string;
  session_id?: string;
  api?: {
    route: string;
    method: string;
    status_code: number;
    duration_ms: number;
    error?: string;
    request_id?: string;
    integration?: string;
    integration_latency_ms?: number;
  };
  action?: {
    name: string;
    component: string;
    page: string;
    metadata?: Record<string, unknown>;
  };
  performance?: {
    metric: string;
    value: number;
    page: string;
    device_type?: string;
  };
  error?: {
    message: string;
    stack?: string;
    component?: string;
    page?: string;
    user_agent?: string;
  };
  metadata?: Record<string, unknown>;
}

export class NextJsLogger {
  private config: Required<LoggerConfig>;
  private queue: LogEvent[] = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private sending = false;
  private environment: string;

  constructor(config: LoggerConfig) {
    this.config = {
      batchSize: 100,
      batchIntervalMs: 5000,
      retryAttempts: 3,
      sendInDevelopment: false,
      debug: false,
      ...config,
    };

    this.environment = typeof process !== 'undefined'
      ? (process.env?.NODE_ENV || 'development')
      : 'browser';

    const shouldSend = this.config.sendInDevelopment || this.environment !== 'development';

    if (shouldSend) {
      this.intervalId = setInterval(() => this.flush(), this.config.batchIntervalMs);
    }
  }

  private enqueue(event: LogEvent): void {
    const shouldSend = this.config.sendInDevelopment || this.environment !== 'development';

    if (!shouldSend) {
      if (this.config.debug) {
        console.log('[LogNog] Skipping (dev mode):', event.type);
      }
      return;
    }

    this.queue.push(event);

    if (this.config.debug) {
      console.log(`[LogNog] Enqueued: ${event.type} (${this.queue.length}/${this.config.batchSize})`);
    }

    if (this.queue.length >= this.config.batchSize) {
      this.flush();
    }
  }

  api(options: ApiCallOptions): void {
    this.enqueue({
      timestamp: Date.now(),
      type: 'api',
      environment: this.environment,
      deployment_id: typeof process !== 'undefined' ? process.env?.VERCEL_DEPLOYMENT_ID : undefined,
      user_id: options.userId,
      session_id: options.sessionId,
      api: {
        route: options.route,
        method: options.method,
        status_code: options.statusCode,
        duration_ms: options.durationMs,
        error: options.error,
        request_id: options.requestId,
        integration: options.integration,
        integration_latency_ms: options.integrationLatencyMs,
      },
      metadata: options.metadata,
    });
  }

  action(options: UserActionOptions): void {
    this.enqueue({
      timestamp: Date.now(),
      type: 'action',
      environment: this.environment,
      deployment_id: typeof process !== 'undefined' ? process.env?.VERCEL_DEPLOYMENT_ID : undefined,
      user_id: options.userId,
      session_id: options.sessionId,
      action: {
        name: options.name,
        component: options.component,
        page: options.page,
        metadata: options.metadata,
      },
    });
  }

  performance(options: PerformanceOptions): void {
    this.enqueue({
      timestamp: Date.now(),
      type: 'performance',
      environment: this.environment,
      deployment_id: typeof process !== 'undefined' ? process.env?.VERCEL_DEPLOYMENT_ID : undefined,
      user_id: options.userId,
      session_id: options.sessionId,
      performance: {
        metric: options.metric,
        value: options.value,
        page: options.page,
        device_type: options.deviceType,
      },
    });
  }

  error(options: ErrorOptions): void {
    this.enqueue({
      timestamp: Date.now(),
      type: 'error',
      environment: this.environment,
      deployment_id: typeof process !== 'undefined' ? process.env?.VERCEL_DEPLOYMENT_ID : undefined,
      user_id: options.userId,
      session_id: options.sessionId,
      error: {
        message: options.message,
        stack: options.stack,
        component: options.component,
        page: options.page,
        user_agent: options.userAgent,
      },
      metadata: options.metadata,
    });
  }

  async flush(): Promise<void> {
    if (this.sending || this.queue.length === 0) return;

    this.sending = true;
    const batch = this.queue.splice(0, this.config.batchSize);

    try {
      await this.sendBatch(batch);
      if (this.config.debug) {
        console.log(`[LogNog] Sent ${batch.length} events`);
      }
    } catch (error) {
      this.queue.unshift(...batch);
      if (this.config.debug) {
        console.error('[LogNog] Send failed:', error);
      }
    } finally {
      this.sending = false;
    }
  }

  private async sendBatch(batch: LogEvent[], attempt = 0): Promise<void> {
    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.config.apiKey,
        },
        body: JSON.stringify(batch),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      if (attempt < this.config.retryAttempts) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.sendBatch(batch, attempt + 1);
      }
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    await this.flush();
  }
}

export default NextJsLogger;
