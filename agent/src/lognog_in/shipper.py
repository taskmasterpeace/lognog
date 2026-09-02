"""HTTP shipper module for sending events to LogNog server."""

import asyncio
import gzip
import json
import logging
import random
import threading
import time
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Callable, Optional

import httpx

from . import __version__
from .config import Config
from .buffer import EventBuffer, LogEvent, FIMEvent

logger = logging.getLogger(__name__)

# Bodies smaller than this aren't worth compressing.
COMPRESS_MIN_BYTES = 1024
# The server accepts at most this many events per request.
SERVER_MAX_BATCH = 10_000


class ConnectionStatus(Enum):
    """Connection status."""
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    ERROR = "error"


class SendResult(Enum):
    """Outcome of a batch send attempt."""
    SUCCESS = "success"        # Server accepted the batch (remove events)
    TRANSIENT = "transient"    # 5xx / timeout / connection error (retry, keep)
    PERMANENT = "permanent"    # 4xx the server will never accept (drop batch)
    HOLD = "hold"              # Not configured / no API key (retain, back off)


# Notification callback type
NotificationCallback = Callable[[str, str, str], None]  # (title, message, severity)


def encode_batch_body(payload: dict, compress: bool) -> tuple[bytes, dict]:
    """Serialize a batch, gzipping when worthwhile.

    Returns ``(body, extra_headers)``. Only bodies of at least
    ``COMPRESS_MIN_BYTES`` are compressed; the server inflates transparently.
    """
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if compress and len(raw) >= COMPRESS_MIN_BYTES:
        return gzip.compress(raw, compresslevel=6), {**headers, "Content-Encoding": "gzip"}
    return raw, headers


