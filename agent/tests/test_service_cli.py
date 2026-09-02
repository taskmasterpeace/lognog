"""Service / CLI plumbing: frozen-EXE service binary, dispatcher fallback,
console attach, and the CLI's new commands."""

import sys
from pathlib import Path

import pytest

from lognog_in import service as service_mod
from lognog_in import main as main_mod
from lognog_in.config import Config


class TestServiceHelpers:
    def test_service_binary_unfrozen(self, monkeypatch):
        monkeypatch.setattr(sys, "frozen", False, raising=False)
        exe, args = service_mod.service_binary()
        assert exe == sys.executable
        assert args == "-m lognog_in --service run"

    def test_service_binary_frozen(self, monkeypatch):
        monkeypatch.setattr(sys, "frozen", True, raising=False)
        exe, args = service_mod.service_binary()
        assert exe == sys.executable
        assert args == "--service run"

    def test_console_launch_error_detection(self):
        class Err(Exception):
            def __init__(self, winerror):
                self.winerror = winerror
        assert service_mod.is_console_launch_error(Err(1063))
        assert not service_mod.is_console_launch_error(Err(5))
        assert not service_mod.is_console_launch_error(RuntimeError("x"))

    def test_unknown_action(self, capsys):
        assert service_mod.dispatch_service_command("bogus") == 2
        assert "Supported" in capsys.readouterr().err

    @pytest.mark.skipif(sys.platform != "win32", reason="Windows only")
    def test_status_query_does_not_raise(self):
        text = service_mod.service_status()
        assert isinstance(text, str) and text


class TestConsoleAttach:
    def test_wants_console(self):
        assert main_mod.wants_console(["status"])
        assert main_mod.wants_console(["--version"])
        assert main_mod.wants_console(["--service", "install"])
        assert not main_mod.wants_console([])
        assert not main_mod.wants_console(["--headless"])

    def test_attach_is_noop_when_not_frozen(self, monkeypatch):
        monkeypatch.setattr(sys, "frozen", False, raising=False)
        assert main_mod.attach_parent_console() is False


class TestCli:
    def test_version_command(self, capsys):
        assert main_mod.main(["version"]) == 0
        assert "lognog-in" in capsys.readouterr().out

    def test_status_reports_new_settings(self, tmp_path: Path, capsys):
        cfg = tmp_path / "config.yaml"
        Config(server_url="http://s", api_key="k", tags={"env": "prod"}, index="ops").save(cfg)
        assert main_mod.main(["--config", str(cfg), "status"]) == 0
        out = capsys.readouterr().out
        assert "env=prod" in out
        assert "Default index: ops" in out
        assert "Windows Events:" in out

    def test_flush_with_empty_buffer(self, tmp_path: Path, capsys, monkeypatch):
        monkeypatch.setattr(Config, "get_data_dir", classmethod(lambda cls: tmp_path))
        cfg = tmp_path / "config.yaml"
        Config(server_url="http://s", api_key="k").save(cfg)
        assert main_mod.main(["--config", str(cfg), "flush"]) == 0
        assert "empty" in capsys.readouterr().out.lower()

    def test_send_test_requires_config(self, tmp_path: Path, capsys, monkeypatch):
        monkeypatch.setattr(Config, "get_data_dir", classmethod(lambda cls: tmp_path))
        assert main_mod.main(["--config", str(tmp_path / "none.yaml"), "send-test"]) == 1
        assert "not configured" in capsys.readouterr().out.lower()
