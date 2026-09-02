"""Integration-style reliability tests for the LogNog In agent.

These cover the two properties a log shipper must NEVER violate:

1. Outage -> recovery with NO data loss. A multi-cycle server outage (connection
   errors / 5xx) must not drop a single buffered event; when the server
   recovers, every event ships.

2. Restart -> NO duplication. File-tail offsets are persisted, so restarting the
   agent (new watcher/handler over the same offset store) must not re-read and
   re-ship lines already sent.

Plus focused unit tests for the supporting fixes: exponential backoff with
jitter, buffer capacity cap, config validation/normalization, and the Windows
event local->UTC timestamp conversion.
"""

import asyncio
from pathlib import Path

import pytest

from lognog_in.config import Config
from lognog_in.buffer import EventBuffer, LogEvent
from lognog_in.shipper import HTTPShipper, SendResult
from lognog_in.offset_store import FileOffsetStore
from lognog_in.watcher import LogFileHandler
from lognog_in.config import WatchPath


def _event(i: int) -> LogEvent:
    return LogEvent(
        timestamp="2024-01-15T10:30:00Z",
        hostname="testhost",
        source="app.log",
        source_type="file",
        file_path="/var/log/app.log",
        message=f"Message {i}",
        metadata={},
    )


class MockIngestServer:
    """A stand-in httpx.AsyncClient modelling a server that can go down.

    When ``up`` is False every POST raises a connection error (transient); when
    up it returns 200 and records the events it accepted so a test can assert no
    duplication and no loss.
    """

    def __init__(self):
        self.up = True
        self.accepted: list[dict] = []
        self.post_calls = 0

    async def post(self, url, json=None, headers=None, content=None, **kwargs):
        self.post_calls += 1
        if not self.up:
            import httpx
            raise httpx.ConnectError("server down", request=None)
        payload = json
        if content is not None:
            # The shipper sends a serialized (optionally gzipped) body.
            import gzip as _gzip
            import json as _json
            raw = content
            if (headers or {}).get("Content-Encoding") == "gzip":
                raw = _gzip.decompress(raw)
            payload = _json.loads(raw)
        for ev in (payload or {}).get("events", []):
            self.accepted.append(ev)

        class _Resp:
            status_code = 200
            text = "ok"

        return _Resp()


def _shipper(tmp_path: Path, **kw) -> tuple[HTTPShipper, EventBuffer]:
    buffer = EventBuffer(tmp_path / "buffer.db")
    config = Config(api_key="k", server_url="http://localhost:4000", **kw)
    return HTTPShipper(config, buffer), buffer


class TestOutageNoDataLoss:
    """Property 1: an outage must never drain the buffer."""

    def test_multi_cycle_outage_then_recovery_loses_nothing(self, tmp_path: Path):
        shipper, buffer = _shipper(tmp_path, retry_max_attempts=3, batch_size=5)
        server = MockIngestServer()

        # Enqueue 12 events.
        for i in range(12):
            buffer.add_log_event(_event(i))
        assert buffer.count() == 12

        # Server is DOWN. Simulate many drain attempts (far exceeding
        # retry_max_attempts) while the outage persists.
        server.up = False
        for _ in range(30):
            batch = buffer.get_batch(shipper.config.batch_size)
            assert batch, "buffer must not be emptied by the outage"
            result = asyncio.run(shipper._send_batch(server, batch))
            assert result == SendResult.TRANSIENT
            shipper._handle_batch_result(batch, result)

        # Nothing shipped, nothing lost.
        assert server.accepted == []
        assert buffer.count() == 12

        # Server RECOVERS: drain everything.
        server.up = True
        while buffer.count() > 0:
            batch = buffer.get_batch(shipper.config.batch_size)
            result = asyncio.run(shipper._send_batch(server, batch))
            assert result == SendResult.SUCCESS
            shipper._handle_batch_result(batch, result)

        # Exactly the 12 original events shipped, in order, no dupes.
        assert buffer.count() == 0
        messages = [e["message"] for e in server.accepted]
        assert messages == [f"Message {i}" for i in range(12)]

    def test_flush_on_shutdown_keeps_unsent_during_outage(self, tmp_path: Path):
        shipper, buffer = _shipper(tmp_path, batch_size=5)
        server = MockIngestServer()
        server.up = False

        for i in range(6):
            buffer.add_log_event(_event(i))

        # Monkeypatch flush to use our mock client via _handle path.
        async def _drain():
            b = buffer.get_batch(shipper.config.batch_size)
            r = await shipper._send_batch(server, b)
            shipper._handle_batch_result(b, r)

        asyncio.run(_drain())
        # Outage during shutdown flush: everything is retained.
        assert buffer.count() == 6