class HTTPShipper:
    """
    Ships events to the LogNog server.

    Features:
    - Batching for efficiency, draining a backlog back-to-back
    - Automatic retry with exponential backoff (+ jitter)
    - Offline buffering via EventBuffer
    - Async HTTP with connection pooling, gzip, TLS options
    - Alert notification polling
    - Periodic agent heartbeat events
    """

    def __init__(
        self,
        config: Config,
        buffer: EventBuffer,
        on_status_change: Optional[Callable[[ConnectionStatus], None]] = None,
        on_notification: Optional[NotificationCallback] = None,
        stats_provider: Optional[Callable[[], dict]] = None,
    ):
        self.config = config
        self.buffer = buffer
        self.on_status_change = on_status_change
        self.on_notification = on_notification
        # Called when building a heartbeat; returns extra counters to include.
        self.stats_provider = stats_provider

        self._status = ConnectionStatus.DISCONNECTED
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._started_at = time.time()

        # Stats
        self._events_sent = 0
        self._events_failed = 0
        self._batches_sent = 0
        self._bytes_sent = 0
        self._last_send_time: Optional[float] = None
        self._last_error: Optional[str] = None
        self._last_notification_check: Optional[float] = None
        self._last_heartbeat: Optional[float] = None
        self._heartbeats_sent = 0

    @property
    def status(self) -> ConnectionStatus:
        return self._status

    @status.setter
    def status(self, value: ConnectionStatus) -> None:
        if self._status != value:
            self._status = value
            if self.on_status_change:
                self.on_status_change(value)

    # ------------------------------------------------------------- enqueue
    def _enrich(self, event: LogEvent) -> LogEvent:
        """Stamp static tags and the default index onto an event."""
        if self.config.tags:
            merged = dict(self.config.tags)
            merged.update(event.metadata or {})
            event.metadata = merged
        if event.index is None and self.config.index:
            event.index = self.config.index
        return event

    def queue_log_event(self, event: LogEvent) -> None:
        """Queue a log event for shipping."""
        self.buffer.add_log_event(self._enrich(event))

    def queue_log_events(self, events: list[LogEvent]) -> None:
        """Queue many log events in one buffer transaction."""
        if not events:
            return
        self.buffer.add_log_events([self._enrich(e) for e in events])

    def queue_fim_event(self, event: FIMEvent) -> None:
        """Queue a FIM event for shipping."""
        if self.config.tags:
            merged = dict(self.config.tags)
            merged.update(event.metadata or {})
            event.metadata = merged
        self.buffer.add_fim_event(event)

    # ------------------------------------------------------------ lifecycle
    def start(self) -> None:
        """Start the shipper background thread."""
        if self._running:
            return

        self._stop_event.clear()
        self._running = True
        self._started_at = time.time()
        self._thread = threading.Thread(target=self._run_loop, daemon=True, name="lognog-shipper")
        self._thread.start()
        logger.info("HTTP shipper started")

    def stop(self, flush: bool = True, flush_timeout: float = 15.0) -> None:
        """Stop the shipper, optionally flushing the buffer first.

        A graceful shutdown (service stop / SIGTERM / Ctrl-C) should hand off
        any buffered events to the server before exiting so nothing is stranded
        on disk longer than necessary. Flushing is best-effort and bounded by
        ``flush_timeout``; whatever can't be shipped stays durably in the
        SQLite buffer for the next run.
        """
        if not self._running:
            return

        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=10.0)
            self._thread = None

        self._running = False

        if flush:
            try:
                self.flush(timeout=flush_timeout)
            except Exception as e:
                logger.warning(f"Buffer flush on shutdown failed: {e}")

        self.status = ConnectionStatus.DISCONNECTED
        logger.info("HTTP shipper stopped")

    def _client(self, timeout: float, max_connections: int = 10) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            timeout=timeout,
            verify=self.config.httpx_verify(),
            limits=httpx.Limits(max_connections=max_connections, max_keepalive_connections=max(1, max_connections // 2)),
            headers={"User-Agent": f"LogNog-In/{__version__}"},
        )

    def flush(self, timeout: float = 15.0) -> int:
        """Best-effort synchronous drain of the buffer to the server.

        Returns the number of events successfully shipped. Stops early on the
        first non-success result (outage / not configured) so a graceful stop
        can't block indefinitely, and never longer than ``timeout`` seconds.
        Unsent events remain in the durable buffer.
        """
        return asyncio.run(self._flush_async(timeout))

    async def _flush_async(self, timeout: float) -> int:
        sent = 0
        deadline = time.monotonic() + timeout
        async with self._client(timeout=10.0, max_connections=5) as client:
            while time.monotonic() < deadline:
                batch = self.buffer.get_batch(self.config.batch_size)
                if not batch:
                    break
                result = await self._send_batch(client, batch)
                if self._handle_batch_result(batch, result):
                    sent += len(batch)
                else:
                    # Outage / hold / permanent-drop: stop draining. Anything
                    # not shipped stays safely in the buffer for next run.
                    break
        if sent:
            logger.info(f"Flushed {sent} buffered event(s) on shutdown")
        return sent

    def _run_loop(self) -> None:
        """Main shipper loop."""
        asyncio.run(self._async_loop())

    def _next_backoff(self, current: float) -> float:
        """Return the next exponential-backoff delay (doubled, capped)."""
        cap = self.config.retry_backoff_max_seconds
        return min(current * 2, cap)

    def _apply_jitter(self, delay: float) -> float:
        """Apply full jitter to a backoff delay to avoid thundering herds.

        Returns a value uniformly in ``[delay/2, delay]`` so many agents don't
        all retry in lockstep after a shared outage, while still guaranteeing
        forward progress (never zero for a positive delay).
        """
        if delay <= 0:
            return 0.0
        return random.uniform(delay / 2.0, delay)

    def _wait_after_success(self, batch_len: int) -> float:
        """Pace after a successful send.

        A full batch almost certainly means more is waiting, so drain
        back-to-back; the old fixed sleep capped throughput at
        ``batch_size / batch_interval`` events per second (20/s by default)
        and a busy file fell further behind the longer it ran.
        """
        if batch_len >= self.config.batch_size:
            return 0.0
        return self.config.batch_interval_seconds

    async def _async_loop(self) -> None:
        """Async shipping loop.

        On any non-success send (transient failure, hold, or an unexpected
        loop error) the wait before the next iteration follows a real
        exponential backoff WITH jitter, capped at
        ``retry_backoff_max_seconds``. On success the backoff resets to the
        base ``retry_backoff_seconds`` and the loop paces itself at the normal
        ``batch_interval_seconds`` — or not at all while a backlog remains.
        """
        base_delay = self.config.retry_backoff_seconds
        retry_delay = base_delay

        async with self._client(timeout=30.0) as client:
            while not self._stop_event.is_set():
                try:
                    self._maybe_heartbeat()

                    # Get batch from buffer
                    batch = self.buffer.get_batch(self.config.batch_size)

                    if batch:
                        result = await self._send_batch(client, batch)
                        succeeded = self._handle_batch_result(batch, result)
                        if succeeded:
                            # Reset backoff; drain immediately if more is waiting.
                            retry_delay = base_delay
                            wait_time = self._wait_after_success(len(batch))
                        else:
                            # Real exponential backoff with jitter on failure.
                            wait_time = self._apply_jitter(retry_delay)
                            retry_delay = self._next_backoff(retry_delay)
                    else:
                        # No events to send, still check connection.
                        if self._status != ConnectionStatus.CONNECTED:
                            await self._check_connection(client)
                        retry_delay = base_delay
                        wait_time = 1.0

                    # Check for alert notifications (every 30 seconds)
                    if self._status == ConnectionStatus.CONNECTED:
                        await self._check_notifications(client)

                    # Wait before next batch.
                    if wait_time > 0:
                        self._stop_event.wait(timeout=wait_time)

                except Exception as e:
                    logger.error(f"Shipper loop error: {e}")
                    self.status = ConnectionStatus.ERROR
                    self._last_error = str(e)
                    self._stop_event.wait(timeout=self._apply_jitter(retry_delay))
                    retry_delay = self._next_backoff(retry_delay)

    # ----------------------------------------------------------- heartbeat
    def build_heartbeat(self) -> LogEvent:
        """The agent's self-monitoring event (source_type ``agent_heartbeat``)."""
        stats = self.get_stats()
        extra = {}
        if self.stats_provider:
            try:
                extra = self.stats_provider() or {}
            except Exception as e:
                logger.debug(f"stats_provider failed: {e}")
        uptime = int(time.time() - self._started_at)
        metadata = {
            "severity": "info",
            "agent_version": __version__,
            "uptime_seconds": uptime,
            "events_sent": stats["events_sent"],
            "events_failed": stats["events_failed"],
            "events_buffered": stats["events_buffered"],
            "events_dropped": self.buffer.dropped_count,
            "batches_sent": self._batches_sent,
            "bytes_sent": self._bytes_sent,
            "connection": stats["status"],
            **extra,
        }
        return LogEvent(
            timestamp=datetime.now(timezone.utc).isoformat(),
            hostname=self.config.hostname,
            source="lognog-in",
            source_type="agent_heartbeat",
            file_path="",
            message=(
                f"LogNog In {__version__} heartbeat: {stats['events_sent']} sent, "
                f"{stats['events_buffered']} buffered, {self.buffer.dropped_count} dropped, "
                f"up {uptime}s"
            ),
            metadata=metadata,
        )

    def _maybe_heartbeat(self) -> None:
        interval = self.config.heartbeat_interval_seconds
        if interval <= 0 or not self.config.api_key:
            return
        now = time.time()
        if self._last_heartbeat is not None and now - self._last_heartbeat < interval:
            return
        self._last_heartbeat = now
        try:
            self.queue_log_event(self.build_heartbeat())
            self._heartbeats_sent += 1
        except Exception as e:
            logger.debug(f"Heartbeat enqueue failed: {e}")

    # ---------------------------------------------------------------- send
    def _handle_batch_result(
        self,
        batch: list[tuple[int, str, dict]],
        result: SendResult,
    ) -> bool:
        """Apply a send result to the buffer.

        Returns True when the send succeeded (caller can reset its backoff),
        False otherwise. This is the single place that decides whether events
        are removed, retried, or held.

        Critical outage-safety rule (issue: outage data loss):
        - TRANSIENT (connection error / timeout / 5xx / 429 / 401) means the
          failure is NOT the event's fault. We keep the events untouched and
          retry after backoff. We do NOT bump the attempt counter and we do
          NOT purge, so a multi-minute (or multi-hour) server outage cannot
          drain the buffer. Bounding is handled purely by the buffer's
          capacity cap (oldest-drop), not by an attempt counter.
        - PERMANENT (a non-retryable 4xx the server will never accept) is the
          only case where the batch is a genuine poison pill. We bump the
          per-event attempt counter and purge events that exceed
          ``retry_max_attempts`` so a permanently-rejected head batch cannot
          block the queue forever. (For a clear 4xx we drop immediately.)
        - HOLD (agent not configured / no API key) retains everything and just
          backs off; the events are fine, we simply can't ship yet.
        """
        event_ids = [item[0] for item in batch]

        if result == SendResult.SUCCESS:
            self.buffer.remove_events(event_ids)
            self._events_sent += len(batch)
            self._batches_sent += 1
            self.status = ConnectionStatus.CONNECTED
            return True

        if result == SendResult.PERMANENT:
            # Server will never accept this batch (e.g. 400/413/422); drop it so
            # the queue advances instead of retrying forever. Bump attempts too
            # so any partial/poison variants are purged via the retry limit.
            self.buffer.increment_attempts(event_ids)
            self.buffer.remove_events(event_ids)
            self._events_failed += len(batch)
            logger.warning(
                f"Dropped {len(batch)} events after permanent send failure: "
                f"{self._last_error}"
            )
            dropped = self.buffer.remove_stale_events(self.config.retry_max_attempts)
            if dropped:
                logger.warning(
                    f"Dropped {dropped} stale event(s) exceeding "
                    f"{self.config.retry_max_attempts} attempts"
                )
            return False

        if result == SendResult.HOLD:
            # Not configured yet; keep everything buffered and back off. Nothing
            # is counted as failed because the events are perfectly good.
            return False

        # TRANSIENT - connection-level / 5xx failure. KEEP the events untouched
        # and retry after backoff. Do NOT increment attempts or purge; the
        # buffer must survive the outage. Capacity is bounded by the cap only.
        return False

    async def _send_batch(
        self,
        client: httpx.AsyncClient,
        batch: list[tuple[int, str, dict]],
    ) -> SendResult:
        """Send a batch of events to the server.

        Returns a SendResult classifying the outcome so the caller can decide
        whether to remove the events (SUCCESS / PERMANENT) or retry (TRANSIENT).
        """
        if not self.config.api_key:
            # Not configured yet. Treat as a HOLD, not a failure: the events are
            # good, we just can't ship them. Returning TRANSIENT here used to be
            # harmless only because purge is now attempt-based, but HOLD makes
            # the intent explicit and keeps events indefinitely until an API key
            # is configured.
            logger.warning("No API key configured - holding events until configured")
            self.status = ConnectionStatus.DISCONNECTED
            self._last_error = "No API key configured"
            return SendResult.HOLD

        url = f"{self.config.server_url}/api/ingest/agent"

        # Stable idempotency key for this batch. A retried identical batch carries
        # the same id so the server can dedupe if the prior response was lost.
        batch_id = str(uuid.uuid4())

        # Format events for API
        events = []
        for _, event_type, event_data in batch[:SERVER_MAX_BATCH]:
            events.append({
                "type": event_type,
                **event_data,
            })

        body, content_headers = encode_batch_body({"events": events, "batch_id": batch_id}, self.config.compress_payloads)

        try:
            # Only flip the tray to "connecting" when we aren't already connected;
            # flashing the icon on every batch was pure noise.
            if self._status != ConnectionStatus.CONNECTED:
                self.status = ConnectionStatus.CONNECTING
            response = await client.post(
                url,
                content=body,
                headers={
                    "Authorization": f"ApiKey {self.config.api_key}",
                    "User-Agent": f"LogNog-In/{__version__}",
                    "X-Batch-Id": batch_id,
                    **content_headers,
                },
            )

            status = response.status_code

            if status == 200:
                self._last_send_time = time.time()
                self._bytes_sent += len(body)
                logger.debug(f"Sent {len(events)} events successfully ({len(body)} bytes)")
                return SendResult.SUCCESS
            elif status == 401:
                logger.error("Authentication failed - check API key")
                self.status = ConnectionStatus.ERROR
                self._last_error = "Authentication failed"
                # Auth issue - keep events buffered and retry once configured.
                return SendResult.TRANSIENT
            elif status == 404:
                # The endpoint isn't there: server_url points at the wrong place
                # (e.g. the bare API port, which has no /api prefix — go through
                # the LogNog web address). That's a configuration problem, not a
                # bad batch: keep the events and say so.
                logger.error(
                    f"Ingest endpoint not found (404) at {url} — check server_url "
                    "(use the LogNog web address, e.g. https://logs.example.com)"
                )
                self.status = ConnectionStatus.ERROR
                self._last_error = "HTTP 404: ingest endpoint not found — check server_url"
                return SendResult.TRANSIENT
            elif status in (408, 429) or status >= 500:
                # Timeout / rate-limit / server error - transient, safe to retry.
                logger.error(f"Server returned {status}: {response.text}")
                self.status = ConnectionStatus.ERROR
                self._last_error = f"HTTP {status}"
                return SendResult.TRANSIENT
            elif 400 <= status < 500:
                # Other 4xx (e.g. 400/413/422) - the server will never accept
                # this batch, so drop it instead of retrying forever.
                logger.error(f"Server returned {status} (permanent): {response.text}")
                self.status = ConnectionStatus.ERROR
                self._last_error = f"HTTP {status} (permanent)"
                return SendResult.PERMANENT
            else:
                logger.error(f"Server returned {status}: {response.text}")
                self.status = ConnectionStatus.ERROR
                self._last_error = f"HTTP {status}"
                return SendResult.TRANSIENT

        except httpx.ConnectError as e:
            logger.error(f"Connection failed: {e}")
            self.status = ConnectionStatus.DISCONNECTED
            self._last_error = "Connection failed"
            return SendResult.TRANSIENT
        except httpx.TimeoutException as e:
            logger.error(f"Request timeout: {e}")
            self.status = ConnectionStatus.DISCONNECTED
            self._last_error = "Timeout"
            return SendResult.TRANSIENT
        except Exception as e:
            logger.error(f"Send failed: {e}")
            self.status = ConnectionStatus.ERROR
            self._last_error = str(e)
            return SendResult.TRANSIENT

    async def _check_connection(self, client: httpx.AsyncClient) -> bool:
        """Check connection to server."""
        try:
            url = f"{self.config.server_url}/health"
            response = await client.get(url, timeout=5.0)
            if response.status_code == 200:
                self.status = ConnectionStatus.CONNECTED
                return True
        except Exception:
            pass

        self.status = ConnectionStatus.DISCONNECTED
        return False

    async def _check_notifications(self, client: httpx.AsyncClient) -> None:
        """Poll server for pending notifications."""
        if not self.on_notification or not self.config.api_key:
            return

        # Only check every 30 seconds
        now = time.time()
        if self._last_notification_check and (now - self._last_notification_check) < 30:
            return

        self._last_notification_check = now

        try:
            url = f"{self.config.server_url}/api/ingest/notifications"
            params = {"hostname": self.config.hostname}

            response = await client.get(
                url,
                params=params,
                headers={
                    "Authorization": f"ApiKey {self.config.api_key}",
                },
                timeout=10.0,
            )

            if response.status_code == 200:
                data = response.json()
                notifications = data.get("notifications", [])

                for notif in notifications:
                    # Show notification
                    self.on_notification(
                        notif.get("title", "LogNog Alert"),
                        notif.get("message", ""),
                        notif.get("severity", "medium"),
                    )

                    # Acknowledge delivery
                    await self._ack_notification(client, notif["id"])

                if notifications:
                    logger.info(f"Received {len(notifications)} alert notification(s)")

        except Exception as e:
            logger.debug(f"Notification check failed: {e}")

    async def _ack_notification(self, client: httpx.AsyncClient, notification_id: str) -> None:
        """Acknowledge a notification as delivered."""
        try:
            url = f"{self.config.server_url}/api/ingest/notifications/{notification_id}/ack"
            await client.post(
                url,
                json={"hostname": self.config.hostname},
                headers={
                    "Authorization": f"ApiKey {self.config.api_key}",
                    "Content-Type": "application/json",
                },
                timeout=5.0,
            )
        except Exception as e:
            logger.debug(f"Failed to ack notification {notification_id}: {e}")

    def get_stats(self) -> dict:
        """Get shipper statistics."""
        return {
            "status": self._status.value,
            "events_sent": self._events_sent,
            "events_failed": self._events_failed,
            "events_buffered": self.buffer.count(),
            "events_dropped": self.buffer.dropped_count,
            "batches_sent": self._batches_sent,
            "bytes_sent": self._bytes_sent,
            "heartbeats_sent": self._heartbeats_sent,
            "last_send_time": self._last_send_time,
            "last_error": self._last_error,
            "uptime_seconds": int(time.time() - self._started_at),
        }
