"""Tests for the HTTP shipper retry / data-loss behavior (issue #42)."""

import asyncio
from pathlib import Path

import pytest

from lognog_in.config import Config
from lognog_in.buffer import EventBuffer, LogEvent
from lognog_in.shipper import HTTPShipper, SendResult, ConnectionStatus


def _make_event(i: int) -> LogEvent:
    return LogEvent(
        timestamp="2024-01-15T10:30:00Z",
        hostname="testhost",
        source="app.log",
        source_type="file",
        file_path="/var/log/app.log",
        message=f"Message {i}",
        metadata={},
    )


class FakeResponse:
    """Minimal stand-in for an httpx.Response."""

    def __init__(self, status_code: int):
        self.status_code = status_code
        self.text = f"status {status_code}"


class FakeClient:
    """Fake httpx.AsyncClient that returns a queued/fixed status code."""

    def __init__(self, status_code: int = 200):
        self.status_code = status_code
        self.calls = 0
        self.batch_ids: list[str] = []

    async def post(self, url, json=None, headers=None, **kwargs):
        self.calls += 1
        if headers and "X-Batch-Id" in headers:
            self.batch_ids.append(headers["X-Batch-Id"])
        return FakeResponse(self.status_code)


def _shipper(tmp_path: Path, **config_kwargs) -> tuple[HTTPShipper, EventBuffer]:
    buffer = EventBuffer(tmp_path / "buffer.db")
    config = Config(api_key="test-key", server_url="http://localhost:4000", **config_kwargs)
    shipper = HTTPShipper(config, buffer)
    return shipper, buffer


class TestSendBatchClassification:
    """_send_batch should classify HTTP responses into SendResults."""

    def test_200_is_success(self, tmp_path: Path):
        shipper, buffer = _shipper(tmp_path)
        client = FakeClient(200)
        batch = [(1, "log", _make_event(0).to_dict())]
        result = asyncio.run(shipper._send_batch(client, batch))
        assert result == SendResult.SUCCESS

    @pytest.mark.parametrize("status", [400, 413, 422, 404])
    def test_4xx_is_permanent(self, tmp_path: Path, status: int):
        shipper, buffer = _shipper(tmp_path)
        client = FakeClient(status)
        batch = [(1, "log", _make_event(0).to_dict())]
        result = asyncio.run(shipper._send_batch(client, batch))
        assert result == SendResult.PERMANENT

    @pytest.mark.parametrize("status", [408, 429, 500, 502, 503])
    def test_retryable_is_transient(self, tmp_path: Path, status: int):
        shipper, buffer = _shipper(tmp_path)
        client = FakeClient(status)
        batch = [(1, "log", _make_event(0).to_dict())]
        result = asyncio.run(shipper._send_batch(client, batch))
        assert result == SendResult.TRANSIENT

    def test_401_is_transient(self, tmp_path: Path):
        shipper, buffer = _shipper(tmp_path)
        client = FakeClient(401)
        batch = [(1, "log", _make_event(0).to_dict())]
        result = asyncio.run(shipper._send_batch(client, batch))
        assert result == SendResult.TRANSIENT

    def test_batch_id_header_sent_and_stable_within_attempt(self, tmp_path: Path):
        """Each send carries an X-Batch-Id idempotency header."""
        shipper, buffer = _shipper(tmp_path)
        client = FakeClient(200)
        batch = [(1, "log", _make_event(0).to_dict())]
        asyncio.run(shipper._send_batch(client, batch))
        assert len(client.batch_ids) == 1
        assert client.batch_ids[0]  # non-empty UUID string


class TestPoisonBatchPurge:
    """A permanently-failing (transient) head batch must eventually be purged."""

    def test_poison_batch_purged_after_max_attempts_then_newer_ships(self, tmp_path: Path):
        shipper, buffer = _shipper(tmp_path, retry_max_attempts=3, batch_size=1)

        # Two events; the first is "poison" (server keeps returning 503).
        poison_id = buffer.add_log_event(_make_event(0))
        good_id = buffer.add_log_event(_make_event(1))
        assert buffer.count() == 2

        failing_client = FakeClient(503)  # transient -> retried

        # Simulate the loop fetching the oldest batch (the poison event) and
        # failing repeatedly. After retry_max_attempts transient failures the
        # stale-purge should drop it so the queue can advance.
        for _ in range(5):
            batch = buffer.get_batch(shipper.config.batch_size)
            assert batch, "buffer should not be empty while poison event remains"
            head_id = batch[0][0]
            if head_id != poison_id:
                # Poison event was purged; the head is now the good event.
                break
            result = asyncio.run(shipper._send_batch(failing_client, batch))
            assert result == SendResult.TRANSIENT
            shipper._handle_batch_result(batch, result)
        else:
            pytest.fail("poison event was never purged")

        # Poison event is gone; the good event survives and is next in line.
        batch = buffer.get_batch(shipper.config.batch_size)
        assert batch[0][0] == good_id

        # Now the server recovers; the good event ships successfully.
        ok_client = FakeClient(200)
        result = asyncio.run(shipper._send_batch(ok_client, batch))
        assert result == SendResult.SUCCESS
        shipper._handle_batch_result(batch, result)
        assert buffer.count() == 0


class TestPermanentFailureDrops:
    """A 4xx response must drop the batch immediately (no infinite retry)."""

    def test_4xx_drops_batch_no_infinite_retry(self, tmp_path: Path):
        shipper, buffer = _shipper(tmp_path, batch_size=10)

        for i in range(3):
            buffer.add_log_event(_make_event(i))
        assert buffer.count() == 3

        bad_client = FakeClient(422)  # permanent
        batch = buffer.get_batch(shipper.config.batch_size)
        result = asyncio.run(shipper._send_batch(bad_client, batch))
        assert result == SendResult.PERMANENT

        # Handling a permanent result drops the batch outright.
        shipper._handle_batch_result(batch, result)
        assert buffer.count() == 0

    def test_handle_transient_keeps_events_until_max(self, tmp_path: Path):
        """Transient failures keep events until they exceed retry_max_attempts."""
        shipper, buffer = _shipper(tmp_path, retry_max_attempts=2, batch_size=10)
        buffer.add_log_event(_make_event(0))

        batch = buffer.get_batch(shipper.config.batch_size)

        # First transient failure: attempts -> 1, still buffered.
        shipper._handle_batch_result(batch, SendResult.TRANSIENT)
        assert buffer.count() == 1

        # Second transient failure: attempts -> 2 (>= max), purged.
        batch = buffer.get_batch(shipper.config.batch_size)
        shipper._handle_batch_result(batch, SendResult.TRANSIENT)
        assert buffer.count() == 0
