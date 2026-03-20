"""Project lifecycle manager - handles creating, running, and tracking projects."""

import asyncio
import json
import logging
import os
import re
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import AsyncGenerator, Dict, List, Optional

from dotenv import load_dotenv

load_dotenv(override=True)

from agentic_data_scientist import DataScientist

from .models import (
    DiscoveryResult,
    GeneratedFile,
    Project,
    ProjectCreate,
    ProjectEvent,
    ProjectMode,
    ProjectStatus,
    ProjectSummary,
    Stage,
    StageStatus,
)
from .project_inheritance import inherit_from_base_project

logger = logging.getLogger(__name__)

PROJECTS_DIR = Path(os.getenv("PROJECTS_DIR", "./projects")).resolve()


def _now() -> str:
    return datetime.now().isoformat()


def _classify_file(path: str) -> str:
    ext = Path(path).suffix.lower()
    if ext in (".png", ".jpg", ".jpeg", ".svg", ".gif", ".webp", ".pdf"):
        return "figure"
    if ext in (".txt", ".md", ".html"):
        return "report"
    if ext in (".csv", ".json", ".tsv", ".xlsx", ".parquet"):
        return "data"
    if ext in (".py", ".r", ".sh", ".ipynb"):
        return "code"
    return "other"


class ProjectManager:
    """Manages the lifecycle of analysis projects."""

    def __init__(self, projects_dir: Optional[Path] = None):
        self.projects_dir = projects_dir or PROJECTS_DIR
        self.projects_dir.mkdir(parents=True, exist_ok=True)
        self._projects: Dict[str, Project] = {}
        self._running_tasks: Dict[str, asyncio.Task] = {}
        self._event_queues: Dict[str, List[asyncio.Queue]] = {}
        self._load_existing_projects()

    def _load_existing_projects(self):
        """Load project metadata from disk on startup."""
        for meta_file in self.projects_dir.glob("*/project.json"):
            try:
                data = json.loads(meta_file.read_text(encoding="utf-8"))
                project = Project(**data)
                # Mark previously running projects as failed
                if project.status == ProjectStatus.RUNNING:
                    project.status = ProjectStatus.FAILED
                    project.error = "Server restarted while project was running"

                # Hydrate persisted content from files if not already in model
                working_dir = Path(project.working_dir) if project.working_dir else None
                if working_dir and working_dir.exists():
                    if not project.paper_content:
                        paper_md = working_dir / "paper.md"
                        if paper_md.exists():
                            try:
                                project.paper_content = paper_md.read_text(encoding="utf-8")
                            except Exception:
                                pass
                    if not project.in_silico_suggestions:
                        isc = working_dir / "in_silico_data_suggestions.md"
                        if isc.exists():
                            try:
                                project.in_silico_suggestions = isc.read_text(encoding="utf-8")
                            except Exception:
                                pass
                    if not project.experimental_suggestions:
                        exp = working_dir / "experimental_data_suggestions.md"
                        if exp.exists():
                            try:
                                project.experimental_suggestions = exp.read_text(encoding="utf-8")
                            except Exception:
                                pass

                # Backfill stages from events/filesystem for older projects
                self._backfill_stages(project)
                if project.stages:
                    self._save_project(project)

                # Backfill skills_used from events for older projects
                if not project.skills_used and project.events:
                    seen = set()
                    for ev in project.events:
                        if ev.type == "tool_call" and ev.content:
                            seen.add(ev.content)
                        elif ev.type in ("message", "thought") and ev.author and ev.author != "system":
                            seen.add(ev.author)
                    if seen:
                        project.skills_used = sorted(seen)

                self._projects[project.id] = project
            except Exception as e:
                logger.warning(f"Failed to load project from {meta_file}: {e}")

    def _save_project(self, project: Project):
        """Persist project metadata to disk."""
        project_dir = self.projects_dir / project.id
        project_dir.mkdir(parents=True, exist_ok=True)
        meta_file = project_dir / "project.json"
        # Keep full event history (no limit)
        save_data = project.model_dump()
        # Don't persist large generated content in JSON — they live as separate files
        # and are hydrated on load via _load_existing_projects
        save_data.pop("paper_content", None)
        save_data.pop("in_silico_suggestions", None)
        save_data.pop("experimental_suggestions", None)
        meta_file.write_text(json.dumps(save_data, indent=2, default=str), encoding="utf-8")

    def _get_project_working_dir(self, project_id: str) -> Path:
        return self.projects_dir / project_id / "output"

    def list_projects(self) -> List[ProjectSummary]:
        """List all projects as summaries."""
        summaries = []
        for p in sorted(self._projects.values(), key=lambda x: x.created_at, reverse=True):
            summaries.append(
                ProjectSummary(
                    id=p.id,
                    query=p.query,
                    mode=p.mode,
                    status=p.status,
                    created_at=p.created_at,
                    duration=p.duration,
                    stages_total=len(p.stages),
                    stages_completed=sum(1 for s in p.stages if s.status == StageStatus.COMPLETED),
                    files_count=len(p.files),
                    discovery_phase=p.discovery_phase,
                )
            )
        return summaries

    def get_project(self, project_id: str) -> Optional[Project]:
        return self._projects.get(project_id)

    def create_project(self, req: ProjectCreate) -> Project:
        """Create a new project (does not start it)."""
        project_id = f"proj_{uuid.uuid4().hex[:12]}"
        project = Project(
            id=project_id,
            query=req.query,
            mode=req.mode,
            status=ProjectStatus.PENDING,
            created_at=_now(),
            working_dir=str(self._get_project_working_dir(project_id)),
            input_files=req.files,
            num_papers=req.num_papers,
            days_back=req.days_back,
            llm_config=req.llm_config,
            base_project_id=req.base_project_id,
        )
        self._projects[project_id] = project
        self._save_project(project)
        
        # Copy outputs from base project if specified
        if req.base_project_id:
            base_project = self._projects.get(req.base_project_id)
            if base_project:
                inherit_from_base_project(project, base_project, self.projects_dir)
                self._scan_files(project)
                self._save_project(project)
        
        return project

    def delete_project(self, project_id: str) -> bool:
        """Delete a project and its files."""
        if project_id in self._running_tasks:
            self.stop_project(project_id)
        project = self._projects.pop(project_id, None)
        if not project:
            return False
        project_dir = self.projects_dir / project_id
        if project_dir.exists():
            shutil.rmtree(project_dir, ignore_errors=True)
        return True

    def stop_project(self, project_id: str) -> bool:
        """Stop a running project."""
        task = self._running_tasks.get(project_id)
        if task and not task.done():
            task.cancel()
        project = self._projects.get(project_id)
        if project and project.status == ProjectStatus.RUNNING:
            project.status = ProjectStatus.STOPPED
            project.completed_at = _now()
            if project.started_at:
                started = datetime.fromisoformat(project.started_at)
                project.duration = (datetime.now() - started).total_seconds()
            self._save_project(project)
            self._emit_event(project_id, ProjectEvent(
                type="status", content="Project stopped by user",
                author="system", timestamp=_now(),
            ))
            return True
        return False

    def subscribe(self, project_id: str) -> asyncio.Queue:
        """Subscribe to real-time events for a project."""
        if project_id not in self._event_queues:
            self._event_queues[project_id] = []
        queue: asyncio.Queue = asyncio.Queue()
        self._event_queues[project_id].append(queue)
        return queue

    def unsubscribe(self, project_id: str, queue: asyncio.Queue):
        """Unsubscribe from project events."""
        queues = self._event_queues.get(project_id, [])
        if queue in queues:
            queues.remove(queue)

    def _emit_event(self, project_id: str, event: ProjectEvent):
        """Emit an event to all subscribers and store it."""
        project = self._projects.get(project_id)
        if project:
            event.id = len(project.events)
            project.events.append(event)

        for queue in self._event_queues.get(project_id, []):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                pass

    async def start_project(self, project_id: str, uploaded_files: List[tuple] = None):
        """Start running a project in the background."""
        project = self._projects.get(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")

        project.status = ProjectStatus.RUNNING
        project.started_at = _now()
        self._save_project(project)

        task = asyncio.create_task(self._run_project(project_id, uploaded_files or []))
        self._running_tasks[project_id] = task

    async def _run_project(self, project_id: str, uploaded_files: List[tuple]):
        """Execute the analysis pipeline."""
        project = self._projects.get(project_id)
        if not project:
            return

        working_dir = self._get_project_working_dir(project_id)

        self._emit_event(project_id, ProjectEvent(
            type="status", content=f"Initializing {project.mode.value} analysis...",
            author="system", timestamp=_now(),
        ))

        try:
            # ── Discovery Phase ────────────────────────────────────
            if project.mode == ProjectMode.DISCOVERY:
                from .discovery import run_discovery

                project.discovery_phase = "searching"
                self._save_project(project)

                def discovery_emit(event_type: str, content: str, metadata: dict = None):
                    """Forward discovery events to the project event stream."""
                    project.discovery_phase = (metadata or {}).get("phase", project.discovery_phase)
                    self._emit_event(project_id, ProjectEvent(
                        type=event_type,
                        content=content,
                        author="discovery",
                        timestamp=_now(),
                        metadata=metadata or {},
                    ))

                discovery_result = await run_discovery(
                    query=project.query,
                    num_papers=project.num_papers,
                    days_back=project.days_back,
                    emit=discovery_emit,
                )

                # Store discovery results
                project.discovery = DiscoveryResult(**discovery_result)
                project.discovery_phase = "done"

                # Save the discovery report as files
                discovery_dir = working_dir / "discovery"
                discovery_dir.mkdir(parents=True, exist_ok=True)
                (discovery_dir / "synthesis.md").write_text(
                    discovery_result.get("synthesis", ""), encoding="utf-8"
                )
                (discovery_dir / "hypothesis.md").write_text(
                    discovery_result.get("hypothesis", ""), encoding="utf-8"
                )
                research_q = discovery_result.get("analysis_prompt", "")
                (discovery_dir / "research_question.md").write_text(
                    research_q, encoding="utf-8"
                )
                papers_md = "# Fetched Papers\n\n"
                for p in discovery_result.get("papers", []):
                    papers_md += f"- **{p.get('title', 'N/A')}**\n"
                    papers_md += f"  {', '.join(p.get('authors', [])[:3])}\n"
                    papers_md += f"  {p.get('journal', '')} ({p.get('pub_date', '')})\n"
                    papers_md += f"  PMID: {p.get('pmid', '')} | DOI: {p.get('doi', '')}\n\n"
                (discovery_dir / "papers.md").write_text(papers_md, encoding="utf-8")

                # Store the generated research question and pause for user review
                project.analysis_query = research_q
                project.status = ProjectStatus.AWAITING_CONFIRMATION
                self._scan_files(project)
                self._save_project(project)

                self._emit_event(project_id, ProjectEvent(
                    type="status",
                    content="Discovery complete. Please review the research question and confirm to start analysis.",
                    author="system", timestamp=_now(),
                    metadata={"status": "awaiting_confirmation", "phase": "awaiting_confirmation"},
                ))
                return  # Stop here — analysis will be triggered by confirm_discovery()

            # ── Analysis Phase (non-discovery modes) ───────────────
            await self._run_analysis(project_id, project.query, uploaded_files)

        except asyncio.CancelledError:
            project.status = ProjectStatus.STOPPED
            project.completed_at = _now()
            self._save_project(project)
        except Exception as e:
            logger.exception(f"Project {project_id} failed")
            project.status = ProjectStatus.FAILED
            project.error = str(e)
            project.completed_at = _now()
            self._save_project(project)
            self._emit_event(project_id, ProjectEvent(
                type="error", content=str(e),
                author="system", timestamp=_now(),
            ))
        finally:
            self._running_tasks.pop(project_id, None)
            for queue in self._event_queues.get(project_id, []):
                try:
                    queue.put_nowait(None)  # Sentinel
                except asyncio.QueueFull:
                    pass

    async def confirm_discovery(self, project_id: str, analysis_query: str) -> bool:
        """User confirms (or edits) the research question and triggers analysis."""
        project = self._projects.get(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")
        if project.status != ProjectStatus.AWAITING_CONFIRMATION:
            raise ValueError(f"Project is not awaiting confirmation (status={project.status.value})")

        # Update the analysis query (user may have edited it)
        project.analysis_query = analysis_query
        project.status = ProjectStatus.RUNNING
        self._save_project(project)

        self._emit_event(project_id, ProjectEvent(
            type="status",
            content="Research question confirmed. Starting automated analysis...",
            author="system", timestamp=_now(),
            metadata={"status": "running", "phase": "analysis_start"},
        ))

        # Collect uploaded files from user_data directory
        uploaded_files: List[tuple] = []
        user_data_dir = self._get_project_working_dir(project_id) / "user_data"
        if user_data_dir.exists():
            for f in user_data_dir.iterdir():
                if f.is_file():
                    uploaded_files.append((f.name, f))

        # Launch analysis in background
        task = asyncio.create_task(self._run_analysis_safe(project_id, analysis_query, uploaded_files))
        self._running_tasks[project_id] = task
        return True

    async def _run_analysis_safe(self, project_id: str, analysis_query: str, uploaded_files: List[tuple]):
        """Wrapper around _run_analysis with error handling."""
        project = self._projects.get(project_id)
        if not project:
            return
        try:
            await self._run_analysis(project_id, analysis_query, uploaded_files)
        except asyncio.CancelledError:
            project.status = ProjectStatus.STOPPED
            project.completed_at = _now()
            self._save_project(project)
        except Exception as e:
            logger.exception(f"Project {project_id} analysis failed")
            project.status = ProjectStatus.FAILED
            project.error = str(e)
            project.completed_at = _now()
            self._save_project(project)
            self._emit_event(project_id, ProjectEvent(
                type="error", content=str(e),
                author="system", timestamp=_now(),
            ))
        finally:
            self._running_tasks.pop(project_id, None)
            for queue in self._event_queues.get(project_id, []):
                try:
                    queue.put_nowait(None)
                except asyncio.QueueFull:
                    pass

    async def _run_analysis(self, project_id: str, analysis_query: str, uploaded_files: List[tuple]):
        """Execute the analysis agent phase."""
        project = self._projects.get(project_id)
        if not project:
            return

        working_dir = self._get_project_working_dir(project_id)
        agent_type = "adk" if project.mode in (ProjectMode.ORCHESTRATED, ProjectMode.DISCOVERY) else "claude_code"

        # Build model_config dict from project settings
        mc = None
        if project.llm_config:
            mc = project.llm_config.model_dump(exclude_none=True)

        core = DataScientist(
            agent_type=agent_type,
            working_dir=str(working_dir),
            auto_cleanup=False,
            model_config=mc,
        )

        self._emit_event(project_id, ProjectEvent(
            type="status", content="Agent ready. Starting analysis...",
            author="system", timestamp=_now(),
        ))

        event_number = 0
        seen_skills = set(project.skills_used)  # resume tracking if restarted

        async for event_dict in await core.run_async(
            analysis_query, files=uploaded_files, stream=True
        ):
            if project.status == ProjectStatus.STOPPED:
                break

            event_type = event_dict.get("type", "")
            event_number += 1

            if event_type == "message":
                is_thought = event_dict.get("is_thought", False)
                content = event_dict.get("content", "")
                author = event_dict.get("author", "")

                # Track agent as a skill
                if author and author != "system" and author not in seen_skills:
                    seen_skills.add(author)
                    project.skills_used = sorted(seen_skills)

                stage_idx = self._detect_stage(author, content, project)
                if stage_idx is not None:
                    self._save_project(project)

                self._emit_event(project_id, ProjectEvent(
                    type="thought" if is_thought else "message",
                    content=content,
                    author=author,
                    timestamp=event_dict.get("timestamp", _now()),
                    is_thought=is_thought,
                    stage_index=stage_idx,
                ))

            elif event_type == "function_call":
                tool_name = event_dict.get("name", "")
                # Track tool as a skill
                if tool_name and tool_name not in seen_skills:
                    seen_skills.add(tool_name)
                    project.skills_used = sorted(seen_skills)

                self._emit_event(project_id, ProjectEvent(
                    type="tool_call",
                    content=tool_name,
                    author=event_dict.get("author", ""),
                    timestamp=event_dict.get("timestamp", _now()),
                    metadata={"arguments": event_dict.get("arguments", {})},
                ))

            elif event_type == "function_response":
                self._emit_event(project_id, ProjectEvent(
                    type="tool_result",
                    content=str(event_dict.get("response", ""))[:500],
                    author=event_dict.get("author", ""),
                    timestamp=event_dict.get("timestamp", _now()),
                    metadata={"name": event_dict.get("name", "")},
                ))

            elif event_type == "completed":
                project.duration = event_dict.get("duration", 0)

            elif event_type == "error":
                project.error = event_dict.get("content", "Unknown error")

            if event_number % 20 == 0:
                self._scan_files(project)
                self._save_project(project)

        # Finalize — mark last running stage as completed
        for s in project.stages:
            if s.status == StageStatus.RUNNING:
                s.status = StageStatus.COMPLETED
                s.completed_at = _now()
                if s.started_at:
                    try:
                        started = datetime.fromisoformat(s.started_at)
                        s.duration_seconds = (datetime.now() - started).total_seconds()
                    except Exception:
                        pass

        if project.status == ProjectStatus.RUNNING:
            project.status = ProjectStatus.COMPLETED
            project.completed_at = _now()
            if project.started_at:
                started = datetime.fromisoformat(project.started_at)
                project.duration = (datetime.now() - started).total_seconds()

        self._scan_files(project)
        self._save_project(project)

        self._emit_event(project_id, ProjectEvent(
            type="status",
            content=f"Analysis {project.status.value}",
            author="system",
            timestamp=_now(),
            metadata={"status": project.status.value, "duration": project.duration},
        ))

    def _detect_stage(self, author: str, content: str, project: Project) -> Optional[int]:
        """Detect stage transitions from event content."""
        # Pattern 1: stage_orchestrator emits "### Stage N: Title"
        orch_match = re.search(r"###\s*Stage\s+(\d+)\s*:\s*(.+?)(?:\n|$)", content)
        if orch_match and author == "stage_orchestrator":
            stage_num = int(orch_match.group(1))  # 1-indexed
            stage_title = orch_match.group(2).strip()
            idx = stage_num - 1  # convert to 0-indexed

            # Mark all previous running stages as completed
            for s in project.stages:
                if s.status == StageStatus.RUNNING:
                    s.status = StageStatus.COMPLETED
                    s.completed_at = _now()
                    if s.started_at:
                        try:
                            started = datetime.fromisoformat(s.started_at)
                            s.duration_seconds = (datetime.now() - started).total_seconds()
                        except Exception:
                            pass

            # Create stage if it doesn't exist yet
            existing_indices = {s.index for s in project.stages}
            if idx not in existing_indices:
                project.stages.append(Stage(
                    index=idx, title=stage_title,
                    status=StageStatus.RUNNING,
                    started_at=_now(),
                ))
                project.stages.sort(key=lambda s: s.index)
            else:
                # Stage exists, mark it as running
                for s in project.stages:
                    if s.index == idx:
                        s.status = StageStatus.RUNNING
                        s.started_at = s.started_at or _now()
                        break
            return idx

        # Pattern 2: stage_orchestrator completion / warning messages
        if author == "stage_orchestrator":
            if "All" in content and "success criteria" in content.lower() and ("met" in content.lower()):
                # Final completion — mark all running stages done
                for s in project.stages:
                    if s.status == StageStatus.RUNNING:
                        s.status = StageStatus.COMPLETED
                        s.completed_at = _now()
                        if s.started_at:
                            try:
                                started = datetime.fromisoformat(s.started_at)
                                s.duration_seconds = (datetime.now() - started).total_seconds()
                            except Exception:
                                pass

        return None

    def _backfill_stages(self, project: Project):
        """Retroactively parse stages from existing events AND filesystem artifacts."""
        if project.stages:
            return  # Already has stages

        stage_titles: dict[int, str] = {}
        stage_first_seen: dict[int, str] = {}
        stage_last_seen: dict[int, str] = {}
        last_stage_idx = -1

        # ── Phase 1: Parse from events ──
        for e in project.events:
            author = e.author or ""
            content = e.content or ""
            ts = e.timestamp or ""
            if not content:
                continue

            found_idx = None
            found_title = None

            # Pattern 1: stage_orchestrator "### Stage N: Title"
            m = re.search(r"###\s*Stage\s+(\d+)\s*:\s*(.+?)(?:\n|$)", content)
            if m and author == "stage_orchestrator":
                found_idx = int(m.group(1)) - 1
                found_title = m.group(2).strip()

            # Pattern 2: coding_agent "This is Stage N:" or "I'll implement Stage N:"
            if not found_title and author == "coding_agent":
                m2 = re.search(
                    r"(?:This is |I'?ll (?:execute|implement|help.*implement) )"
                    r"Stage\s+(\d+)\s*[:\-]\s*(.+?)(?:\n|$)",
                    content, re.IGNORECASE
                )
                if m2:
                    found_idx = int(m2.group(1)) - 1
                    found_title = m2.group(2).strip()

            # Pattern 3: coding_agent "## ✅ Stage N Complete: Title"
            if not found_title and author == "coding_agent":
                m3 = re.search(r"Stage\s+(\d+)\s+Complete\s*:\s*(.+?)(?:\n|$)", content, re.IGNORECASE)
                if m3:
                    found_idx = int(m3.group(1)) - 1
                    found_title = m3.group(2).strip()

            # Pattern 4: review_agent "STRUCTURED REVIEW - STAGE N: TITLE"
            if not found_title and author == "review_agent":
                m4 = re.search(r"STAGE\s+(\d+)\s*[:\-]\s*(.+?)(?:\n|$)", content)
                if m4:
                    found_idx = int(m4.group(1)) - 1
                    found_title = m4.group(2).strip().title()

            if found_idx is not None and found_idx >= 0:
                if found_idx not in stage_titles and found_title:
                    clean_title = re.split(r"[.\n\\]", found_title)[0].strip()
                    if len(clean_title) > 5:
                        found_title = clean_title
                    stage_titles[found_idx] = found_title
                if found_idx not in stage_first_seen and ts:
                    stage_first_seen[found_idx] = ts
                if ts:
                    stage_last_seen[found_idx] = ts
                if found_idx != last_stage_idx and last_stage_idx >= 0:
                    pass
                last_stage_idx = found_idx

        # ── Phase 2: Reconstruct missing stages from filesystem ──
        working_dir = Path(project.working_dir)
        figures_dir = working_dir / "figures"
        workflow_dir = working_dir / "workflow"

        # Scan figures for stageN_* patterns
        fs_stage_nums: set[int] = set()
        if figures_dir.exists():
            for f in figures_dir.iterdir():
                m = re.match(r"stage(\d+)_(.+?)\.(?:png|jpg|svg|gif)", f.name, re.IGNORECASE)
                if m:
                    fs_stage_nums.add(int(m.group(1)))

        # Scan workflow scripts for stageN_* patterns
        if workflow_dir.exists():
            for f in workflow_dir.iterdir():
                m = re.match(r"stage(\d+)_(.+?)\.py", f.name, re.IGNORECASE)
                if m:
                    fs_stage_nums.add(int(m.group(1)))

        # Scan for STAGE_N_COMPLETION_SUMMARY.txt
        for f in working_dir.iterdir():
            m = re.match(r"STAGE_(\d+)_COMPLETION_SUMMARY\.txt", f.name)
            if m:
                fs_stage_nums.add(int(m.group(1)))

        # Also check figures without stage prefix (stage 1 often has generic names)
        if figures_dir.exists():
            generic_figs = [f.name for f in figures_dir.iterdir()
                           if f.suffix.lower() in ('.png', '.jpg', '.svg', '.gif')
                           and not re.match(r"stage\d+_", f.name, re.IGNORECASE)]
            if generic_figs and 1 not in fs_stage_nums:
                fs_stage_nums.add(1)

        # Try to get stage titles from README.md
        readme_titles: dict[int, str] = {}
        readme_path = working_dir / "README.md"
        if readme_path.exists():
            try:
                readme_text = readme_path.read_text(encoding="utf-8", errors="ignore")
                for rm in re.finditer(r"###\s*Stage\s+(\d+)\s*:\s*(.+?)(?:\n|$)", readme_text):
                    readme_titles[int(rm.group(1))] = rm.group(2).strip()
            except Exception:
                pass

        # Fill in missing stages from filesystem
        for snum in fs_stage_nums:
            idx = snum - 1
            if idx not in stage_titles:
                # Priority: README title > workflow script name > generic
                title = readme_titles.get(snum)
                if not title and workflow_dir.exists():
                    for f in workflow_dir.iterdir():
                        m = re.match(rf"stage{snum}_(.+?)\.py", f.name, re.IGNORECASE)
                        if m:
                            title = m.group(1).replace("_", " ").title()
                            break
                if not title:
                    title = f"Stage {snum}"
                stage_titles[idx] = title

        if not stage_titles:
            return

        # ── Phase 3: Build stage objects ──
        sorted_indices = sorted(stage_titles.keys())
        for i, idx in enumerate(sorted_indices):
            started = stage_first_seen.get(idx)
            next_idx = sorted_indices[i + 1] if i + 1 < len(sorted_indices) else None
            completed = stage_first_seen.get(next_idx) if next_idx is not None else None
            dur = None
            if started and completed:
                try:
                    dur = (datetime.fromisoformat(completed) - datetime.fromisoformat(started)).total_seconds()
                except Exception:
                    pass
            is_done = project.status in (ProjectStatus.COMPLETED, ProjectStatus.FAILED, ProjectStatus.STOPPED)
            project.stages.append(Stage(
                index=idx,
                title=stage_titles[idx],
                status=StageStatus.COMPLETED if is_done else StageStatus.PENDING,
                started_at=started,
                completed_at=completed if is_done else None,
                duration_seconds=dur,
            ))

    def _scan_files(self, project: Project):
        """Scan working directory for generated files."""
        working_dir = Path(project.working_dir)
        if not working_dir.exists():
            return

        existing_paths = {f.path for f in project.files}
        for file_path in working_dir.rglob("*"):
            if not file_path.is_file():
                continue
            # Skip hidden dirs/files
            parts = file_path.relative_to(working_dir).parts
            if any(p.startswith(".") for p in parts):
                continue
            if "user_data" in parts:
                continue

            rel_path = str(file_path.relative_to(working_dir))
            if rel_path not in existing_paths:
                try:
                    size = file_path.stat().st_size
                except OSError:
                    size = 0
                project.files.append(GeneratedFile(
                    path=rel_path,
                    name=file_path.name,
                    size=size,
                    type=_classify_file(rel_path),
                    created_at=_now(),
                ))

    def get_file_path(self, project_id: str, rel_path: str) -> Optional[Path]:
        """Get absolute path for a project file."""
        project = self._projects.get(project_id)
        if not project:
            return None
        full_path = Path(project.working_dir) / rel_path
        if full_path.exists() and full_path.is_file():
            return full_path
        return None

    async def generate_paper(self, project_id: str, title: Optional[str] = None) -> str:
        """Generate a comprehensive paper from project outputs."""
        project = self._projects.get(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")

        working_dir = Path(project.working_dir)

        # Collect all text reports
        reports = []
        for f in project.files:
            if f.type == "report":
                fpath = working_dir / f.path
                if fpath.exists():
                    try:
                        reports.append(f"### {f.name}\n\n{fpath.read_text(encoding='utf-8')}")
                    except Exception:
                        pass

        # Collect README
        readme_path = working_dir / "README.md"
        readme = ""
        if readme_path.exists():
            try:
                readme = readme_path.read_text(encoding="utf-8")
            except Exception:
                pass

        # Collect data summaries
        data_summaries = []
        for f in project.files:
            if f.type == "data" and f.name.endswith(".json"):
                fpath = working_dir / f.path
                if fpath.exists():
                    try:
                        data_summaries.append(f"**{f.name}**:\n```json\n{fpath.read_text(encoding='utf-8')[:2000]}\n```")
                    except Exception:
                        pass

        # List figures
        figures = [f for f in project.files if f.type == "figure"]
        figure_list = "\n".join(f"- {f.name} ({f.path})" for f in figures)

        paper_title = title or f"Analysis Report: {project.query}"

        # Use project-specific model/provider when available
        from agentic_data_scientist.agents.adk.utils import (
            DEFAULT_MODEL_NAME,
            create_litellm_model,
            create_litellm_model_from_config,
        )

        if project.llm_config:
            model_config = project.llm_config.model_dump(exclude_none=True)
            llm = create_litellm_model_from_config(model_config, role="planning", num_retries=3, timeout=120)
            llm_model_name = model_config.get("planning_model") or DEFAULT_MODEL_NAME
            provider_for_config = model_config.get("provider")
        else:
            llm = create_litellm_model(DEFAULT_MODEL_NAME, num_retries=3, timeout=120)
            llm_model_name = DEFAULT_MODEL_NAME
            provider_for_config = None

        prompt = f"""Write a SHORT, publication-quality scientific paper based on this analysis.
The paper MUST be concise enough to fit in 4-5 printed pages (approximately 2500-3000 words including figure captions).

# Title: {paper_title}

# Original Research Question
{project.query}

# Analysis Mode
{project.mode.value}

# Project README
{readme}

# Analysis Reports
{chr(10).join(reports)}

# Data Summaries
{chr(10).join(data_summaries)}

# Available Figures
{figure_list}

# Writing Instructions

Write the paper in Markdown with EXACTLY these sections:

## Abstract
3-5 sentences only. State the objective, key method, main finding, and significance.

## Introduction
2-3 short paragraphs. Motivate the research question with minimal background. End with a clear hypothesis or objective statement.

## Methods
1-2 paragraphs. Summarize the analytical pipeline concisely. Omit boilerplate -- focus on what distinguishes this analysis.

## Results
This is the core section. Present findings with integrated figure references.
- Select the 3-5 MOST IMPORTANT figures from the available list. Do NOT include every figure.
- For each selected figure, embed it on its own line: ![Figure N: Short caption](figures/filename.png)
- Place each figure immediately after the paragraph that discusses it.
- Write 1-2 sentences per figure explaining what it shows and why it matters.
- Report key quantitative results (p-values, effect sizes, counts) inline.

## Discussion
2-3 paragraphs. Interpret results, note limitations, suggest future directions. Be direct -- no filler.

## Conclusion
2-3 sentences summarizing the take-home message.

# Critical Rules
- STRICT LENGTH LIMIT: Keep total text under 3000 words. Be ruthlessly concise.
- Select only the 3-5 most informative figures. Quality over quantity.
- Every sentence must convey information -- no padding or generic statements.
- Use actual data and findings from the reports -- do not fabricate results.
- Write in formal scientific style: third person, past tense for methods/results.
- Figure references must use this exact format: ![Figure N: Caption](figures/filename.png)
"""

        try:
            from google.adk.models.llm_request import LlmRequest
            from google.genai import types as genai_types
            config_kwargs = {"temperature": 0.3, "max_output_tokens": 6000}
            if (provider_for_config or "").lower() != "bedrock":
                config_kwargs["top_p"] = 0.95

            llm_request = LlmRequest(
                model=llm_model_name,
                contents=[genai_types.Content(
                    role="user",
                    parts=[genai_types.Part(text=prompt)],
                )],
                config=genai_types.GenerateContentConfig(**config_kwargs),
            )

            response = None
            async for llm_response in llm.generate_content_async(llm_request=llm_request, stream=False):
                response = llm_response
                break

            paper_text = ""
            if response and response.content and response.content.parts:
                for part in response.content.parts:
                    if hasattr(part, "text") and part.text:
                        paper_text += part.text

            if not paper_text:
                paper_text = self._generate_fallback_paper(project, reports, figures, readme)

            # Save paper to project directory
            full_md = f"# {paper_title}\n\n{paper_text}"
            paper_path = working_dir / "paper.md"
            paper_path.write_text(full_md, encoding="utf-8")

            # Add to project files
            project.files.append(GeneratedFile(
                path="paper.md", name="paper.md",
                size=len(paper_text), type="report",
                created_at=_now(),
            ))

            # Generate PDF with embedded figures
            pdf_path = self._generate_paper_pdf(working_dir, full_md, paper_title, project)

            # Persist paper content in project model
            project.paper_content = paper_text
            self._save_project(project)

            return paper_text

        except Exception as e:
            logger.exception("Paper generation with LLM failed, using fallback")
            paper_text = self._generate_fallback_paper(project, reports, figures, readme)
            full_md = f"# {paper_title}\n\n{paper_text}"
            paper_path = working_dir / "paper.md"
            paper_path.write_text(full_md, encoding="utf-8")

            # Still try to generate PDF from fallback
            self._generate_paper_pdf(working_dir, full_md, paper_title, project)

            # Persist paper content in project model
            project.paper_content = paper_text
            self._save_project(project)

            return paper_text

    def _generate_paper_pdf(self, working_dir: Path, markdown_content: str, title: str, project) -> Optional[Path]:
        """Generate a PDF from the paper markdown with embedded figures."""
        try:
            from .pdf_generator import generate_paper_pdf

            pdf_path = working_dir / "paper.pdf"
            generate_paper_pdf(
                markdown_content=markdown_content,
                working_dir=working_dir,
                output_path=pdf_path,
                title=title,
            )

            # Add PDF to project files (remove old entry if re-generating)
            project.files = [f for f in project.files if f.name != "paper.pdf"]
            project.files.append(GeneratedFile(
                path="paper.pdf", name="paper.pdf",
                size=pdf_path.stat().st_size, type="report",
                created_at=_now(),
            ))
            logger.info(f"Paper PDF generated: {pdf_path}")
            return pdf_path

        except Exception as e:
            logger.exception(f"PDF generation failed: {e}")
            return None

    async def generate_data_suggestions(self, project_id: str, suggestion_type: str) -> str:
        """Generate in-silico or experimental data suggestions from project outputs."""
        project = self._projects.get(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")

        working_dir = Path(project.working_dir)

        # ── Collect context: paper, reports, README ──
        paper_text = project.paper_content or ""
        if not paper_text:
            paper_md = working_dir / "paper.md"
            if paper_md.exists():
                try:
                    paper_text = paper_md.read_text(encoding="utf-8")[:5000]
                except Exception:
                    pass

        reports = []
        for f in project.files:
            if f.type == "report":
                fpath = working_dir / f.path
                if fpath.exists():
                    try:
                        reports.append(f"### {f.name}\n\n{fpath.read_text(encoding='utf-8')[:2000]}")
                    except Exception:
                        pass

        readme = ""
        readme_path = working_dir / "README.md"
        if readme_path.exists():
            try:
                readme = readme_path.read_text(encoding="utf-8")[:2000]
            except Exception:
                pass

        discovery_context = ""
        if project.discovery:
            discovery_context = f"""
## Discovery Context
### Research Synthesis
{project.discovery.synthesis[:1500]}
### Hypothesis
{project.discovery.hypothesis[:1000]}
"""

        figures = [f for f in project.files if f.type == "figure"]
        figure_list = "\n".join(f"- {f.name}" for f in figures[:10])

        # ── PubMed search for relevant recent literature ──
        pubmed_context = ""
        try:
            from .pubmed import search_pubmed, fetch_papers
            # Build a search query from the research question
            search_q = project.query[:200]
            pmids = await search_pubmed(search_q, max_results=5, days_back=365)
            if pmids:
                papers = await fetch_papers(pmids)
                if papers:
                    citations = []
                    for p in papers[:5]:
                        citations.append(f"- {p.citation()}")
                        if p.abstract:
                            citations.append(f"  Abstract: {p.abstract[:300]}...")
                    pubmed_context = f"""
## Recent Related Literature (PubMed)
{chr(10).join(citations)}
"""
                    logger.info(f"Found {len(papers)} PubMed papers for data suggestions context")
        except Exception as e:
            logger.warning(f"PubMed search for data suggestions failed: {e}")

        # ── Type-specific instructions ──
        if suggestion_type == "in_silico":
            type_label = "In-Silico Data"
            type_instruction = """List the TOP 3-5 most impactful **in-silico data** recommendations. These must directly address gaps or limitations identified in the paper's Results and Discussion sections. Focus on:
- Simulated datasets to validate specific findings (cite the exact result)
- Public database queries (GEO, TCGA, KEGG, STRING, UniProt) with exact search terms or accession IDs
- Computational experiments (bootstrapping, cross-validation, permutation tests) targeting specific weaknesses
For each: **What** (1 line), **Why** (reference a specific result/limitation from the paper), **How** (exact query, command, or parameters). If relevant PubMed papers are provided, cite them as supporting references."""
        else:
            type_label = "Experimental Data"
            type_instruction = """List the TOP 3-5 most impactful **wet-lab experiments** to validate or extend findings. These must directly address the paper's conclusions and test the specific hypotheses generated. Focus on:
- Validation assays targeting the top findings (cite specific genes, miRNAs, proteins, or pathways from results)
- Perturbation experiments (knockdown, knockout, drug treatment) for the most significant hits
- Orthogonal methods that would confirm key computational predictions
For each: **What** (1 line), **Why** (reference a specific result from the paper), **Protocol** (key steps, reagents, controls, expected outcome). If relevant PubMed papers are provided, cite them as methodological references."""

        from agentic_data_scientist.agents.adk.utils import (
            DEFAULT_MODEL_NAME,
            create_litellm_model,
            create_litellm_model_from_config,
        )
        if project.llm_config:
            model_config = project.llm_config.model_dump(exclude_none=True)
            llm = create_litellm_model_from_config(model_config, role="planning", num_retries=3, timeout=120)
            llm_model_name = model_config.get("planning_model") or DEFAULT_MODEL_NAME
            provider_for_config = model_config.get("provider")
        else:
            llm = create_litellm_model(DEFAULT_MODEL_NAME, num_retries=3, timeout=120)
            llm_model_name = DEFAULT_MODEL_NAME
            provider_for_config = None

        prompt = f"""You are an expert research advisor. Write a SHORT, on-point {type_label} recommendations report.

STRICT LENGTH: Maximum 500 words. Be extremely concise -- every sentence must reference a specific finding.

{type_instruction}

# Original Research Question
{project.query}

# Generated Paper (key sections)
{paper_text[:4000]}

# Analysis Reports
{chr(10).join(r[:1000] for r in reports[:3])}

{discovery_context}

{pubmed_context}

# Figures Generated
{figure_list}

# Format Rules
- Use a single ## heading, then numbered recommendations.
- Each recommendation: bold title, then 2-3 bullet points (What/Why/How or What/Why/Protocol).
- CRITICAL: Every "Why" must cite a SPECIFIC result from the paper (e.g., "the 15 dysregulated miRNAs identified in Table 1" or "the p<0.001 cluster separation shown in Figure 3").
- If PubMed references are available, cite relevant ones (Author et al., Year, PMID) to support methodology choices.
- End with a 1-sentence **Priority Summary** ranking the recommendations.
- STRICT: Keep under 500 words total.
"""

        try:
            from google.adk.models.llm_request import LlmRequest
            from google.genai import types as genai_types
            config_kwargs = {"temperature": 0.4, "max_output_tokens": 2000}
            if (provider_for_config or "").lower() != "bedrock":
                config_kwargs["top_p"] = 0.95

            llm_request = LlmRequest(
                model=llm_model_name,
                contents=[genai_types.Content(
                    role="user",
                    parts=[genai_types.Part(text=prompt)],
                )],
                config=genai_types.GenerateContentConfig(**config_kwargs),
            )

            response = None
            async for llm_response in llm.generate_content_async(llm_request=llm_request, stream=False):
                response = llm_response
                break

            result_text = ""
            if response and response.content and response.content.parts:
                for part in response.content.parts:
                    if hasattr(part, "text") and part.text:
                        result_text += part.text

            if not result_text:
                result_text = f"Could not generate {suggestion_type} data suggestions. Please check LLM configuration."

            # Save to project directory
            filename = f"{suggestion_type}_data_suggestions.md"
            save_path = working_dir / filename
            save_path.write_text(result_text, encoding="utf-8")

            # Add to project files if not already there
            existing_paths = {f.path for f in project.files}
            if filename not in existing_paths:
                project.files.append(GeneratedFile(
                    path=filename, name=filename,
                    size=len(result_text), type="report",
                    created_at=_now(),
                ))

            # Persist in project model
            if suggestion_type == "in_silico":
                project.in_silico_suggestions = result_text
            else:
                project.experimental_suggestions = result_text
            self._save_project(project)

            return result_text

        except Exception as e:
            logger.exception(f"Data suggestion generation failed for {suggestion_type}")
            raise

    def _generate_fallback_paper(self, project, reports, figures, readme):
        """Generate a simple paper from collected outputs without LLM."""
        sections = [
            "## Abstract\n\nThis document compiles the complete analysis outputs.\n",
            f"## Research Question\n\n{project.query}\n",
            f"## Analysis Overview\n\n{readme}\n" if readme else "",
        ]
        if reports:
            sections.append("## Detailed Reports\n\n" + "\n\n---\n\n".join(reports))
        if figures:
            sections.append("## Figures\n\n")
            for i, f in enumerate(figures, 1):
                sections.append(f"### Figure {i}: {f.name}\n\n![{f.name}]({f.path})\n")
        return "\n\n".join(sections)
