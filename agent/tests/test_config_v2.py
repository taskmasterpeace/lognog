"""Configuration additions in 0.2.0: round-trip of every setting, per-path
input options, Windows Events options, DPAPI key protection, validation."""

import sys
from pathlib import Path

import pytest
import yaml

from lognog_in.config import Config, WatchPath, WindowsEventsConfig, normalize_index_name
from lognog_in import secrets


class TestRoundTrip:
    def test_every_setting_survives_save_load(self, tmp_path: Path):
        cfg = tmp_path / "c.yaml"
        config = Config(
            server_url="https://logs.example.com/",
            api_key="lnog_secret",
            retry_backoff_max_seconds=120.0,
            buffer_max_rows=1234,
            buffer_max_bytes=5678,
            tags={"env": "prod", "role": "web"},
            index="Ops",
            verify_tls=False,
            ca_bundle="C:/certs/ca.pem",
            compress_payloads=False,
            heartbeat_interval_seconds=30,
            scan_interval_seconds=0,
            watch_paths=[WatchPath(path="C:/logs", pattern="*.log", exclude=["*.gz"], encoding="utf-16",
                                   start_position="beginning", multiline_pattern=r"^\d{4}", index="web", source_type="iis")],
            windows_events=WindowsEventsConfig(enabled=True, channels=["Security", "Microsoft-Windows-Sysmon/Operational"],
                                               event_ids=[4624], exclude_event_ids=[5156], poll_interval=7, api="modern",
                                               index="win", batch_size=300),
        )
        config.save(cfg)
        loaded = Config.load(cfg)
        assert loaded.server_url == "https://logs.example.com"
        assert loaded.api_key == "lnog_secret"
        assert loaded.retry_backoff_max_seconds == 120.0
        assert loaded.buffer_max_rows == 1234 and loaded.buffer_max_bytes == 5678
        assert loaded.tags == {"env": "prod", "role": "web"}
        assert loaded.index == "ops"
        assert loaded.verify_tls is False and loaded.ca_bundle == "C:/certs/ca.pem"
        assert loaded.compress_payloads is False
        assert loaded.heartbeat_interval_seconds == 30 and loaded.scan_interval_seconds == 0
        wp = loaded.watch_paths[0]
        assert wp.exclude == ["*.gz"] and wp.encoding == "utf-16" and wp.start_position == "beginning"
        assert wp.multiline_pattern == r"^\d{4}" and wp.index == "web" and wp.source_type == "iis"
        we = loaded.windows_events
        assert we.enabled and we.channels[1] == "Microsoft-Windows-Sysmon/Operational"
        assert we.event_ids == [4624] and we.exclude_event_ids == [5156]
        assert we.poll_interval == 7 and we.api == "modern" and we.index == "win" and we.batch_size == 300

    def test_unknown_keys_are_ignored_with_warning(self, tmp_path: Path, capsys):
        cfg = tmp_path / "c.yaml"
        cfg.write_text(yaml.dump({"server_url": "http://x", "api_key": "k", "bogus_setting": 1,
                                  "watch_paths": [{"path": "/a", "typo": True}]}))
        loaded = Config.load(cfg)
        assert loaded.server_url == "http://x"
        assert loaded.watch_paths[0].path == "/a"
        out = capsys.readouterr().out
        assert "bogus_setting" in out and "typo" in out

    def test_string_watch_paths_still_accepted(self, tmp_path: Path):
        cfg = tmp_path / "c.yaml"
        cfg.write_text(yaml.dump({"watch_paths": ["/var/log"]}))
        assert Config.load(cfg).watch_paths[0].pattern == "*"


class TestValidation:
    def test_index_normalisation(self):
        assert normalize_index_name("Web-Logs") == "web-logs"
        assert normalize_index_name(" ops_1 ") == "ops_1"
        assert normalize_index_name("bad name!") is None
        assert normalize_index_name("") is None
        assert normalize_index_name(None) is None

    def test_invalid_multiline_pattern_dropped(self, capsys):
        wp = WatchPath(path="/a", multiline_pattern="(unclosed")
        assert wp.multiline_pattern is None
        assert "multiline_pattern" in capsys.readouterr().out

    def test_watchpath_defaults_and_coercion(self):
        wp = WatchPath(path="/a", exclude="*.gz", start_position="middle", encoding="")
        assert wp.exclude == ["*.gz"]
        assert wp.start_position == "end"
        assert wp.encoding == "utf-8"
        assert wp.source_type == "file"

    def test_windows_events_coercion(self):
        we = WindowsEventsConfig(channels="Security", event_ids=["4624", "x", 4625], api="weird", poll_interval=0, batch_size=-1)
        assert we.channels == ["Security"]
        assert we.event_ids == [4624, 4625]
        assert we.api == "auto"
        assert we.poll_interval == 10 and we.batch_size == 200

    def test_intervals_and_tags_clamped(self):
        c = Config(heartbeat_interval_seconds=-5, scan_interval_seconds="x", tags={"a": 1, "": "drop", "n": None})
        assert c.heartbeat_interval_seconds == 60
        assert c.scan_interval_seconds == 10
        assert c.tags == {"a": 1, "n": "None"}


class TestApiKeyProtection:
    @pytest.mark.skipif(sys.platform != "win32", reason="DPAPI is Windows-only")
    def test_key_is_not_stored_in_plaintext_on_windows(self, tmp_path: Path):
        assert secrets.is_available()
        cfg = tmp_path / "c.yaml"
        Config(server_url="http://x", api_key="lnog_super_secret").save(cfg)
        raw = yaml.safe_load(cfg.read_text())
        assert raw["api_key"] == ""
        assert raw["api_key_protected"].startswith("dpapi:")
        assert "lnog_super_secret" not in cfg.read_text()
        assert Config.load(cfg).api_key == "lnog_super_secret"

    @pytest.mark.skipif(sys.platform != "win32", reason="DPAPI is Windows-only")
    def test_protect_unprotect_roundtrip(self):
        token = secrets.protect_secret("hello")
        assert token and token.startswith("dpapi:")
        assert secrets.unprotect_secret(token) == "hello"
        assert secrets.unprotect_secret("dpapi:not-base64!!") is None

    def test_protection_can_be_disabled(self, tmp_path: Path):
        cfg = tmp_path / "c.yaml"
        Config(server_url="http://x", api_key="plain", protect_api_key=False).save(cfg)
        assert yaml.safe_load(cfg.read_text())["api_key"] == "plain"
        assert Config.load(cfg).api_key == "plain"

    def test_unreadable_token_warns_and_leaves_key_empty(self, tmp_path: Path, capsys):
        cfg = tmp_path / "c.yaml"
        cfg.write_text(yaml.dump({"server_url": "http://x", "api_key": "", "api_key_protected": "dpapi:AAAA"}))
        loaded = Config.load(cfg)
        assert loaded.api_key == ""
        assert "could not decrypt" in capsys.readouterr().out.lower()
