"""Alert pop-ups when the server refuses this agent's API key (key lock).

The server answers 403 to GET /api/ingest/notifications when the key lacks
'read' (pop-ups carry alert text from every index). The agent then asks only
once an hour, so it does not write an audit row on the server every 30
seconds, and warns once. A new key or server saved in the agent's own
settings ends that wait at once, also when the settings window writes into
the Config the shipper already holds (it does: gui.py _save).

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
        # the wait ends when the key is saved, not at the next check
        assert shipper.get_stats()["notifications_refused"] is False
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


def test_key_changed_in_place_by_the_settings_window_is_asked_at_once(tmp_path):
    # The settings window sets server_url / api_key on the same Config object
    # the shipper holds, then calls on_save(self.config): old and new are one
    # object, so comparing them can never see the change.
    shipper, client, tick, restore = _setup(tmp_path)
    try:
        tick(0)
        assert client.calls == 1
        held = shipper.config
        held.batch_size = held.batch_size + 1  # another setting: the wait stays
        shipper.update_config(held)
        tick(31)
        assert client.calls == 1
        client.code = 200
        held.api_key = "kl-new-key"  # what gui.py _save does
        shipper.update_config(held)
        assert shipper.config is held
        tick(1)
        assert client.calls == 2
        assert client.keys[-1] == "ApiKey kl-new-key"
        assert shipper.get_stats()["notifications_refused"] is False
    finally:
        restore()


def test_key_changed_in_place_without_update_config_is_asked_at_once(tmp_path):
    # Even if nothing tells the shipper, the next check sees the key is not
    # the refused one.
    shipper, client, tick, restore = _setup(tmp_path)
    try:
        tick(0)
        shipper.config.server_url = "http://localhost:4001"
        tick(1)
        assert client.calls == 2
        # refused again with the new server: back to hourly
        tick(31)
        assert client.calls == 2
        tick(3600)
        assert client.calls == 3
    finally:
        restore()


def test_key_changed_while_the_refused_request_was_out_is_asked_at_once(tmp_path):
    # The refusal belongs to the key the request was sent with, not to the
    # key the settings window saved while it was on its way.
    shipper, client, tick, restore = _setup(tmp_path)
    try:
        real_get = client.get

        async def get_then_change_key(*args, **kwargs):
            out = await real_get(*args, **kwargs)
            shipper.config.api_key = "kl-saved-meanwhile"
            return out

        client.get = get_then_change_key
        tick(0)
        assert client.keys == ["ApiKey kl-old-key"]
        client.get = real_get
        tick(1)
        assert client.calls == 2
        assert client.keys[-1] == "ApiKey kl-saved-meanwhile"
    finally:
        restore()


def test_new_key_whose_check_fails_keeps_the_30_second_tick(tmp_path):
    # A new key ends the hourly wait once. If that first check fails (the
    # server can't be reached), the agent goes back to every 30 seconds; it
    # does not ask on every pass of the loop.
    shipper, client, tick, restore = _setup(tmp_path)
    try:
        tick(0)
        assert client.calls == 1
        real_get = client.get

        async def get_then_fail(*args, **kwargs):
            await real_get(*args, **kwargs)
            raise ConnectionError("kl-r9 server not reachable")

        client.get = get_then_fail
        shipper.update_config(replace(shipper.config, api_key="kl-new-key"))
        tick(1)
        assert client.calls == 2
        client.get = real_get
        tick(5)
        tick(5)
        assert client.calls == 2
        tick(21)
        assert client.calls == 3
        assert client.keys[-1] == "ApiKey kl-new-key"
    finally:
        restore()


def test_key_accepted_after_the_hour_is_no_longer_treated_as_refused(tmp_path):
    # The refused key is asked again after the hour and now accepted (its
    # permissions were fixed on the server). A later key change is an
    # ordinary change: the next check comes on the 30-second tick.
    shipper, client, tick, restore = _setup(tmp_path)
    try:
        tick(0)
        client.code = 200
        tick(3600)
        assert client.calls == 2
        assert shipper.get_stats()["notifications_refused"] is False
        shipper.config.api_key = "kl-new-key"
        shipper.update_config(shipper.config)
        tick(5)
        assert client.calls == 2
        tick(26)
        assert client.calls == 3
        assert client.keys[-1] == "ApiKey kl-new-key"
    finally:
        restore()


def test_settings_saved_with_no_refusal_keep_the_30_second_tick(tmp_path):
    # With no refusal there is no wait to end: saving settings adds no
    # extra request.
    shipper, client, tick, restore = _setup(tmp_path)
    try:
        client.code = 200
        tick(0)
        assert client.calls == 1
        shipper.update_config(replace(shipper.config, api_key="kl-new-key"))
        tick(5)
        assert client.calls == 1
        tick(26)
        assert client.calls == 2
        assert client.keys[-1] == "ApiKey kl-new-key"
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
