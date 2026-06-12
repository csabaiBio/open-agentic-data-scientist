"""
Core API for Agentic Data Scientist - Simplified stateless interface.

This module provides the main DataScientist class for running agents
with optional conversation context and file handling.
"""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional, Union

from dotenv import load_dotenv

from agentic_data_scientist.agents.adk.utils import (
    CODING_MODEL_NAME,
    DEFAULT_MODEL_NAME,
    calculate_llm_cost,
    resolve_model_name,
    resolve_provider_for_role,
    resolve_provider_from_model_name,
)
from agentic_data_scientist.core.events import (
    CompletedEvent,
    ErrorEvent,
    FunctionCallEvent,
    FunctionResponseEvent,
    MessageEvent,
    UsageEvent,
    event_to_dict,
)
from agentic_data_scientist.core.checkpoint import ReadmeCheckpointStore


# Load environment variables
load_dotenv(override=False)

logger = logging.getLogger(__name__)
logging.getLogger("google_adk.google.adk.tools.base_authenticated_tool").setLevel(logging.ERROR)


@dataclass
class SessionConfig:
    """Configuration for an Agentic Data Scientist session."""

    agent_type: str = "adk"  # "adk" or "claude_code"
    mcp_servers: Optional[List[str]] = None
    max_llm_calls: int = 1024
    session_id: Optional[str] = None
    working_dir: Optional[str] = None
    auto_cleanup: bool = True


@dataclass
class FileInfo:
    """Information about an uploaded file."""

    name: str
    path: str
    size_kb: float


@dataclass
class Result:
    """Result from running an agent."""

    session_id: str
    status: str
    response: Optional[str] = None
    error: Optional[str] = None
    files_created: List[str] = field(default_factory=list)
    duration: Optional[float] = None
    events_count: int = 0


