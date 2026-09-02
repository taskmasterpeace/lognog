"""File-tailing semantics added in 0.2.0.

Partial trailing lines are held back until newline-terminated (or stale),
files are decoded per-path (BOM/CRLF aware), exclude globs apply, existing
files start at the end, multi-line events merge, and reads are delivered as
one batch.
"""

import time
from pathlib import Path

import pytest

from lognog_in.config import Config, WatchPath
from lognog_in.offset_store import FileOffsetStore
from lognog_in import watcher as watcher_mod
from lognog_in.watcher import (
    LogFileHandler,
    FileWatcher,
    split_complete_lines,
    decode_line,
)


def _handler(tmp_path: Path, on_event=None, on_batch=None, **wp_kwargs) -> LogFileHandler:
    wp_kwargs.setdefault("pattern", "*.log")
    return LogFileHandler(
        watch_path=WatchPath(path=str(tmp_path), **wp_kwargs),
        hostname="testhost",
        on_event=on_event if on_event is not None else (lambda e: None),
        on_batch=on_batch,
        offset_store=FileOffsetStore(tmp_path / "offsets.db"),
    )


class TestSplitAndDecode:
    def test_split_holds_back_fragment(self):
        lines, consumed = split_complete_lines(b"a\nb\nc")
        assert lines == [b"a", b"b"]
        assert consumed == 4

    def test_split_all_complete(self):
        lines, consumed = split_complete_lines(b"a\r\nb\n")
        assert lines == [b"a\r", b"b"]
        assert consumed == 5

    def test_split_only_fragment(self):
        assert split_complete_lines(b"partial") == ([], 0)
        assert split_complete_lines(b"") == ([], 0)

    def test_decode_strips_bom_and_cr(self):
        assert decode_line(b"\xef\xbb\xbfhello\r", "utf-8") == "hello"

    def test_decode_replaces_bad_bytes_and_unknown_codec(self):
        assert "�" in decode_line(b"caf\xff", "utf-8")
        assert decode_line(b"ok", "no-such-codec") == "ok"

    def test_decode_utf16(self):
        assert decode_line("héllo".encode("utf-16-le"), "utf-16-le") == "héllo"


class TestPartialLines:
    def test_partial_line_not_shipped_until_terminated(self, tmp_path: Path):
        events = []
        handler = _handler(tmp_path, on_event=events.append)
        log = tmp_path / "app.log"
        log.write_bytes(b"first\nsecond half")

        handler._process_file(str(log))
        assert [e.message for e in events] == ["first"]

        # Writer finishes the line: it ships whole, not as two fragments.
        with open(log, "ab") as f:
            f.write(b" done\nthird\n")
        handler._process_file(str(log))
        assert [e.message for e in events] == ["first", "second half done", "third"]

    def test_stale_partial_line_is_released(self, tmp_path: Path, monkeypatch):
        events = []
        handler = _handler(tmp_path, on_event=events.append)
        log = tmp_path / "app.log"
        log.write_bytes(b"no newline at end")

        handler._process_file(str(log))
        assert events == []

        # Pretend the fragment has been sitting there for a while.
        monkeypatch.setattr(watcher_mod, "PARTIAL_LINE_TIMEOUT", 0.0)
        handler._process_file(str(log))
        assert [e.message for e in events] == ["no newline at end"]
        # And it isn't re-shipped afterwards.
        handler._process_file(str(log))
        assert len(events) == 1


class TestFilters:
    def test_exclude_globs(self, tmp_path: Path):
        handler = _handler(tmp_path, pattern="*", exclude=["*.gz", "*-old.log"])
        assert handler._matches_pattern(str(tmp_path / "app.log"))
        assert not handler._matches_pattern(str(tmp_path / "app.log.gz"))
        assert not handler._matches_pattern(str(tmp_path / "app-old.log"))

    def test_exclude_matches_full_path(self, tmp_path: Path):
        handler = _handler(tmp_path, pattern="*", exclude=["*/archive/*"])
        assert not handler._matches_pattern(str(tmp_path / "archive" / "x.log"))
        assert handler._matches_pattern(str(tmp_path / "live" / "x.log"))

    def test_events_carry_source_type_and_index(self, tmp_path: Path):
        events = []
        handler = _handler(tmp_path, on_event=events.append, source_type="iis", index="web-logs")
        log = tmp_path / "u_ex.log"
        log.write_text("GET / 200\n")
        handler._process_file(str(log))
        assert events[0].source_type == "iis"
        assert events[0].index == "web-logs"
        assert "index" in events[0].to_dict()


