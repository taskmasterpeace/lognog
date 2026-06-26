"""HTTP shipper module for sending events to LogNog server."""

import asyncio
import logging
import threading
import time
import uuid
from enum import Enum
from typing import Callable, Optional

import httpx

from .config import Config
from .buffer import EventBuffer, LogEvent, FIMEvent

logger = logging.getLogger(__name__)


class ConnectionStatus(Enum):
    """Connection status."""
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    ERROR = "error"


class SendResult(Enum):
    """Outcome of a batch send attempt."""
    SUCCESS = "success"        # Server accepted the batch (remove events)
    TRANSIENT = "transient"    # 5xx / timeout / connection error (retry)
    PERMANENT = "permanent"    # 4xx the server will never accept (drop batch)


# Notification callback type
NotificationCallback = Callable[[str, str, str], None]  # (title, message, severity)


class HTTPShipper:
    """
    Ships events to the LogNog server.

    Features:
    - Batching for efficiency
    - Automatic retry with exponential backoff
    - Offline buffering via EventBuffer
    - Async HTTP with connection pooling
    - Alert notification polling
    """

    def __init__(
        self,
        config: Config,
        buffer: EventBuffer,
        on_status_change: Optional[Callable[[ConnectionStatus], None]] = None,
        on_notification: Optional[NotificationCallback] = None,
    ):
        self.config = config
        self.buffer = buffer
        self.on_status_change = on_status_change
        self.on_notification = on_notification

        self._status = ConnectionStatus.DISCONNECTED
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()

        # Stats
        self._events_sent = 0
        self._events_failed = 0
        self._last_send_time: Optional[float] = None
        self._last_error: Optional[str] = None
        self._last_notification_check: Optional[float] = None

    @property
    def status(self) -> ConnectionStatus:
        return self._status

    @status.setter
    def status(self, value: ConnectionStatus) -> None:
        if self._status != value:
            self._status = value
            if self.on_status_change:
                self.on_status_change(value)

    def queue_log_event(self, event: LogEvent) -> None:
        """Queue a log event for shipping."""
        self.buffer.add_log_event(event)

    def queue_fim_event(self, event: FIMEvent) -> None:
        """Queue a FIM event for shipping."""
        self.buffer.add_fim_event(event)

    def start(self) -> None:
        """Start the shipper background thread."""
        if self._running:
            return

        self._stop_event.clear()
        self._running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        logger.info("HTTP shipper started")

    def stop(self) -> None:
        """Stop the shipper."""
        if not self._running:
            return

        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=10.0)
            self._thread = None

        self._running = False
        self.status = ConnectionStatus.DISCONNECTED
        logger.info("HTTP shipper stopped")

    def _run_loop(self) -> None:
        """Main shipper loop."""
        asyncio.run(self._async_loop())

    async def _async_loop(self) -> None:
        """Async shipping loop."""
        retry_delay = self.config.retry_backoff_seconds

        async with httpx.AsyncClient(
            timeout=30.0,
            limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
        ) as client:
            while not self._stop_event.is_set():
                try:
                    # Get batch from buffer
                    batch = self.buffer.get_batch(self.config.batch_size)

                    if batch:
                        result = await self._send_batch(client, batch)
                        if self._handle_batch_result(batch, result):
                            retry_delay = self.config.retry_backoff_seconds
                        else:
                            retry_delay = min(retry_delay * 2, 60.0)
                    else:
                        # No events to send, still check connection
                        if self._status != ConnectionStatus.CONNECTED:
                            await self._check_connection(client)

                    # Check for alert notifications (every 30 seconds)
                    if self._status == ConnectionStatus.CONNECTED:
                        await self._check_notifications(client)

                    # Wait before next batch
                    wait_time = self.config.batch_interval_seconds if batch else 1.0
                    self._stop_event.wait(timeout=wait_time)

                except Exception as e:
                    logger.error(f"Shipper loop error: {e}")
                    self.status = ConnectionStatus.ERROR
                    self._last_error = str(e)
                    self._stop_event.wait(timeout=retry_delay)
                    retry_delay = min(retry_delay * 2, 60.0)

    def _handle_batch_result(
        self,
        batch: list[tuple[int, str, dict]],
        result: SendResult,
    ) -> bool:
        """Apply a send result to the buffer.

        Returns True when the send succeeded (caller can reset its backoff),
        False otherwise. This is the single place that decides whether events
        are removed (SUCCESS / PERMANENT) or retried (TRANSIENT), and where
        poison events exceeding the retry limit are purged so a permanently
        failing head batch can't block the queue forever.
        """
        event_ids = [item[0] for item in batch]

        if result == SendResult.SUCCESS:
            self.buffer.remove_events(event_ids)
            self._events_sent += len(batch)
            self.status = ConnectionStatus.CONNECTED
            return True

        if result == SendResult.PERMANENT:
            # Server will never accept this batch (e.g. 400/413/422); drop it so
            # the queue advances instead of retrying forever.
            self.buffer.remove_events(event_ids)
            self._events_failed += len(batch)
            logger.warning(
                f"Dropped {len(batch)} events after permanent send failure: "
                f"{self._last_error}"
            )
            return False

        # TRANSIENT - mark as failed and retry later.
        self.buffer.increment_attempts(event_ids)
        self._events_failed += len(batch)
        # Purge poison events that have exceeded the retry limit.
        dropped = self.buffer.remove_stale_events(self.config.retry_max_attempts)
        if dropped:
            logger.warning(
                f"Dropped {dropped} stale event(s) exceeding "
                f"{self.config.retry_max_attempts} attempts"
            )
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
            logger.error("No API key configured")
            self.status = ConnectionStatus.ERROR
            self._last_error = "No API key configured"
            return SendResult.TRANSIENT

        url = f"{self.config.server_url}/api/ingest/agent"

        # Stable idempotency key for this batch. A retried identical batch carries
        # the same id so the server can dedupe if the prior response was lost.
        batch_id = str(uuid.uuid4())

        # Format events for API
        events = []
        for _, event_type, event_data in batch:
            events.append({
                "type": event_type,
                **event_data,
            })

        try:
            self.status = ConnectionStatus.CONNECTING
            response = await client.post(
                url,
                json={"events": events, "batch_id": batch_id},
                headers={
                    "Authorization": f"ApiKey {self.config.api_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "LogNog-In/0.1.0",
                    "X-Batch-Id": batch_id,
                },
            )

            status = response.status_code

            if status == 200:
                self._last_send_time = time.time()
                logger.debug(f"Sent {len(events)} events successfully")
                return SendResult.SUCCESS
            elif status == 401:
                logger.error("Authentication failed - check API key")
                self.status = ConnectionStatus.ERROR
                self._last_error = "Authentication failed"
                # Auth issue - keep events buffered and retry once configured.
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
            "last_send_time": self._last_send_time,
            "last_error": self._last_error,
        }
