"""Modern (EvtQuery/XML) Windows Event Log reader.

The XML parsing, XPath building and severity mapping are pure functions and
run everywhere; the live-channel tests run only on Windows with pywin32.
"""

import sys
from pathlib import Path

import pytest

from lognog_in.collectors.windows_events import (
    parse_event_xml,
    build_xpath,
    severity_from_level,
    normalize_system_time,
    synthesize_message,
    XPATH_MAX_IDS,
)

SECURITY_4625 = """<Event xmlns='http://schemas.microsoft.com/win/2004/08/events/event'>
<System><Provider Name='Microsoft-Windows-Security-Auditing' Guid='{54849625-5478-4994-a5ba-3e3b0328c30d}'/>
<EventID>4625</EventID><Version>0</Version><Level>0</Level><Task>12544</Task><Opcode>0</Opcode>
<Keywords>0x8010000000000000</Keywords><TimeCreated SystemTime='2026-09-02T15:04:30.1234567Z'/>
<EventRecordID>987654</EventRecordID><Correlation ActivityID='{aaaa-bbbb}'/><Execution ProcessID='788' ThreadID='1234'/>
<Channel>Security</Channel><Computer>WS01.corp.local</Computer><Security UserID='S-1-5-18'/></System>
<EventData><Data Name='SubjectUserSid'>S-1-0-0</Data><Data Name='TargetUserName'>bob</Data>
<Data Name='TargetDomainName'>CORP</Data><Data Name='Status'>0xc000006d</Data>
<Data Name='IpAddress'>10.0.0.7</Data><Data Name='LogonType'>3</Data></EventData></Event>"""

APP_UNNAMED = """<Event xmlns='http://schemas.microsoft.com/win/2004/08/events/event'>
<System><Provider Name='VBScriptDeprecationAlert'/><EventID Qualifiers='0'>4096</EventID><Version>0</Version>
<Level>3</Level><Task>0</Task><Opcode>0</Opcode><Keywords>0x80000000000000</Keywords>
<TimeCreated SystemTime='2026-09-02T16:33:35.9895416Z'/><EventRecordID>425954</EventRecordID><Correlation/>
<Execution ProcessID='62224' ThreadID='0'/><Channel>Application</Channel><Computer>box</Computer><Security/></System>
<EventData><Data>VBScript is scheduled for deprecation.</Data><Data>second insert</Data></EventData></Event>"""

USERDATA = """<Event xmlns='http://schemas.microsoft.com/win/2004/08/events/event'>
<System><Provider Name='Microsoft-Windows-Eventlog'/><EventID>1102</EventID><Level>4</Level>
<TimeCreated SystemTime='2026-09-02T15:00:00Z'/><EventRecordID>5</EventRecordID><Channel>Security</Channel><Computer>box</Computer></System>
<UserData><LogFileCleared xmlns='http://manifests.microsoft.com/win/2004/08/windows/eventlog'><SubjectUserName>admin</SubjectUserName><SubjectDomainName>BOX</SubjectDomainName></LogFileCleared></UserData></Event>"""


class TestParseEventXml:
    def test_security_event_named_fields(self):
        p = parse_event_xml(SECURITY_4625)
        assert p["event_id"] == 4625
        assert p["provider"] == "Microsoft-Windows-Security-Auditing"
        assert p["provider_guid"].startswith("{54849625")
        assert p["level"] == 0 and p["task"] == 12544
        assert p["keywords"] == "0x8010000000000000"
        assert p["time_created"] == "2026-09-02T15:04:30.123456+00:00"
        assert p["record_id"] == 987654
        assert p["process_id"] == 788 and p["thread_id"] == 1234
        assert p["channel"] == "Security" and p["computer"] == "WS01.corp.local"
        assert p["user_sid"] == "S-1-5-18"
        assert p["activity_id"] == "{aaaa-bbbb}"
        assert p["event_data"]["TargetUserName"] == "bob"
        assert p["event_data"]["IpAddress"] == "10.0.0.7"
        assert p["event_data"]["LogonType"] == "3"

    def test_unnamed_data_and_qualifiers(self):
        p = parse_event_xml(APP_UNNAMED)
        assert p["event_id"] == 4096
        assert p["qualifiers"] == "0"
        assert p["level"] == 3
        assert p["event_data"]["data"] == ["VBScript is scheduled for deprecation.", "second insert"]
        assert p["time_created"] == "2026-09-02T16:33:35.989541+00:00"

    def test_userdata_flattened(self):
        p = parse_event_xml(USERDATA)
        assert p["user_data"] == {"SubjectUserName": "admin", "SubjectDomainName": "BOX"}
        assert p["event_id"] == 1102


