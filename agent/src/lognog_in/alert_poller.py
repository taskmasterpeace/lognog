"""Alert polling service for LogNog In agent."""

import hashlib
import logging
import threading
import time
from datetime import datetime
from typing import Callable, Optional, Set

import httpx

from .alert_panel import Alert

logger = logging.getLogger(__name__)


class AlertPoller:
    """
    Polls the LogNog server for triggered alerts and pushes them to the alert panel.

    Features:
    - Configurable poll interval
    - Tracks seen alerts to avoid duplicates
    - Handles connection errors gracefully
    - Supports multiple app scopes (indexes)
    """

    DEFAULT_POLL_INTERVAL = 30  # seconds

    def __init__(
        self,
        server_url: str,
        api_key: str,
        on_alert: Callable[[Alert], None],
        poll_interval: int = DEFAULT_POLL_INTERVAL,
        app_scope: Optional[str] = None,
    ):
        """
        Initialize the alert poller.

        Args:
            server_url: LogNog server URL
            api_key: API key for authentication
            on_alert: Callback when new alert is received
            poll_interval: Seconds between polls
            app_scope: Optional app scope to filter alerts
        """
        self.server_url = server_url.rstrip("/")
        self.api_key = api_key
        self.on_alert = on_alert
        self.poll_interval = poll_interval
        self.app_scope = app_scope

        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()

        # Track seen alert trigger IDs to avoid duplicates
        self._seen_triggers: Set[str] = set()
        self._max_seen = 1000  # Limit memory usage

    def start(self) -> None:
        """Start polling for alerts."""
        if self._running:
            return

        self._running = True
        self._stop_event.clear()

        self._thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._thread.start()

        logger.info(f"Alert poller started (interval: {self.poll_interval}s)")

    def stop(self) -> None:
        """Stop polling."""
        self._running = False
        self._stop_event.set()

        if self._thread:
            self._thread.join(timeout=5)
            self._thread = None

        logger.info("Alert poller stopped")

    def _poll_loop(self) -> None:
        """Main polling loop."""
        # Initial poll after short delay
        time.sleep(5)

        while self._running and not self._stop_event.is_set():
            try:
                self._poll_once()
            except Exception as e:
                logger.error(f"Alert poll error: {e}")

            # Wait for next poll or stop
            self._stop_event.wait(timeout=self.poll_interval)

    def _poll_once(self) -> None:
        """Perform a single poll for triggered alerts."""
        if not self.server_url or not self.api_key:
            return

        try:
            # Get recently triggered alerts
            url = f"{self.server_url}/alerts"
            headers = {"Authorization": f"ApiKey {self.api_key}"}
            params = {}

            if self.app_scope:
                params["app_scope"] = self.app_scope

            with httpx.Client(timeout=30) as client:
                response = client.get(url, headers=headers, params=params)

            if response.status_code != 200:
                logger.warning(f"Alert poll failed: HTTP {response.status_code}")
                return

            alerts_data = response.json()

            # Process each alert
            for alert_data in alerts_data:
                self._process_alert(alert_data)

        except httpx.ConnectError:
            logger.debug("Cannot connect to server for alert polling")
        except httpx.TimeoutException:
            logger.debug("Alert poll timed out")
        except Exception as e:
            logger.error(f"Alert poll error: {e}")

    def _process_alert(self, alert_data: dict) -> None:
        """Process an alert from the API response."""
        alert_id = alert_data.get("id")
        if not alert_id:
            return

        # Only process enabled alerts that have triggered recently
        if not alert_data.get("enabled"):
            return

        last_triggered = alert_data.get("last_triggered")
        if not last_triggered:
            return

        # Create a unique ID for this trigger instance
        trigger_id = self._make_trigger_id(alert_id, last_triggered)

        # Skip if we've already seen this trigger
        if trigger_id in self._seen_triggers:
            return

        # Mark as seen
        self._seen_triggers.add(trigger_id)

        # Trim seen set if too large
        if len(self._seen_triggers) > self._max_seen:
            # Remove oldest half
            to_remove = list(self._seen_triggers)[:self._max_seen // 2]
            for item in to_remove:
                self._seen_triggers.discard(item)

        # Check if trigger is recent (within last poll interval + buffer)
        try:
            trigger_time = datetime.fromisoformat(last_triggered.replace("Z", "+00:00"))
            now = datetime.now(trigger_time.tzinfo) if trigger_time.tzinfo else datetime.now()
            age_seconds = (now - trigger_time).total_seconds()

            # Only notify for triggers within 2x poll interval
            if age_seconds > self.poll_interval * 2:
                logger.debug(f"Skipping old trigger for {alert_data.get('name')}: {age_seconds:.0f}s ago")
                return
        except (ValueError, TypeError) as e:
            logger.debug(f"Cannot parse trigger time: {e}")

        # Create Alert object with full details
        alert = Alert(
            id=trigger_id,
            title=alert_data.get("name", "Alert"),
            message=alert_data.get("description", "Alert triggered"),
            severity=alert_data.get("severity", "medium"),
            timestamp=last_triggered,
            alert_id=alert_id,
            playbook=alert_data.get("playbook"),
            search_query=alert_data.get("search_query"),
        )

        logger.info(f"New alert trigger: {alert.title} ({alert.severity.label})")

        # Notify callback
        if self.on_alert:
            self.on_alert(alert)

    def _make_trigger_id(self, alert_id: str, timestamp: str) -> str:
        """Create a unique ID for a trigger instance."""
        # Hash alert_id + timestamp to create unique trigger ID
        combined = f"{alert_id}:{timestamp}"
        return hashlib.md5(combined.encode()).hexdigest()[:16]

    def force_poll(self) -> None:
        """Force an immediate poll (for testing/debugging)."""
        threading.Thread(target=self._poll_once, daemon=True).start()
