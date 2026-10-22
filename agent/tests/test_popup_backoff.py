"""Alert pop-ups when the server refuses this agent's API key (key lock).

The server answers 403 to GET /api/ingest/notifications when the key lacks
'read' (pop-ups carry alert text from every index). The agent then asks only
once an hour, so it does not write an audit row on the server every 30
seconds, and warns once. A new key or server saved in the agent's own
settings ends that wait at once.

No pytest import on purpose: the functions take a temporary directory and
also run under a plain runner where httpx is stubbed.
"""

import asyncio
from dataclasses import replace
from pathlib import Path

import lognog_in.shipper as shipper_mod
from lognog_in.buffer import EventBuffer
from lognog_in.config import Config
from lognog_in.shipper import HTTPShipper


class _Resp:
    def __init__(self, status_code: int):
        self.status_code = status_code

    def json(self):
        return {"notifications": []}


class _Client:
    """Answers every pop-up request with `code`; counts the requests."""

    def __init__(self, code: int):
        self.code = code
        self.calls = 0
        self.keys: list[str] = []

    async def get(self, url, params=None, headers=None, **kwargs):
        self.calls += 1
        self.keys.append((headers or {}).get("Authorization", ""))
        return _Resp(self.code)

    async def post(self, *args, **kwargs):
        return _Resp(200)


def _setup(tmp_path: Path):
    clock = [1_000_000.0]
    real_time = shipper_mod.time.time
    shipper_mod.time.time = lambda: clock[0]
    config = Config(api_key="kl-old-key", server_url="http://localhost:4000", hostname="kl-host")
    shipper = HTTPShipper(config, EventBuffer(Path(tmp_path) / "buffer.db"), on_notification=lambda *a: None)
    client = _Client(403)

    def tick(seconds: float) -> None:
        clock[0] += seconds
        asyncio.run(shipper._check_notifications(client))

    def restore() -> None:
        shipper_mod.time.time = real_time

    return shipper, client, tick, restore


def test_refused_key_is_asked_hourly(tmp_path):
    shipper, client, tick, restore = _setup(tmp_path)
    try:
        tick(0)
        assert client.calls == 1
        for _ in range(20):
            tick(31)
        assert client.calls == 1
        assert shipper.get_stats()["notifications_refused"] is True
        tick(3600)
        assert client.calls == 2
    finally:
        restore()


def test_new_key_saved_in_settings_is_asked_at_once(tmp_path):
    shipper, client, tick, restore = _setup(tmp_path)
    try:
        tick(0)
        assert client.calls == 1
        assert shipper.get_stats()["notifications_refused"] is True
        # Saving the same key (another setting changed) keeps the hourly wait.
        shipper.update_config(replace(shipper.config, batch_size=shipper.config.batch_size + 1))
        tick(31)
        assert client.calls == 1
        # A new key: asked on the next check, with the new key.
        client.code = 200
        shipper.update_config(replace(shipper.config, api_key="kl-new-key"))
        assert shipper.config.api_key == "kl-new-key"
        tick(1)
        assert client.calls == 2
        assert client.keys[-1] == "ApiKey kl-new-key"
        assert shipper.get_stats()["notifications_refused"] is False
    finally:
        restore()


def test_new_server_saved_in_settings_is_asked_at_once(tmp_path):
    shipper, client, tick, restore = _setup(tmp_path)
    try:
        tick(0)
        shipper.update_config(replace(shipper.config, server_url="http://localhost:4001"))
        tick(1)
        assert client.calls == 2
    finally:
        restore()


def test_refused_again_after_a_new_key_warns_again(tmp_path):
    import logging

    records: list[str] = []

    class _H(logging.Handler):
        def emit(self, record):
            records.append(record.getMessage())

    handler = _H()
    logging.getLogger("lognog_in.shipper").addHandler(handler)
    shipper, client, tick, restore = _setup(tmp_path)
    try:
        tick(0)
        shipper.update_config(replace(shipper.config, api_key="kl-other-key"))
        tick(1)
        warns = [m for m in records if "Alert pop-ups are off" in m]
        assert len(warns) == 2
        assert "every hour" in warns[-1]
        assert "saved in its settings" in warns[-1]
    finally:
        logging.getLogger("lognog_in.shipper").removeHandler(handler)
        restore()


def test_settings_window_says_what_popups_need(tmp_path):
    # The settings window (Tk, Windows tray app) can't be opened in this test
    # run, so its note is checked as text in the source.
    gui = (Path(shipper_mod.__file__).parent / "gui.py").read_text(encoding="utf-8")
    assert "Alert pop-ups need an API key with both 'send logs' (write) and 'read', " in gui
    assert "and no index limit. A send-logs-only key still ships logs, but gets no pop-ups." in gui