class TestRestartNoDuplication:
    """Property 2: persisted offsets prevent re-reading after restart."""

    def test_restart_does_not_reship_already_read_lines(self, tmp_path: Path):
        log = tmp_path / "app.log"
        log.write_text("A\nB\nC\n")

        store_db = tmp_path / "offsets.db"

        # First "run": handler reads all three lines.
        events1 = []
        store1 = FileOffsetStore(store_db)
        h1 = LogFileHandler(
            watch_path=WatchPath(path=str(tmp_path), pattern="*.log"),
            hostname="h",
            on_event=events1.append,
            offset_store=store1,
        )
        h1._process_file(str(log))
        assert [e.message for e in events1] == ["A", "B", "C"]

        # Simulate a restart: brand-new store instance over the SAME db file,
        # brand-new handler. No new content was appended.
        events2 = []
        store2 = FileOffsetStore(store_db)
        h2 = LogFileHandler(
            watch_path=WatchPath(path=str(tmp_path), pattern="*.log"),
            hostname="h",
            on_event=events2.append,
            offset_store=store2,
        )
        h2._process_file(str(log))
        # Nothing re-read -> no duplication.
        assert events2 == []

        # Now append new lines; only the NEW lines are read after restart.
        with open(log, "a") as f:
            f.write("D\nE\n")
        events3 = []
        store3 = FileOffsetStore(store_db)
        h3 = LogFileHandler(
            watch_path=WatchPath(path=str(tmp_path), pattern="*.log"),
            hostname="h",
            on_event=events3.append,
            offset_store=store3,
        )
        h3._process_file(str(log))
        assert [e.message for e in events3] == ["D", "E"]

    def test_offset_committed_after_processing(self, tmp_path: Path):
        """The offset is durable after a file is processed (lines buffered), so a
        restart resumes correctly. It is deliberately NOT committed on read alone
        — see test_watcher.test_offset_not_committed_until_buffered for the
        at-least-once guarantee that protects against a crash mid-processing."""
        log = tmp_path / "app.log"
        log.write_text("one\ntwo\n")
        store = FileOffsetStore(tmp_path / "offsets.db")
        events: list = []
        h = LogFileHandler(
            watch_path=WatchPath(path=str(tmp_path), pattern="*.log"),
            hostname="h",
            on_event=events.append,
            offset_store=store,
        )
        h._process_file(str(log))
        assert [e.message for e in events] == ["one", "two"]
        # A fresh store reading the same db sees the persisted offset.
        assert len(FileOffsetStore(tmp_path / "offsets.db").all_offsets()) == 1


class TestExponentialBackoff:
    """Real exponential backoff with jitter, capped and reset."""

    def test_backoff_doubles_and_caps(self, tmp_path: Path):
        shipper, _ = _shipper(tmp_path, retry_backoff_seconds=2.0,
                              retry_backoff_max_seconds=30.0)
        d = 2.0
        seen = [d]
        for _ in range(10):
            d = shipper._next_backoff(d)
            seen.append(d)
        # Doubles 2->4->8->16->30(cap)...
        assert seen[1] == 4.0
        assert seen[2] == 8.0
        assert max(seen) == 30.0
        assert seen[-1] == 30.0  # never exceeds the cap

    def test_jitter_within_half_to_full(self, tmp_path: Path):
        shipper, _ = _shipper(tmp_path)
        for base in (2.0, 10.0, 60.0):
            for _ in range(50):
                j = shipper._apply_jitter(base)
                assert base / 2.0 <= j <= base

    def test_jitter_zero_stays_zero(self, tmp_path: Path):
        shipper, _ = _shipper(tmp_path)
        assert shipper._apply_jitter(0) == 0.0