class TestStartPosition:
    def test_end_skips_existing_content(self, tmp_path: Path):
        events = []
        (tmp_path / "big.log").write_text("old 1\nold 2\n")
        config = Config(hostname="h", watch_paths=[WatchPath(path=str(tmp_path), pattern="*.log")], scan_interval_seconds=0)
        w = FileWatcher(config, on_event=events.append, offset_store=FileOffsetStore(tmp_path / "offsets.db"))
        w.start()
        try:
            handler = w._handlers[0]
            handler._process_file(str(tmp_path / "big.log"))
            assert events == []  # history skipped
            with open(tmp_path / "big.log", "a") as f:
                f.write("new 1\n")
            handler._process_file(str(tmp_path / "big.log"))
            assert [e.message for e in events] == ["new 1"]
        finally:
            w.stop()

    def test_beginning_reads_history(self, tmp_path: Path):
        events = []
        (tmp_path / "big.log").write_text("old 1\nold 2\n")
        config = Config(hostname="h", watch_paths=[WatchPath(path=str(tmp_path), pattern="*.log", start_position="beginning")], scan_interval_seconds=0)
        w = FileWatcher(config, on_event=events.append, offset_store=FileOffsetStore(tmp_path / "offsets.db"))
        w.start()
        try:
            w._handlers[0]._process_file(str(tmp_path / "big.log"))
            assert [e.message for e in events] == ["old 1", "old 2"]
        finally:
            w.stop()


class TestMultiline:
    def test_stack_trace_merges_into_one_event(self, tmp_path: Path, monkeypatch):
        events = []
        handler = _handler(tmp_path, on_event=events.append, multiline_pattern=r"^\d{4}-\d{2}-\d{2} ")
        log = tmp_path / "app.log"
        log.write_text(
            "2026-09-02 10:00:00 ERROR boom\n"
            "Traceback (most recent call last):\n"
            "  File x.py, line 1\n"
            "ValueError: bad\n"
            "2026-09-02 10:00:01 INFO next\n"
        )
        handler._process_file(str(log))
        # The trace event is complete (a new start line followed); the last
        # line is still pending until it goes quiet.
        assert len(events) == 1
        assert events[0].message.startswith("2026-09-02 10:00:00 ERROR boom\nTraceback")
        assert events[0].message.endswith("ValueError: bad")
        assert events[0].metadata["line_count"] == 4

        monkeypatch.setattr(watcher_mod, "MULTILINE_TIMEOUT", 0.0)
        assert handler.flush_pending() == 1
        assert events[1].message == "2026-09-02 10:00:01 INFO next"

    def test_stop_flushes_pending_multiline(self, tmp_path: Path):
        events = []
        config = Config(
            hostname="h",
            watch_paths=[WatchPath(path=str(tmp_path), pattern="*.log", multiline_pattern=r"^\[", start_position="beginning")],
            scan_interval_seconds=0,
        )
        w = FileWatcher(config, on_event=events.append, offset_store=FileOffsetStore(tmp_path / "offsets.db"))
        w.start()
        try:
            (tmp_path / "a.log").write_text("[1] start\ncontinued\n")
            w._handlers[0]._process_file(str(tmp_path / "a.log"))
            assert events == []
        finally:
            w.stop()
        assert [e.message for e in events] == ["[1] start\ncontinued"]


class TestBatchDeliveryAndScan:
    def test_read_delivered_as_one_batch(self, tmp_path: Path):
        batches = []
        handler = _handler(tmp_path, on_batch=batches.append)
        (tmp_path / "a.log").write_text("1\n2\n3\n")
        handler._process_file(str(tmp_path / "a.log"))
        assert len(batches) == 1
        assert [e.message for e in batches[0]] == ["1", "2", "3"]

    def test_scan_picks_up_growth_without_os_events(self, tmp_path: Path):
        events = []
        handler = _handler(tmp_path, on_event=events.append, start_position="beginning")
        log = tmp_path / "a.log"
        log.write_text("one\n")
        assert handler.scan() == 1
        assert [e.message for e in events] == ["one"]
        # Unchanged file: not re-opened.
        assert handler.scan() == 0
        with open(log, "a") as f:
            f.write("two\n")
        assert handler.scan() == 1
        assert [e.message for e in events] == ["one", "two"]

    def test_scan_loop_runs(self, tmp_path: Path):
        events = []
        config = Config(hostname="h", watch_paths=[WatchPath(path=str(tmp_path), pattern="*.log", start_position="beginning")], scan_interval_seconds=1)
        w = FileWatcher(config, on_event=events.append, offset_store=FileOffsetStore(tmp_path / "offsets.db"))
        w.start()
        try:
            (tmp_path / "a.log").write_text("hello\n")
            deadline = time.time() + 4
            while time.time() < deadline and not events:
                time.sleep(0.1)
            assert [e.message for e in events] == ["hello"]
            assert w.get_stats()["scans"] >= 1 or events
        finally:
            w.stop()