class TestHelpers:
    def test_normalize_system_time(self):
        assert normalize_system_time("2026-09-02T15:04:30.1234567Z") == "2026-09-02T15:04:30.123456+00:00"
        assert normalize_system_time("2026-09-02T15:04:30Z") == "2026-09-02T15:04:30+00:00"
        assert normalize_system_time(None).endswith("+00:00")
        assert normalize_system_time("garbage").endswith("+00:00")

    def test_severity_mapping(self):
        assert severity_from_level(1) == "critical"
        assert severity_from_level(2) == "error"
        assert severity_from_level(3) == "warning"
        assert severity_from_level(4) == "info"
        assert severity_from_level(5) == "debug"
        assert severity_from_level(0, 0x8010000000000000) == "warning"  # audit failure
        assert severity_from_level(0, 0x8020000000000000) == "info"     # audit success
        assert severity_from_level(None) == "info"

    def test_build_xpath(self):
        assert build_xpath(None) == "*"
        assert build_xpath(100) == "*[System[EventRecordID > 100]]"
        q = build_xpath(100, {4625, 4624}, {5156})
        assert q == "*[System[EventRecordID > 100 and (EventID=4624 or EventID=4625) and EventID!=5156]]"

    def test_build_xpath_leaves_long_lists_to_client(self):
        many = set(range(1, XPATH_MAX_IDS + 5))
        assert build_xpath(1, many) == "*[System[EventRecordID > 1]]"

    def test_synthesize_message(self):
        p = parse_event_xml(SECURITY_4625)
        msg = synthesize_message(p)
        assert msg.startswith("Event 4625 (Failed logon) from Microsoft-Windows-Security-Auditing")
        assert "TargetUserName=bob" in msg and "IpAddress=10.0.0.7" in msg


@pytest.mark.skipif(sys.platform != "win32", reason="Windows Event Log only")
class TestLiveModernReader:
    def test_application_channel_readable(self):
        from lognog_in.collectors.windows_events import WindowsEventCollector, HAS_MODERN_API
        assert HAS_MODERN_API
        ok, detail = WindowsEventCollector.check_channel("Application")
        assert ok, detail
        assert "readable" in detail

    def test_unknown_channel_reports_error(self):
        from lognog_in.collectors.windows_events import WindowsEventCollector
        ok, detail = WindowsEventCollector.check_channel("No-Such-Channel/Operational")
        assert not ok
        assert "15007" in detail or "not" in detail.lower()

    def test_collect_recent_application_events(self, tmp_path: Path, monkeypatch):
        from lognog_in.config import Config
        from lognog_in.collectors.windows_events import WindowsEventCollector
        monkeypatch.setattr(Config, "get_data_dir", classmethod(lambda cls: tmp_path))
        collector = WindowsEventCollector(channels=["Application"], hostname="h", batch_size=20, index="win")
        events = collector._collect_channel("Application")
        assert isinstance(events, list)
        if events:
            e = events[0]
            assert e.source_type == "windows_application"
            assert e.file_path == "EventLog://Application"
            assert e.index == "win"
            assert e.metadata["severity"] in {"critical", "error", "warning", "info", "debug"}
            assert isinstance(e.metadata["event_id"], int)
            assert e.metadata["provider"]
            assert e.timestamp.endswith("+00:00")
            assert e.message
        # Bookmark advanced: a second poll returns nothing new (or fewer).
        again = collector._collect_channel("Application")
        assert len(again) <= 20
        stats = collector.get_stats()
        assert stats["api"] == "modern"
        assert stats["channel_errors"] == {}

    def test_exclude_filter_applies(self, tmp_path: Path, monkeypatch):
        from lognog_in.config import Config
        from lognog_in.collectors.windows_events import WindowsEventCollector
        monkeypatch.setattr(Config, "get_data_dir", classmethod(lambda cls: tmp_path))
        collector = WindowsEventCollector(channels=["Application"], hostname="h", batch_size=50)
        events = collector._collect_channel("Application")
        if not events:
            pytest.skip("no recent Application events on this machine")
        noisy = events[0].metadata["event_id"]
        collector2 = WindowsEventCollector(channels=["Application"], hostname="h", batch_size=50, exclude_event_ids=[noisy])
        monkeypatch.setattr(Config, "get_data_dir", classmethod(lambda cls: tmp_path / "b"))
        collector2.bookmarks = collector.bookmarks.__class__(tmp_path / "b" / "bm.db")
        # Same window as the first collector's first read.
        collector2.bookmarks.set_bookmark("Application", max(0, min(e.metadata["record_number"] for e in events) - 1))
        events2 = collector2._collect_channel("Application")
        assert all(e.metadata["event_id"] != noisy for e in events2)