class TestBufferCapacityCap:
    """Oldest-drop cap bounds the buffer without silent transient loss."""

    def test_row_cap_drops_oldest_and_counts(self, tmp_path: Path):
        buffer = EventBuffer(tmp_path / "buffer.db", max_rows=10)
        for i in range(25):
            buffer.add_log_event(_event(i))
        # Capped at 10 rows; 15 oldest dropped.
        assert buffer.count() == 10
        assert buffer.dropped_count == 15
        # The survivors are the NEWEST events (10..24).
        batch = buffer.get_batch(100)
        messages = [b[2]["message"] for b in batch]
        assert messages[0] == "Message 15"
        assert messages[-1] == "Message 24"

    def test_byte_cap_drops_oldest(self, tmp_path: Path):
        # Tiny byte cap forces eviction after a few inserts.
        buffer = EventBuffer(tmp_path / "buffer.db", max_rows=1_000_000, max_bytes=800)
        for i in range(50):
            buffer.add_log_event(_event(i))
        assert buffer.total_bytes() <= 800
        assert buffer.dropped_count > 0


class TestConfigValidation:
    """Negative/zero settings are clamped; server_url is normalized."""

    def test_zero_and_negative_clamped(self):
        c = Config(batch_size=0, batch_interval_seconds=0,
                   retry_max_attempts=-3, retry_backoff_seconds=-1)
        assert c.batch_size == 1
        assert c.batch_interval_seconds > 0
        assert c.retry_max_attempts >= 1
        assert c.retry_backoff_seconds > 0

    def test_backoff_cap_at_least_base(self):
        c = Config(retry_backoff_seconds=10.0, retry_backoff_max_seconds=1.0)
        assert c.retry_backoff_max_seconds >= c.retry_backoff_seconds

    def test_server_url_trailing_slash_stripped(self):
        c = Config(server_url="http://host:4000/")
        assert c.server_url == "http://host:4000"
        # And the derived ingest URL has no double slash.
        assert f"{c.server_url}/api/ingest/agent" == "http://host:4000/api/ingest/agent"

    def test_windows_events_poll_interval_clamped(self):
        c = Config()
        c.windows_events.poll_interval = 0
        c.normalize()
        assert c.windows_events.poll_interval >= 1


class TestUnconfiguredHold:
    """An unconfigured agent HOLDS events instead of failing them."""

    def test_no_api_key_returns_hold_and_retains(self, tmp_path: Path):
        buffer = EventBuffer(tmp_path / "buffer.db")
        config = Config(api_key="", server_url="http://localhost:4000")
        shipper = HTTPShipper(config, buffer)

        buffer.add_log_event(_event(0))
        batch = buffer.get_batch(10)
        result = asyncio.run(shipper._send_batch(object(), batch))  # client unused
        assert result == SendResult.HOLD

        # HOLD retains everything; nothing counted as failed.
        shipper._handle_batch_result(batch, result)
        assert buffer.count() == 1
        assert shipper._events_failed == 0


def test_windows_event_local_time_to_utc():
    """Windows local TimeGenerated must convert to correct UTC (fix #5)."""
    from datetime import datetime, timezone, timedelta
    from lognog_in.collectors.windows_events import local_event_time_to_utc_iso

    # Aware datetime at +05:00 -> UTC is 5h earlier, and labelled correctly.
    aware = datetime(2024, 1, 15, 12, 0, 0, tzinfo=timezone(timedelta(hours=5)))
    out = local_event_time_to_utc_iso(aware)
    parsed = datetime.fromisoformat(out)
    assert parsed == datetime(2024, 1, 15, 7, 0, 0, tzinfo=timezone.utc)

    # A naive datetime is interpreted as local time (via timestamp()), producing
    # a valid, timezone-aware UTC value (exact value depends on host tz).
    naive = datetime(2024, 1, 15, 12, 0, 0)
    out2 = local_event_time_to_utc_iso(naive)
    assert datetime.fromisoformat(out2).tzinfo is not None
