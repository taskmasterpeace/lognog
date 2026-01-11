// Live tail hook - connects to SSE endpoint for real-time log streaming

import { useState, useEffect, useRef, useCallback } from 'react';

export interface LiveTailLog {
  timestamp: string;
  message: string;
  severity?: number;
  hostname?: string;
  app_name?: string;
  [key: string]: unknown;
}

interface SSEMessage {
  type: 'connected' | 'logs' | 'error';
  message?: string;
  count?: number;
  data?: LiveTailLog[];
}

interface UseLiveTailOptions {
  query?: string;
  maxLogs?: number;
  onNewLogs?: (logs: LiveTailLog[]) => void;
}

interface UseLiveTailReturn {
  isConnected: boolean;
  isStreaming: boolean;
  isPaused: boolean;
  logs: LiveTailLog[];
  logsPerSecond: number;
  totalReceived: number;
  error: string | null;
  start: () => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  clear: () => void;
}

export function useLiveTail(options: UseLiveTailOptions = {}): UseLiveTailReturn {
  const { query = 'search *', maxLogs = 1000, onNewLogs } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [logs, setLogs] = useState<LiveTailLog[]>([]);
  const [logsPerSecond, setLogsPerSecond] = useState(0);
  const [totalReceived, setTotalReceived] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const pausedLogsRef = useRef<LiveTailLog[]>([]);
  const rateCounterRef = useRef<number[]>([]);
  const rateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Calculate logs per second
  useEffect(() => {
    if (isStreaming && !isPaused) {
      rateIntervalRef.current = setInterval(() => {
        const now = Date.now();
        // Keep only counts from the last second
        rateCounterRef.current = rateCounterRef.current.filter(t => now - t < 1000);
        setLogsPerSecond(rateCounterRef.current.length);
      }, 200);

      return () => {
        if (rateIntervalRef.current) {
          clearInterval(rateIntervalRef.current);
        }
      };
    } else {
      setLogsPerSecond(0);
    }
  }, [isStreaming, isPaused]);

  const start = useCallback(() => {
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setError(null);
    setIsStreaming(true);

    // Build SSE URL with query parameter
    const params = new URLSearchParams({ query });
    const sseUrl = `/api/sse/tail?${params.toString()}`;

    const eventSource = new EventSource(sseUrl);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const message: SSEMessage = JSON.parse(event.data);

        if (message.type === 'connected') {
          setIsConnected(true);
        } else if (message.type === 'logs' && message.data) {
          const newLogs = message.data;

          // Track rate
          const now = Date.now();
          newLogs.forEach(() => rateCounterRef.current.push(now));
          setTotalReceived(prev => prev + newLogs.length);

          if (isPaused) {
            // Buffer logs while paused
            pausedLogsRef.current = [...pausedLogsRef.current, ...newLogs].slice(-maxLogs);
          } else {
            // Add to display
            setLogs(prev => {
              const updated = [...newLogs, ...prev].slice(0, maxLogs);
              return updated;
            });

            // Callback for new logs
            if (onNewLogs) {
              onNewLogs(newLogs);
            }
          }
        } else if (message.type === 'error') {
          setError(message.message || 'Stream error');
        }
      } catch (err) {
        console.error('Failed to parse SSE message:', err);
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      setError('Connection lost. Reconnecting...');

      // EventSource will automatically reconnect
    };
  }, [query, maxLogs, isPaused, onNewLogs]);

  const stop = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsStreaming(false);
    setIsConnected(false);
    setLogsPerSecond(0);
    rateCounterRef.current = [];
  }, []);

  const pause = useCallback(() => {
    setIsPaused(true);
    pausedLogsRef.current = [];
  }, []);

  const resume = useCallback(() => {
    // Merge buffered logs when resuming
    if (pausedLogsRef.current.length > 0) {
      setLogs(prev => [...pausedLogsRef.current, ...prev].slice(0, maxLogs));
      pausedLogsRef.current = [];
    }
    setIsPaused(false);
  }, [maxLogs]);

  const clear = useCallback(() => {
    setLogs([]);
    setTotalReceived(0);
    pausedLogsRef.current = [];
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (rateIntervalRef.current) {
        clearInterval(rateIntervalRef.current);
      }
    };
  }, []);

  return {
    isConnected,
    isStreaming,
    isPaused,
    logs,
    logsPerSecond,
    totalReceived,
    error,
    start,
    stop,
    pause,
    resume,
    clear,
  };
}
