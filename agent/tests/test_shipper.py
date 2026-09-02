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

    @pytest.mark.parametrize("status", [400, 413, 422, 410])
    def test_4xx_is_permanent(self, tmp_path: Path, status: int):
        shipper, buffer = _shipper(tmp_path)
        client = FakeClient(status)
        batch = [(1, "log", _make_event(0).to_dict())]
        result = asyncio.run(shipper._send_batch(client, batch))
        assert result == SendResult.PERMANENT

    @pytest.mark.parametrize("status", [404, 408, 429, 500, 502, 503])
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
    """A batch the server permanently REJECTS (4xx) must be dropped so the
    queue advances. Purge is driven by server rejection, never by a transient
    outage."""

    def test_permanent_reject_drops_then_newer_ships(self, tmp_path: Path):
        shipper, buffer = _shipper(tmp_path, retry_max_attempts=3, batch_size=1)

        # Two events; the first is "poison" (server rejects it with a 422).
        poison_id = buffer.add_log_event(_make_event(0))
        good_id = buffer.add_log_event(_make_event(1))
        assert buffer.count() == 2

        bad_client = FakeClient(422)  # permanent -> dropped

        batch = buffer.get_batch(shipper.config.batch_size)
        assert batch[0][0] == poison_id
        result = asyncio.run(shipper._send_batch(bad_client, batch))
        assert result == SendResult.PERMANENT
        shipper._handle_batch_result(batch, result)

        # Poison event is gone; the good event survives and is next in line.
        batch = buffer.get_batch(shipper.config.batch_size)
        assert batch[0][0] == good_id

        # Now the server accepts; the good event ships successfully.
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

    def test_handle_transient_never_purges_during_outage(self, tmp_path: Path):
        """Transient failures must NEVER drop events, no matter how many.

        This is the outage-data-loss showstopper: a connection-level / 5xx
        failure is not the event's fault, so the buffer must survive an
        arbitrarily long outage. The attempt counter is not touched and nothing
        is purged.
        """
        shipper, buffer = _shipper(tmp_path, retry_max_attempts=2, batch_size=10)
        buffer.add_log_event(_make_event(0))

        # Hammer it with far more transient failures than retry_max_attempts.
        for _ in range(50):
            batch = buffer.get_batch(shipper.config.batch_size)
            assert batch, "event must survive every transient failure"
            shipper._handle_batch_result(batch, SendResult.TRANSIENT)
            assert buffer.count() == 1

        # Once the server recovers, the event ships.
        batch = buffer.get_batch(shipper.config.batch_size)
        shipper._handle_batch_result(batch, SendResult.SUCCESS)
        assert buffer.count() == 0
