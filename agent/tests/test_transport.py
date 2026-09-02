"""Shipper transport behaviour added in 0.2.0: gzip, drain pacing, tags/index
enrichment, heartbeats, TLS options and the version header."""

import asyncio
import gzip
import json
from pathlib import Path

from lognog_in import __version__
from lognog_in.config import Config
from lognog_in.buffer import EventBuffer, LogEvent, FIMEvent
from lognog_in.shipper import HTTPShipper, SendResult, encode_batch_body, COMPRESS_MIN_BYTES


def _event(i: int, **kw) -> LogEvent:
    base = dict(
        timestamp="2026-09-02T10:00:00Z", hostname="h", source="lognog-in", source_type="file",
        file_path="/var/log/app.log", message=f"m{i}", metadata={},
    )
    base.update(kw)
    return LogEvent(**base)


class CapturingClient:
    def __init__(self, status_code: int = 200):
        self.status_code = status_code
        self.requests: list[dict] = []

    async def post(self, url, content=None, headers=None, **kwargs):
        self.requests.append({"url": url, "content": content, "headers": headers or {}, **kwargs})

        class R:
            pass
        r = R()
        r.status_code = self.status_code
        r.text = "ok"
        return r


class TestEncodeBatchBody:
    def test_small_bodies_are_plain_json(self):
        body, headers = encode_batch_body({"events": [{"a": 1}]}, compress=True)
        assert headers == {"Content-Type": "application/json"}
        assert json.loads(body) == {"events": [{"a": 1}]}

    def test_large_bodies_are_gzipped(self):
        payload = {"events": [{"message": "x" * 200} for _ in range(20)]}
        body, headers = encode_batch_body(payload, compress=True)
        assert headers["Content-Encoding"] == "gzip"
        assert json.loads(gzip.decompress(body)) == payload
        assert len(body) < COMPRESS_MIN_BYTES * 2

    def test_compression_can_be_disabled(self):
        payload = {"events": [{"message": "x" * 200} for _ in range(20)]}
        body, headers = encode_batch_body(payload, compress=False)
        assert "Content-Encoding" not in headers
        assert json.loads(body) == payload


class TestSendBatchWire:
    def test_sends_bytes_with_version_and_batch_id(self, tmp_path: Path):
        buffer = EventBuffer(tmp_path / "b.db")
        config = Config(api_key="k", server_url="http://srv:4000", compress_payloads=False)
        shipper = HTTPShipper(config, buffer)
        client = CapturingClient(200)
        batch = [(1, "log", _event(0).to_dict())]
        assert asyncio.run(shipper._send_batch(client, batch)) == SendResult.SUCCESS
        req = client.requests[0]
        assert req["url"] == "http://srv:4000/api/ingest/agent"
        assert req["headers"]["User-Agent"] == f"LogNog-In/{__version__}"
        assert req["headers"]["Authorization"] == "ApiKey k"
        sent = json.loads(req["content"])
        assert sent["batch_id"] == req["headers"]["X-Batch-Id"]
        assert sent["events"][0]["type"] == "log"
        assert sent["events"][0]["message"] == "m0"

    def test_gzip_on_the_wire(self, tmp_path: Path):
        buffer = EventBuffer(tmp_path / "b.db")
        config = Config(api_key="k", server_url="http://srv:4000", compress_payloads=True)
        shipper = HTTPShipper(config, buffer)
        client = CapturingClient(200)
        batch = [(i, "log", _event(i, message="y" * 100).to_dict()) for i in range(30)]
        asyncio.run(shipper._send_batch(client, batch))
        req = client.requests[0]
        assert req["headers"]["Content-Encoding"] == "gzip"
        assert len(json.loads(gzip.decompress(req["content"]))["events"]) == 30
        assert shipper.get_stats()["bytes_sent"] == len(req["content"])


class TestPacing:
    def test_full_batch_drains_immediately(self, tmp_path: Path):
        shipper = HTTPShipper(Config(api_key="k", batch_size=10, batch_interval_seconds=5.0), EventBuffer(tmp_path / "b.db"))
        assert shipper._wait_after_success(10) == 0.0
        assert shipper._wait_after_success(3) == 5.0


class TestEnrichment:
    def test_tags_and_default_index_applied(self, tmp_path: Path):
        buffer = EventBuffer(tmp_path / "b.db")
        config = Config(api_key="k", tags={"env": "prod", "role": "web"}, index="Ops-Logs")
        shipper = HTTPShipper(config, buffer)
        shipper.queue_log_event(_event(1, metadata={"role": "db"}))
        shipper.queue_log_events([_event(2, index="custom")])
        rows = buffer.get_batch(10)
        first = rows[0][2]
        assert first["metadata"] == {"env": "prod", "role": "db"}  # event wins over tag
        assert first["index"] == "ops-logs"                         # normalised
        assert rows[1][2]["index"] == "custom"

    def test_fim_events_get_tags(self, tmp_path: Path):
        buffer = EventBuffer(tmp_path / "b.db")
        shipper = HTTPShipper(Config(api_key="k", tags={"env": "prod"}), buffer)
        shipper.queue_fim_event(FIMEvent(
            timestamp="t", hostname="h", source="s", source_type="fim", event_type="modified",
            file_path="/etc/passwd", previous_hash=None, current_hash="x", file_owner=None,
            file_permissions=None, metadata={},
        ))
        assert buffer.get_batch(1)[0][2]["metadata"] == {"env": "prod"}


class TestHeartbeat:
    def test_heartbeat_event_shape(self, tmp_path: Path):
        buffer = EventBuffer(tmp_path / "b.db")
        config = Config(api_key="k", hostname="box1", heartbeat_interval_seconds=60)
        shipper = HTTPShipper(config, buffer, stats_provider=lambda: {"watch_paths": 3})
        hb = shipper.build_heartbeat()
        assert hb.source_type == "agent_heartbeat"
        assert hb.hostname == "box1"
        assert hb.metadata["agent_version"] == __version__
        assert hb.metadata["watch_paths"] == 3
        assert hb.metadata["events_buffered"] == 0
        assert "heartbeat" in hb.message

    def test_heartbeat_enqueued_once_per_interval(self, tmp_path: Path):
        buffer = EventBuffer(tmp_path / "b.db")
        shipper = HTTPShipper(Config(api_key="k", heartbeat_interval_seconds=60), buffer)
        shipper._maybe_heartbeat()
        shipper._maybe_heartbeat()
        assert buffer.count() == 1
        assert shipper.get_stats()["heartbeats_sent"] == 1

    def test_heartbeat_disabled(self, tmp_path: Path):
        buffer = EventBuffer(tmp_path / "b.db")
        shipper = HTTPShipper(Config(api_key="k", heartbeat_interval_seconds=0), buffer)
        shipper._maybe_heartbeat()
        assert buffer.count() == 0


class TestTlsOptions:
    def test_verify_value(self):
        assert Config(verify_tls=True).httpx_verify() is True
        assert Config(verify_tls=False).httpx_verify() is False
        assert Config(ca_bundle="/etc/ssl/private-ca.pem").httpx_verify() == "/etc/ssl/private-ca.pem"
