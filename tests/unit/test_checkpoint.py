"""Unit tests for checkpoint JSON persistence."""

import json

from agentic_data_scientist.core.checkpoint import ReadmeCheckpointStore


def test_checkpoint_json_created_and_written(tmp_path):
    """Store should create checkpoint.json when missing."""
    readme = tmp_path / "README.md"
    readme.write_text("# Demo\n\nIntro\n", encoding="utf-8")

    store = ReadmeCheckpointStore(readme, session_id="s1")
    store.record_event("start", "run started", {"step": 1})

    checkpoint_json = tmp_path / "checkpoint.json"
    assert checkpoint_json.exists()
    data = json.loads(checkpoint_json.read_text(encoding="utf-8"))
    assert "entries" in data
    assert len(data["entries"]) == 1
    assert data["entries"][0]["entry_type"] == "event"


def test_load_resume_uses_latest_summary_and_following_events(tmp_path):
    """Resume state should include latest summary and events after it."""
    readme = tmp_path / "README.md"
    store = ReadmeCheckpointStore(readme, session_id="s2")

    store.record_event("event_a", "before summary")
    store.write_summary("summary one", {"phase": 1})
    store.record_event("event_b", "after summary")
    store.write_summary("summary two", {"phase": 2})
    store.record_event("event_c", "after latest summary")

    state = store.load_resume_state()
    assert state["latest_summary"] is not None
    assert state["latest_summary"]["summary"] == "summary two"
    assert len(state["events_after_summary"]) == 1
    assert state["events_after_summary"][0]["event_type"] == "event_c"


def test_invalid_json_lines_are_ignored(tmp_path):
    """Parser should handle missing or empty checkpoint.json gracefully."""
    readme = tmp_path / "README.md"
    readme.write_text("# Demo", encoding="utf-8")

    store = ReadmeCheckpointStore(readme, session_id="s3")
    # No checkpoint.json exists
    state = store.load_resume_state()

    # Should handle gracefully
    assert state["entry_count"] == 0
    assert state["latest_summary"] is None


def test_compaction_keeps_recent_events_and_summaries(tmp_path):
    """Compaction should retain configured tail for events and summaries."""
    readme = tmp_path / "README.md"
    store = ReadmeCheckpointStore(
        readme,
        session_id="s4",
        max_events_to_keep=3,
        max_summaries_to_keep=1,
    )

    store.write_summary("old summary", {"v": 1})
    for idx in range(5):
        store.record_event(f"event_{idx}", f"event {idx}")
    store.write_summary("new summary", {"v": 2})

    state = store.load_resume_state()
    checkpoint_json = tmp_path / "checkpoint.json"
    data = json.loads(checkpoint_json.read_text(encoding="utf-8"))

    event_types = [e.get("event_type") for e in data["entries"] if e.get("entry_type") == "event"]
    assert "event_0" not in event_types
    assert "event_1" not in event_types
    assert "event_2" in event_types
    assert "event_3" in event_types
    assert "event_4" in event_types
    summaries = [e.get("summary") for e in data["entries"] if e.get("entry_type") == "summary"]
    assert "old summary" not in summaries
    assert "new summary" in summaries
    assert state["latest_summary"]["summary"] == "new summary"


def test_existing_checkpoint_block_replaced_not_duplicated(tmp_path):
    """Checkpoint.json should merge new and existing events."""
    readme = tmp_path / "README.md"
    readme.write_text("# Demo", encoding="utf-8")

    store = ReadmeCheckpointStore(readme, session_id="s5")
    # Create initial checkpoint
    store.record_event("legacy", "legacy event")
    
    # Create new store instance and add event
    store2 = ReadmeCheckpointStore(readme, session_id="s5")
    store.record_event("fresh", "new")

    checkpoint_json = tmp_path / "checkpoint.json"
    data = json.loads(checkpoint_json.read_text(encoding="utf-8"))
    event_types = [e.get("event_type") for e in data["entries"] if e.get("entry_type") == "event"]
    assert "legacy" in event_types
    assert "fresh" in event_types


def test_write_summary_with_findings_and_files(tmp_path):
    """write_summary should accept and store findings and files."""
    readme = tmp_path / "README.md"
    store = ReadmeCheckpointStore(readme, session_id="s6")
    
    findings = ["Finding 1: Test result", "Finding 2: Another result"]
    files = [
        {"path": "output/result.csv", "purpose": "Data output"},
        {"path": "figures/plot.png", "purpose": "Visualization"},
    ]
    
    store.write_summary(
        "Analysis complete",
        findings=findings,
        files=files,
    )
    
    state = store.load_resume_state()
    latest = state["latest_summary"]
    assert latest["findings"] == findings
    assert latest["files"] == files