class DataScientist:
    """
    Simplified stateless API for Agentic Data Scientist agents.

    This class provides a clean interface for running ADK or Claude Code agents
    with optional conversation context and file handling.

    Parameters
    ----------
    agent_type : str, optional
        Type of agent to use: "adk" or "claude_code" (default: "adk")
    mcp_servers : List[str], optional
        List of MCP servers to enable
    working_dir : str, optional
        Working directory for the session. If not provided, defaults to
        "./agentic_output/" in the current directory
    auto_cleanup : bool, optional
        Whether to automatically cleanup the working directory after completion.
        Defaults to False (files are preserved)
    """

    def __init__(
        self,
        agent_type: str = "adk",
        mcp_servers: Optional[List[str]] = None,
        working_dir: Optional[str] = None,
        auto_cleanup: Optional[bool] = None,
        model_config: Optional[dict] = None,
        ask_fn=None,
    ):
        """Initialize Agentic Data Scientist core with configuration."""
        self.model_config = model_config
        self.ask_fn = ask_fn  # Optional async callable for human-in-the-loop questions
        # Generate session ID
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        unique_id = uuid.uuid4().hex[:8]
        self.session_id = f"session_{timestamp}_{unique_id}"

        # Set up working directory
        if working_dir:
            self.working_dir = Path(working_dir)
            self.working_dir.mkdir(parents=True, exist_ok=True)
            self._user_provided_dir = True
            # Default: don't cleanup user-provided directories
            self.auto_cleanup = auto_cleanup if auto_cleanup is not None else False
        else:
            # Default to ./agentic_output/ subdirectory in current directory
            self.working_dir = Path("./agentic_output")
            self.working_dir.mkdir(parents=True, exist_ok=True)
            self._user_provided_dir = False
            # Default: don't cleanup default directory
            self.auto_cleanup = auto_cleanup if auto_cleanup is not None else False

        self.config = SessionConfig(
            agent_type=agent_type,
            mcp_servers=mcp_servers,
            working_dir=str(self.working_dir),
            auto_cleanup=self.auto_cleanup,
        )

        max_events_to_keep = self._read_int_env(
            "CHECKPOINT_MAX_EVENTS",
            default=200,
            minimum=1,
        )
        max_summaries_to_keep = self._read_int_env(
            "CHECKPOINT_MAX_SUMMARIES",
            default=3,
            minimum=1,
        )
        self.checkpoint_store = ReadmeCheckpointStore(
            readme_path=self.working_dir / "README.md",
            session_id=self.session_id,
            max_events_to_keep=max_events_to_keep,
            max_summaries_to_keep=max_summaries_to_keep,
        )
        self._checkpoint_event_interval = self._read_int_env(
            "CHECKPOINT_EVENT_INTERVAL",
            default=10,
            minimum=1,
        )

        # ADK components
        self.agent = None
        self.app = None  # Will store App instance for ADK agents
        self.session_service = None
        self.runner = None

        logger.info(f"Initialized Agentic Data Scientist session: {self.session_id}")
        logger.info(f"Working directory: {self.working_dir}")
        logger.info(f"Auto-cleanup enabled: {self.auto_cleanup}")

    def _read_int_env(self, env_name: str, default: int, minimum: int) -> int:
        """Read an integer environment variable with safe fallback and bounds."""
        raw = (os.getenv(env_name) or "").strip()
        if not raw:
            return default

        try:
            value = int(raw)
        except ValueError:
            logger.warning("Invalid %s=%r. Using default %s.", env_name, raw, default)
            return default

        if value < minimum:
            logger.warning("%s=%s is below minimum %s. Clamping.", env_name, value, minimum)
            return minimum

        return value

    def _checkpoint_event(self, event_type: str, message: str, data: Optional[Dict[str, Any]] = None) -> None:
        """Write a checkpoint event without interrupting execution on failure."""
        try:
            self.checkpoint_store.record_event(
                event_type=event_type,
                message=message,
                data=data,
            )
        except Exception as exc:
            logger.warning(f"Failed to write checkpoint event '{event_type}': {exc}")

    def _checkpoint_summary(
        self,
        summary: str,
        state_digest: Optional[Dict[str, Any]] = None,
        findings: Optional[List[str]] = None,
        files: Optional[List[Dict[str, str]]] = None,
    ) -> None:
        """Write a checkpoint summary with optional findings and file list.
        
        Args:
            summary: Text summary of progress
            state_digest: Additional state metadata
            findings: List of important findings discovered
            files: List of dicts with 'path' and 'purpose' keys
        """
        try:
            self.checkpoint_store.write_summary(
                summary=summary,
                state_digest=state_digest,
                findings=findings,
                files=files,
            )
        except Exception as exc:
            logger.warning(f"Failed to write checkpoint summary: {exc}")

    def write_plan_md(self, project_plan: str, status: str = "in_progress") -> None:
        """Write project plan and current status to Plan.md.
        
        Args:
            project_plan: The project plan/research question
            status: Current status (in_progress, completed, failed, etc.)
        """
        try:
            self.checkpoint_store.write_plan_md(project_plan, status)
        except Exception as exc:
            logger.warning(f"Failed to write Plan.md: {exc}")

    def _extract_findings_from_response(self, response_text: str) -> List[str]:
        """Extract key findings from response text.
        
        Looks for patterns like:
        - Lines starting with "finding:" or "- Finding:"
        - Summary sections
        """
        findings = []
        if not response_text:
            return findings
        
        lines = response_text.split('\n')
        for line in lines:
            line_lower = line.lower()
            if 'finding:' in line_lower or (line.strip().startswith('- finding') and ':' in line):
                text = line.split(':', 1)[-1].strip()
                if text and len(text) > 10:
                    findings.append(text[:200])  # Limit to 200 chars per finding
        
        return findings[:5]  # Return top 5 findings

    def _classify_file_purpose(self, file_path: str) -> str:
        """Infer the purpose of a generated file from its name and extension."""
        path_lower = file_path.lower()
        
        if 'figure' in path_lower or path_lower.endswith(('.png', '.jpg', '.svg', '.pdf')):
            return 'Visualization/figure'
        elif 'report' in path_lower or 'summary' in path_lower or path_lower.endswith('.md'):
            return 'Report/summary'
        elif 'data' in path_lower or path_lower.endswith(('.csv', '.json', '.xlsx')):
            return 'Data/output file'
        elif 'code' in path_lower or path_lower.endswith(('.py', '.R', '.js')):
            return 'Code/script'
        elif 'model' in path_lower or path_lower.endswith(('.pkl', '.pth', '.h5')):
            return 'Model/checkpoint'
        else:
            return 'Generated file'

    def _build_files_context(self, files_created: List[str]) -> List[Dict[str, str]]:
        """Build files context with paths and purposes for checkpoint."""
        files_context = []
        for file_path in files_created[:20]:  # Limit to 20 most important files
            files_context.append({
                'path': file_path,
                'purpose': self._classify_file_purpose(file_path),
            })
        return files_context

    def load_checkpoint_state(self) -> Dict[str, Any]:
        """Load the latest checkpoint summary and subsequent events."""
        return self.checkpoint_store.load_resume_state()

    def _resolve_usage_model_name(self, author: Optional[str]) -> str:
        """Resolve the most likely model name for a streamed usage event."""
        role = self._resolve_usage_role(author)

        if self.model_config:
            return resolve_model_name(self.model_config, role=role)

        return CODING_MODEL_NAME if role == "coding" else DEFAULT_MODEL_NAME

    def _resolve_usage_role(self, author: Optional[str]) -> str:
        """Infer the model role that produced a streamed usage event."""
        author_key = (author or "").lower()
        if any(key in author_key for key in ("code_agent", "claude", "coding")):
            return "coding"
        if "review" in author_key:
            return "review"
        return "planning"

    async def _setup_agent(self):
        """Set up the agent and session service."""
        if self.agent is not None:
            return  # Already set up

        import time as _time
        _t_setup_start = _time.perf_counter()

        if self.config.agent_type == "adk":
            from agentic_data_scientist.agents.adk import create_app

            # Create App instead of bare agent
            app = create_app(
                working_dir=str(self.working_dir),
                mcp_servers=self.config.mcp_servers,
                model_config=self.model_config,
                ask_fn=self.ask_fn,
            )

            # Store both app and agent references
            self.app = app
            self.agent = app.root_agent  # For compatibility

        elif self.config.agent_type == "claude_code":
            import warnings
            from google.adk.agents import Agent
            from google.adk.apps import App
            from google.adk.apps.app import EventsCompactionConfig

            _t_import = _time.perf_counter()
            from agentic_data_scientist.agents.claude_code import ClaudeCodeAgent
            logger.info("[TIMING] ClaudeCodeAgent import: %.3fs", _time.perf_counter() - _t_import)

            # Create claude code agent
            _t_agent = _time.perf_counter()
            claude_agent = ClaudeCodeAgent(
                working_dir=str(self.working_dir),
                model_config=self.model_config,
            )
            logger.info("[TIMING] ClaudeCodeAgent() constructor: %.3fs", _time.perf_counter() - _t_agent)
            print(f"Created Claude Code Agent with model_config: {self.model_config}")
            self.agent = claude_agent

            # Create App with compression config (no caching for claude_code)
            _t_app = _time.perf_counter()
            with warnings.catch_warnings():
                warnings.filterwarnings("ignore", category=UserWarning, message=".*EventsCompactionConfig.*")
                compression_config = EventsCompactionConfig(
                    summarizer=None,
                    compaction_interval=3,  # Compress every 3 invocations
                    overlap_size=2,
                )

            self.app = App(
                name="agentic-data-scientist-claude",
                root_agent=claude_agent,
                events_compaction_config=compression_config,
            )
            logger.info("[TIMING] App() creation: %.3fs", _time.perf_counter() - _t_app)
        else:
            raise ValueError(f"Unknown agent type: {self.config.agent_type}")

        _t_runner_import = _time.perf_counter()
        from google.adk.runners import Runner
        from google.adk.sessions import InMemorySessionService
        logger.info("[TIMING] Runner/Session import: %.3fs", _time.perf_counter() - _t_runner_import)

        # Create session service
        _t_session = _time.perf_counter()
        self.session_service = InMemorySessionService()

        # Get app_name from app if available, otherwise use default
        app_name = self.app.name if self.app else "agentic_data_scientist"

        # Pre-create the session
        session = await self.session_service.create_session(
            app_name=app_name,
            user_id="default_user",
            session_id=self.session_id,
        )
        self.session = session
        logger.info("[TIMING] Session creation: %.3fs", _time.perf_counter() - _t_session)

        # Create runner with App if available
        _t_runner = _time.perf_counter()
        if self.app:
            self.runner = Runner(
                app=self.app,  # Pass App instead of agent
                session_service=self.session_service,
            )
        else:
            # Fallback for claude_code (though we should always have app now)
            self.runner = Runner(
                agent=self.agent,
                app_name="agentic_data_scientist",
                session_service=self.session_service,
            )
        logger.info("[TIMING] Runner() creation: %.3fs", _time.perf_counter() - _t_runner)

        logger.info("[TIMING] _setup_agent total: %.3fs", _time.perf_counter() - _t_setup_start)
        logger.info(f"Agent setup complete: {self.config.agent_type}")

    def save_files(self, files: List[tuple]) -> List[FileInfo]:
        """
        Save files to the working directory.

        Parameters
        ----------
        files : List[tuple]
            List of (filename, content) tuples where content can be bytes or Path

        Returns
        -------
        List[FileInfo]
            List of saved file information
        """
        user_data_dir = self.working_dir / "user_data"
        user_data_dir.mkdir(parents=True, exist_ok=True)

        file_info_list = []
        for filename, content in files:
            file_path = user_data_dir / filename
            file_path.parent.mkdir(parents=True, exist_ok=True)

            if isinstance(content, (bytes, bytearray)):
                file_path.write_bytes(content)
                size_kb = len(content) / 1024
            elif isinstance(content, (str, Path)):
                source_path = Path(content)
                if not source_path.exists():
                    raise FileNotFoundError(f"Source file not found: {source_path}")
                file_path.write_bytes(source_path.read_bytes())
                size_kb = source_path.stat().st_size / 1024
            else:
                raise TypeError(f"Invalid content type for {filename}: {type(content)}")

            file_info = FileInfo(name=filename, path=str(file_path), size_kb=size_kb)
            file_info_list.append(file_info)
            logger.info(f"Saved file: {filename} ({size_kb:.1f} KB)")

        return file_info_list

    def prepare_prompt(self, message: str, file_info: Optional[List[FileInfo]] = None) -> str:
        """
        Prepare the prompt with optional file information.

        Parameters
        ----------
        message : str
            User's message
        file_info : List[FileInfo], optional
            List of uploaded files

        Returns
        -------
        str
            Complete prompt with file information
        """
        if not file_info:
            return message

        prompt_parts = [message, "", "=" * 60, "USER DATA FILES:"]
        prompt_parts.append(f"The following files are available in your workspace at: {self.working_dir}/user_data/")
        prompt_parts.append("")

        for info in file_info:
            prompt_parts.append(f"- user_data/{info.name} ({info.size_kb:.1f} KB)")

        prompt_parts.extend(
            [
                "",
                "These files are in your workspace under the 'user_data' folder.",
                "You can directly read and analyze them.",
                "=" * 60,
                "",
            ]
        )

        return "\n".join(prompt_parts)

    async def run_async(
        self,
        message: str,
        files: Optional[List[tuple]] = None,
        stream: bool = False,
        context: Optional[Dict] = None,
    ) -> Union[Result, AsyncGenerator[Dict[str, Any], None]]:
        """
        Run agent asynchronously.

        Parameters
        ----------
        message : str
            User's message/prompt
        files : List[tuple], optional
            List of (filename, content) tuples
        stream : bool, optional
            If True, return an async generator for streaming responses
        context : Dict, optional
            Optional conversation context (not implemented yet)

        Returns
        -------
        Union[Result, AsyncGenerator]
            Result if stream=False, or AsyncGenerator if stream=True
        """
        start_time = datetime.now()
        previous_checkpoint_state = self.load_checkpoint_state()
        previous_summary = previous_checkpoint_state.get("latest_summary")
        if previous_summary:
            self._checkpoint_event(
                event_type="resume_context_loaded",
                message="Loaded previous checkpoint summary from README.md",
                data={
                    "previous_summary": previous_summary.get("summary"),
                    "previous_timestamp": previous_summary.get("timestamp"),
                    "pending_events": len(previous_checkpoint_state.get("events_after_summary", [])),
                },
            )
        self._checkpoint_summary(
            summary="Run started",
            state_digest={
                "agent_type": self.config.agent_type,
                "session_id": self.session_id,
                "message_preview": message[:250],
            },
        )

        try:
            self._last_context = context or {}
            # Set up agent if not already done
            await self._setup_agent()

            # Initialize session state EARLY before any agent execution
            # Get the session from session_service to ensure we're modifying the right instance
            app_name = self.app.name if self.app else "agentic_data_scientist"
            session = await self.session_service.get_session(
                app_name=app_name, user_id="default_user", session_id=self.session_id
            )

            # Set state variables (state is mutable, changes persist automatically)
            session.state["original_user_input"] = message
            session.state["latest_user_input"] = message
            # For Claude Code agent, also set implementation_task
            if self.config.agent_type == "claude_code":
                session.state["implementation_task"] = message
            if context and isinstance(context.get("preferred_claude_skills"), list):
                session.state["preferred_claude_skills"] = context.get("preferred_claude_skills", [])

            logger.info(f"[API] Set session state keys: {list(session.state.keys())}")
            logger.info(f"[API] implementation_task = {session.state.get('implementation_task', 'NOT SET')[:50]}...")

            # Save files if provided
            file_info = self.save_files(files) if files else None
            if file_info:
                self._checkpoint_event(
                    event_type="files_saved",
                    message=f"Saved {len(file_info)} input files",
                    data={"files": [info.name for info in file_info]},
                )

            # Prepare prompt
            full_prompt = self.prepare_prompt(message, file_info)

            if stream:
                return self._stream_responses(full_prompt, start_time)
            else:
                return await self._collect_responses(full_prompt, start_time)

        except Exception as e:
            logger.error(f"Error in run_async: {e}", exc_info=True)
            self._checkpoint_event("run_error", f"run_async failed: {e}")
            self._checkpoint_summary(
                summary="Run failed",
                state_digest={
                    "status": "error",
                    "error": str(e),
                    "session_id": self.session_id,
                },
            )
            if not stream:
                return Result(
                    session_id=self.session_id,
                    status="error",
                    error=str(e),
                    duration=(datetime.now() - start_time).total_seconds(),
                )
            else:
                raise

    async def _stream_responses(self, prompt: str, start_time: datetime) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream responses from the agent."""
        from google.genai import types

        event_count = 0
        message_event_number = 0
        responses = []

        try:
            # Pass initial state to runner via state_delta
            initial_state: Dict[str, Any] = {
                "original_user_input": prompt,
                "latest_user_input": prompt,
            }
            if self.config.agent_type == "claude_code":
                initial_state["implementation_task"] = prompt
            if isinstance(getattr(self, "_last_context", None), dict):
                skills = self._last_context.get("preferred_claude_skills")
                if isinstance(skills, list):
                    initial_state["preferred_claude_skills"] = skills

            async for event in self.runner.run_async(
                user_id="default_user",
                session_id=self.session_id,
                new_message=types.Content(role="user", parts=[types.Part(text=prompt)]),
                state_delta=initial_state,
            ):
                event_count += 1
                if event_count % self._checkpoint_event_interval == 0:
                    self._checkpoint_event(
                        event_type="stream_progress",
                        message=f"Processed {event_count} ADK events",
                        data={"event_count": event_count},
                    )

                # Process event content
                if hasattr(event, 'author') and hasattr(event, 'content'):
                    if event.content and hasattr(event.content, 'parts'):
                        for part in event.content.parts:
                            # Handle text content
                            if hasattr(part, 'text') and part.text:
                                is_thought = hasattr(part, 'thought') and part.thought is True
                                is_partial = getattr(event, 'partial', False)

                                message_event_number += 1
                                msg_event = MessageEvent(
                                    content=part.text,
                                    author=event.author,
                                    timestamp=datetime.now().strftime("%H:%M:%S.%f")[:-3],
                                    is_thought=is_thought,
                                    is_partial=is_partial,
                                    event_number=message_event_number,
                                )
                                yield event_to_dict(msg_event)
                                responses.append(f"[{event.author}]: {part.text}")

                            # Handle function calls
                            if hasattr(part, 'function_call') and part.function_call:
                                fc = part.function_call
                                if fc.name and fc.name.strip():
                                    args = {}
                                    if hasattr(fc, 'args') and fc.args:
                                        try:
                                            import json

                                            args = json.loads(fc.args) if isinstance(fc.args, str) else fc.args
                                        except Exception:
                                            args = {'raw': str(fc.args)}

                                    message_event_number += 1
                                    func_call_event = FunctionCallEvent(
                                        name=fc.name,
                                        arguments=args,
                                        author=event.author,
                                        timestamp=datetime.now().strftime("%H:%M:%S.%f")[:-3],
                                        event_number=message_event_number,
                                    )
                                    yield event_to_dict(func_call_event)
                                    self._checkpoint_event(
                                        event_type="function_call",
                                        message=f"Tool call: {fc.name}",
                                        data={"author": event.author, "arguments": args},
                                    )

                            # Handle function responses
                            if hasattr(part, 'function_response') and part.function_response:
                                fr = part.function_response
                                response_payload = fr.response
                                if not isinstance(response_payload, (dict, list, str, int, float, bool, type(None))):
                                    response_payload = str(response_payload)
                                message_event_number += 1
                                func_resp_event = FunctionResponseEvent(
                                    name=fr.name,
                                    response=response_payload,
                                    author=event.author,
                                    timestamp=datetime.now().strftime("%H:%M:%S.%f")[:-3],
                                    event_number=message_event_number,
                                )
                                yield event_to_dict(func_resp_event)
                                self._checkpoint_event(
                                    event_type="function_response",
                                    message=f"Tool response: {fr.name}",
                                    data={
                                        "author": event.author,
                                        "name": fr.name,
                                        "response": response_payload,
                                    },
                                )

                # Handle usage metadata
                if hasattr(event, 'usage_metadata') and event.usage_metadata:
                    usage = event.usage_metadata
                    if isinstance(usage, types.GenerateContentResponseUsageMetadata):
                        custom_metadata = getattr(event, 'custom_metadata', {}) or {}
                        prompt_tokens = max(int(usage.prompt_token_count or 0), 0)
                        cached_input_tokens = max(int(usage.cached_content_token_count or 0), 0)
                        output_tokens = max(int(usage.candidates_token_count or 0), 0)
                        total_tokens = max(int(usage.total_token_count or 0), 0)
                        if total_tokens < (prompt_tokens + output_tokens):
                            total_tokens = prompt_tokens + output_tokens
                        usage_role = self._resolve_usage_role(getattr(event, 'author', 'agent'))
                        model_name = custom_metadata.get("model") or self._resolve_usage_model_name(getattr(event, 'author', 'agent'))
                        provider = custom_metadata.get("provider") or (
                            resolve_provider_for_role(self.model_config, role=usage_role)
                            if self.model_config
                            else resolve_provider_from_model_name(model_name, fallback="openai")
                        )
                        usage_info = {
                            'prompt_tokens': prompt_tokens,
                            'cached_input_tokens': cached_input_tokens,
                            'output_tokens': output_tokens,
                            'total_tokens': total_tokens,
                        }
                        cost_usd = custom_metadata.get("cost_usd")
                        if cost_usd is None:
                            cost_usd = calculate_llm_cost(
                                model_name=model_name,
                                prompt_tokens=prompt_tokens,
                                completion_tokens=output_tokens,
                                provider_override=provider,
                                cached_tokens=cached_input_tokens,
                                call_type="generate_content",
                            )
                        else:
                            cost_usd = max(float(cost_usd or 0.0), 0.0)
                        usage_event = UsageEvent(
                            author=getattr(event, 'author', 'agent'),
                            model=model_name,
                            provider=provider,
                            cost_usd=cost_usd,
                            usage=usage_info,
                            timestamp=datetime.now().strftime("%H:%M:%S.%f")[:-3],
                        )
                        yield event_to_dict(usage_event)

            # Calculate duration
            duration = (datetime.now() - start_time).total_seconds()

            # Find created files (exclude hidden directories like .venv, .claude)
            files_created = []
            if self.working_dir.exists():
                for file_path in self.working_dir.rglob('*'):
                    if file_path.is_file() and 'user_data' not in file_path.parts:
                        # Exclude hidden directories (starting with .)
                        if not any(part.startswith('.') for part in file_path.parts):
                            relative_path = file_path.relative_to(self.working_dir)
                            files_created.append(str(relative_path))

            # Final completed event
            completed_event = CompletedEvent(
                session_id=self.session_id,
                duration=duration,
                total_events=message_event_number,
                files_created=files_created,
                files_count=len(files_created),
                timestamp=datetime.now().strftime("%H:%M:%S.%f")[:-3],
            )
            self._checkpoint_summary(
                summary="Run completed",
                state_digest={
                    "status": "completed",
                    "duration": duration,
                    "total_events": message_event_number,
                    "files_count": len(files_created),
                },
                files=self._build_files_context(files_created),
            )
            yield event_to_dict(completed_event)

        except Exception as e:
            logger.error(f"Error in stream: {e}", exc_info=True)
            self._checkpoint_event("stream_error", f"Stream failed: {e}")
            self._checkpoint_summary(
                summary="Run failed during streaming",
                state_digest={"status": "error", "error": str(e)},
                files=self._build_files_context(files_created) if 'files_created' in locals() else [],
            )
            error_event = ErrorEvent(content=str(e), timestamp=datetime.now().strftime("%H:%M:%S.%f")[:-3])
            yield event_to_dict(error_event)

    async def _collect_responses(self, prompt: str, start_time: datetime) -> Result:
        """Collect all responses and return a complete result."""
        from google.genai import types

        responses = []
        event_count = 0

        try:
            # Pass initial state to runner via state_delta
            initial_state: Dict[str, Any] = {
                "original_user_input": prompt,
                "latest_user_input": prompt,
            }
            if self.config.agent_type == "claude_code":
                initial_state["implementation_task"] = prompt
            if isinstance(getattr(self, "_last_context", None), dict):
                skills = self._last_context.get("preferred_claude_skills")
                if isinstance(skills, list):
                    initial_state["preferred_claude_skills"] = skills

            async for event in self.runner.run_async(
                user_id="default_user",
                session_id=self.session_id,
                new_message=types.Content(role="user", parts=[types.Part(text=prompt)]),
                state_delta=initial_state,
            ):
                event_count += 1
                if event_count % self._checkpoint_event_interval == 0:
                    self._checkpoint_event(
                        event_type="run_progress",
                        message=f"Processed {event_count} events",
                        data={"event_count": event_count},
                    )

                # Collect text outputs
                if hasattr(event, 'content') and event.content:
                    if hasattr(event.content, 'parts'):
                        for part in event.content.parts:
                            if hasattr(part, 'text') and part.text:
                                is_thought = hasattr(part, 'thought') and part.thought is True
                                author = getattr(event, 'author', 'agent')
                                prefix = f"[{author}]" if not is_thought else f"[{author} - THINKING]"
                                responses.append(f"{prefix}: {part.text}")

            # Calculate duration
            duration = (datetime.now() - start_time).total_seconds()

            # Find created files (exclude hidden directories like .venv, .claude)
            files_created = []
            if self.working_dir.exists():
                for file_path in self.working_dir.rglob('*'):
                    if file_path.is_file() and 'user_data' not in file_path.parts:
                        # Exclude hidden directories (starting with .)
                        if not any(part.startswith('.') for part in file_path.parts):
                            relative_path = file_path.relative_to(self.working_dir)
                            files_created.append(str(relative_path))

            self._checkpoint_summary(
                summary="Run completed",
                state_digest={
                    "status": "completed",
                    "duration": duration,
                    "total_events": event_count,
                    "files_count": len(files_created),
                },
                files=self._build_files_context(files_created),
            )
            return Result(
                session_id=self.session_id,
                status="completed",
                response="\n".join(responses),
                files_created=files_created,
                duration=duration,
                events_count=event_count,
                files=self._build_files_context(files_created) if 'files_created' in locals() else [],
            )

        except Exception as e:
            logger.error(f"Error collecting responses: {e}", exc_info=True)
            self._checkpoint_event("collect_error", f"Collect failed: {e}")
            self._checkpoint_summary(
                summary="Run failed during response collection",
                state_digest={"status": "error", "error": str(e)},
            )
            return Result(
                session_id=self.session_id,
                status="error",
                error=str(e),
                duration=(datetime.now() - start_time).total_seconds(),
            )

    def run(self, message: str, files: Optional[List[tuple]] = None, **kwargs) -> Result:
        """
        Synchronous wrapper for run_async.

        Parameters
        ----------
        message : str
            User's message/prompt
        files : List[tuple], optional
            List of (filename, content) tuples
        **kwargs
            Additional arguments passed to run_async

        Returns
        -------
        Result
            The complete response
        """
        return asyncio.run(self.run_async(message, files, stream=False, **kwargs))

    def cleanup(self):
        """Clean up working directory if auto_cleanup is enabled."""
        if not self.auto_cleanup:
            logger.info(f"Auto-cleanup disabled. Working directory preserved at: {self.working_dir}")
            return

        if self.working_dir and self.working_dir.exists():
            import shutil

            try:
                shutil.rmtree(self.working_dir)
                logger.info(f"Cleaned up working directory: {self.working_dir}")
            except Exception as e:
                logger.warning(f"Failed to clean up working directory: {e}")

    def __enter__(self):
        """Context manager entry."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.cleanup()

    async def __aenter__(self):
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        self.cleanup()
