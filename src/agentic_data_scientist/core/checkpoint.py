"""Checkpoint persistence for resumable sessions using JSON storage."""

from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


CHECKPOINT_SCHEMA_VERSION = 1


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class ReadmeCheckpointStore:
    """Store append-only checkpoint events, summaries, and project metadata in checkpoint.json."""

    def __init__(
        self,
        readme_path: Path,
        session_id: Optional[str] = None,
        max_events_to_keep: int = 200,
        max_summaries_to_keep: int = 3,
    ):
        # Store checkpoint.json in the same directory as README (typically output/)
        self.working_dir = Path(readme_path).parent
        self.checkpoint_path = self.working_dir / "checkpoint.json"
        self.plan_path = self.working_dir / "Plan.md"
        self.session_id = session_id or f"checkpoint_{uuid.uuid4().hex[:8]}"
        self.max_events_to_keep = max_events_to_keep
        self.max_summaries_to_keep = max_summaries_to_keep
        self._lock = threading.Lock()

    def record_event(
        self,
        event_type: str,
        message: str,
        data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Record a checkpoint event entry."""
        entry = {
            "schema_version": CHECKPOINT_SCHEMA_VERSION,
            "entry_type": "event",
            "session_id": self.session_id,
            "timestamp": _utc_now_iso(),
            "event_type": event_type,
            "message": message,
            "data": data or {},
        }
        self._append_entry(entry)
        return entry

    def write_summary(
        self,
        summary: str,
        state_digest: Optional[Dict[str, Any]] = None,
        findings: Optional[List[str]] = None,
        files: Optional[List[Dict[str, str]]] = None,
    ) -> Dict[str, Any]:
        """Write a summary snapshot with optional findings and file list.
        
        Args:
            summary: Text summary of the analysis
            state_digest: Additional state metadata
            findings: List of important findings discovered
            files: List of dicts with 'path' and 'purpose' keys
        """
        entry = {
            "schema_version": CHECKPOINT_SCHEMA_VERSION,
            "entry_type": "summary",
            "session_id": self.session_id,
            "timestamp": _utc_now_iso(),
            "summary": summary,
            "state_digest": state_digest or {},
            "findings": findings or [],
            "files": files or [],
        }
        self._append_entry(entry)
        return entry

    def load_resume_state(self) -> Dict[str, Any]:
        """Load latest summary and subsequent events from README.md."""
        entries = self._read_entries()
        latest_summary = None
        summary_index = -1

        for idx, entry in enumerate(entries):
            if entry.get("entry_type") == "summary":
                latest_summary = entry
                summary_index = idx

        if latest_summary is None:
            return {
                "schema_version": CHECKPOINT_SCHEMA_VERSION,
                "latest_summary": None,
                "events_after_summary": entries,
                "entry_count": len(entries),
            }

        events_after_summary = [
            entry
            for entry in entries[summary_index + 1 :]
            if entry.get("entry_type") == "event"
        ]

        return {
            "schema_version": CHECKPOINT_SCHEMA_VERSION,
            "latest_summary": latest_summary,
            "events_after_summary": events_after_summary,
            "entry_count": len(entries),
        }

    def _append_entry(self, entry: Dict[str, Any]) -> None:
        with self._lock:
            entries = self._read_entries()
            entries.append(entry)
            compacted_entries = self._compact_entries(entries)
            self._write_entries(compacted_entries)

    def _compact_entries(self, entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        summaries = [entry for entry in entries if entry.get("entry_type") == "summary"]
        events = [entry for entry in entries if entry.get("entry_type") == "event"]

        keep_summaries = summaries[-self.max_summaries_to_keep :]
        keep_events = events[-self.max_events_to_keep :]

        kept_ids = {id(entry) for entry in keep_summaries + keep_events}
        return [entry for entry in entries if id(entry) in kept_ids]

    def _read_entries(self) -> List[Dict[str, Any]]:
        """Read all entries from checkpoint.json."""
        if not self.checkpoint_path.exists():
            return []
        
        try:
            data = json.loads(self.checkpoint_path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                # Support both flat entry list and structured format
                if "entries" in data:
                    return data.get("entries", [])
                elif "events" in data or "summaries" in data:
                    # Legacy format: merge events and summaries
                    entries = []
                    entries.extend(data.get("events", []))
                    entries.extend(data.get("summaries", []))
                    return sorted(entries, key=lambda e: e.get("timestamp", ""))
            return []
        except (json.JSONDecodeError, ValueError):
            return []

    def _write_entries(self, entries: List[Dict[str, Any]]) -> None:
        """Write all entries to checkpoint.json."""
        self.checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
        
        checkpoint_data = {
            "schema_version": CHECKPOINT_SCHEMA_VERSION,
            "session_id": self.session_id,
            "last_updated": _utc_now_iso(),
            "entries": entries,
        }
        
        temp_path = self.checkpoint_path.with_suffix(".tmp")
        temp_path.write_text(json.dumps(checkpoint_data, indent=2, default=str), encoding="utf-8")
        temp_path.replace(self.checkpoint_path)

    def _render_entries_block(self, entries: List[Dict[str, Any]]) -> str:
        """NOT USED - checkpoint data is written directly to JSON."""
        pass

    def _extract_checkpoint_content(self, text: str) -> Optional[str]:
        """NOT USED - checkpoint data is stored in JSON."""
        pass

    def _replace_or_insert_checkpoint_block(self, text: str, block_body: str) -> str:
        """NOT USED - checkpoint data is stored in JSON."""
        pass

    def write_plan_md(self, project_plan: str, status: str = "in_progress") -> None:
        """Write project plan and current status to Plan.md.
        
        Args:
            project_plan: The project plan/research question
            status: Current status (in_progress, completed, failed, etc.)
        """
        entries = self._read_entries()
        latest_summary = None
        
        for entry in reversed(entries):
            if entry.get("entry_type") == "summary":
                latest_summary = entry
                break
        
        findings_text = ""
        if latest_summary and latest_summary.get("findings"):
            findings_text = "## Key Findings\n\n"
            for i, finding in enumerate(latest_summary["findings"], 1):
                findings_text += f"{i}. {finding}\n"
            findings_text += "\n"
        
        files_text = ""
        if latest_summary and latest_summary.get("files"):
            files_text = "## Generated Files\n\n"
            for file_entry in latest_summary["files"]:
                path = file_entry.get("path", "unknown")
                purpose = file_entry.get("purpose", "")
                files_text += f"- **{path}**: {purpose}\n"
            files_text += "\n"
        
        plan_md = f"""# Project Plan

## Status
- **Current Status**: {status}
- **Last Updated**: {_utc_now_iso()}

## Project Plan
{project_plan}

{findings_text}{files_text}## Session History
- **Session ID**: {self.session_id}
- **Total Checkpoints**: {len(entries)}
"""
        
        self.plan_path.write_text(plan_md, encoding="utf-8")