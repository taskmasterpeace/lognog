"""Batch inserts and the in-memory capacity accounting."""

from pathlib import Path

from lognog_in.buffer import EventBuffer, LogEvent


def _event(i: int) -> LogEvent:
    return LogEvent(timestamp="t", hostname="h", source="s", source_type="file",
                    file_path="/f", message="x" * 50 + str(i), metadata={})


class TestBatchInsert:
    def test_add_log_events_inserts_in_order(self, tmp_path: Path):
        b = EventBuffer(tmp_path / "b.db")
        assert b.add_log_events([_event(i) for i in range(5)]) == 5
        rows = b.get_batch(10)
        assert [r[2]["message"][-1] for r in rows] == ["0", "1", "2", "3", "4"]
        assert b.count() == 5

    def test_empty_batch(self, tmp_path: Path):
        b = EventBuffer(tmp_path / "b.db")
        assert b.add_log_events([]) == 0

    def test_row_cap_applies_to_batches(self, tmp_path: Path):
        b = EventBuffer(tmp_path / "b.db", max_rows=10)
        b.add_log_events([_event(i) for i in range(25)])
        assert b.count() == 10
        assert b.dropped_count == 15
        # Oldest dropped, newest kept.
        assert b.get_batch(1)[0][2]["message"].endswith("15")


class TestTotalsTracking:
    def test_totals_follow_inserts_and_removals(self, tmp_path: Path):
        b = EventBuffer(tmp_path / "b.db", max_rows=100)
        for i in range(10):
            b.add_log_event(_event(i))
        assert b._row_count == 10
        assert b._byte_total == b.total_bytes()
        ids = [r[0] for r in b.get_batch(4)]
        b.remove_events(ids)
        assert b._row_count == 6 == b.count()
        assert b._byte_total == b.total_bytes()
        b.clear()
        assert b._row_count == 0 and b._byte_total == 0

    def test_totals_initialised_from_existing_db(self, tmp_path: Path):
        path = tmp_path / "b.db"
        b1 = EventBuffer(path)
        b1.add_log_events([_event(i) for i in range(3)])
        b2 = EventBuffer(path)
        assert b2._row_count == 3
        assert b2._byte_total == b1.total_bytes()

    def test_index_field_roundtrips_and_is_omitted_when_none(self, tmp_path: Path):
        b = EventBuffer(tmp_path / "b.db")
        b.add_log_event(_event(0))
        e = LogEvent(timestamp="t", hostname="h", source="s", source_type="file", file_path="/f", message="m", metadata={}, index="sec")
        b.add_log_event(e)
        rows = b.get_batch(2)
        assert "index" not in rows[0][2]
        assert rows[1][2]["index"] == "sec"
        assert LogEvent.from_dict(rows[0][2]).index is None
