"""
ClaudeCodeAgent - A coding agent using Claude Agent SDK.

This agent provides a simplified interface to Claude Code for implementing
tasks and plans.
"""

import asyncio
import logging
import os
import queue
import sys
import threading
from pathlib import Path
from typing import Any, AsyncGenerator, Optional

from dotenv import load_dotenv
from google.adk.agents import Agent, InvocationContext
from google.adk.events import Event
from google.genai import types
from pydantic import PrivateAttr

from agentic_data_scientist.agents.adk.utils import (
    is_network_disabled,
    LLM_PROVIDER,
    CODING_MODEL_NAME,
    AWS_BEDROCK_API_KEY,
    AWS_REGION_NAME,
    resolve_model_name,
    resolve_provider_for_role,
)
from agentic_data_scientist.agents.claude_code.templates import (
    get_claude_context,
    get_claude_instructions,
    get_minimal_pyproject,
)


try:
    from claude_agent_sdk import ClaudeAgentOptions, query
    from claude_agent_sdk.types import McpHttpServerConfig
    CLAUDE_SDK_AVAILABLE = True
    CLAUDE_SDK_IMPORT_ERROR = None
except ImportError:
    CLAUDE_SDK_AVAILABLE = False
    CLAUDE_SDK_IMPORT_ERROR = "claude_agent_sdk not installed"

    # Fallback stubs so type construction doesn't fail before the runtime guard.
    class ClaudeAgentOptions:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)

    class McpHttpServerConfig:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)


# Load environment variables
load_dotenv(override=True)

logger = logging.getLogger(__name__)


def _normalize_model_for_claude_sdk(model: str, provider: str) -> str:
    """Convert provider-routed model names to Claude SDK compatible IDs."""
    if not model:
        return model

    normalized = str(model).strip()
    provider = (provider or "").lower()

    # Claude SDK expects Anthropic model IDs without provider prefixes.
    if normalized.startswith("anthropic/"):
        normalized = normalized.split("/", 1)[1]

    # Some configs pass LiteLLM-style Bedrock routes.
    if normalized.startswith("bedrock/"):
        normalized = normalized.split("/", 1)[1]

    # OpenRouter aliases often include provider namespace; Claude SDK does not.
    if provider == "openrouter" and normalized.startswith("openrouter/"):
        normalized = normalized.split("/", 1)[1]

    return normalized


def _infer_provider_from_model_name(model_name: str) -> str:
    """Infer provider from model prefix for Claude Code routing."""
    model = (model_name or "").strip().lower()
    if not model:
        return ""
    if model.startswith("openai/"):
        return "openai"
    if model.startswith("anthropic/"):
        return "anthropic"
    if model.startswith("bedrock/"):
        return "bedrock"
    if model.startswith("openrouter/"):
        return "openrouter"
    if model.startswith(("local/", "ollama/", "huggingface/")):
        return "local"
    return ""


def _augment_local_execution_prompt(prompt: str, attempt: int) -> str:
    """Add strict execution instructions for local models that may answer text-only."""
    base_instruction = (
        "\n\nLOCAL EXECUTION REQUIREMENT:\n"
        "You MUST actually use tools to create files and run commands in the working directory. "
        "A text-only answer, JSON summary, or code snippet is NOT a valid completion. "
        "Do not claim any file exists unless you created it with tools in this session. "
        "Do not claim code was executed unless you ran it with tools in this session."
    )

    if attempt <= 0:
        return prompt + base_instruction

    retry_instruction = (
        "\n\nRETRY REQUIRED:\n"
        "Your previous response described an implementation but did not execute it. "
        "Now perform the real execution using tools: write the files, run the commands, "
        "verify outputs on disk, and only then report success."
    )
    return prompt + base_instruction + retry_instruction


async def _query_via_proactor(prompt, options):
    """
    Bridge for Windows: run claude_agent_sdk.query() in a dedicated thread
    with a ProactorEventLoop (which supports subprocess creation).

    Uvicorn on Windows uses SelectorEventLoop for HTTP, but the Claude Code
    SDK needs ProactorEventLoop to spawn the claude subprocess. This helper
    runs the SDK query in a separate thread and streams results back via a
    thread-safe queue.
    """
    msg_queue = queue.Queue()
    error_holder = [None]

    def _thread_fn():
        loop = asyncio.ProactorEventLoop()
        asyncio.set_event_loop(loop)
        try:
            async def _consume():
                try:
                    async for message in query(prompt=prompt, options=options):
                        msg_queue.put(("msg", message))
                except Exception as e:
                    error_holder[0] = e
                finally:
                    msg_queue.put(("done", None))

            loop.run_until_complete(_consume())
        except Exception as e:
            error_holder[0] = e
            msg_queue.put(("done", None))
        finally:
            try:
                loop.run_until_complete(loop.shutdown_asyncgens())
            except Exception:
                pass
            loop.close()

    thread = threading.Thread(target=_thread_fn, daemon=True)
    thread.start()

    while True:
        # Use to_thread so we don't block the main event loop
        tag, payload = await asyncio.to_thread(msg_queue.get)
        if tag == "done":
            break
        yield payload

    thread.join(timeout=30)

    if error_holder[0]:
        raise error_holder[0]


def setup_skills_directory(working_dir: str) -> None:
    """
    Clone claude-scientific-skills repository and copy skills to .claude/skills/.

    The repository contains a single 'scientific-skills' directory with all skills.

    Parameters
    ----------
    working_dir : str
        Working directory to set up skills in
    """
    import shutil
    import subprocess
    import tempfile

    working_path = Path(working_dir)
    skills_dir = working_path / ".claude" / "skills"
    skills_dir.mkdir(parents=True, exist_ok=True)

    # Clone repo to temp directory
    with tempfile.TemporaryDirectory() as tmpdir:
        repo_url = "https://github.com/K-Dense-AI/claude-scientific-skills.git"
        tmp_repo = Path(tmpdir) / "claude-scientific-skills"

        try:
            logger.info(f"[Claude Code] Cloning claude-scientific-skills to {tmp_repo}")
            subprocess.run(
                ["git", "clone", "--depth", "1", repo_url, str(tmp_repo)], check=True, capture_output=True, timeout=60
            )

            # Copy scientific-skills directory
            source_path = tmp_repo / "scientific-skills"
            if source_path.exists():
                # Copy each skill directory
                for skill_dir in source_path.iterdir():
                    if skill_dir.is_dir():
                        dest_path = skills_dir / skill_dir.name
                        if dest_path.exists():
                            shutil.rmtree(dest_path)
                        shutil.copytree(skill_dir, dest_path)
            else:
                logger.warning(f"[Claude Code] scientific-skills directory not found in {tmp_repo}")

            logger.info(f"[Claude Code] Skills setup complete in {skills_dir}")

        except subprocess.TimeoutExpired:
            logger.warning("[Claude Code] Git clone timed out - skills may not be available")
        except subprocess.CalledProcessError as e:
            logger.warning(f"[Claude Code] Failed to clone skills repo: {e.stderr.decode()}")
        except Exception as e:
            logger.warning(f"[Claude Code] Error setting up skills: {e}")


def setup_working_directory(working_dir: str) -> None:
    """
    Set up the working directory with required files and structure.

    Parameters
    ----------
    working_dir : str
        The working directory path to set up.
    """
    working_path = Path(working_dir)
    working_path.mkdir(parents=True, exist_ok=True)

    # Create standard subdirectories
    subdirs = ["user_data", "workflow", "results"]

    for subdir in subdirs:
        (working_path / subdir).mkdir(exist_ok=True)

    # Set up skills directory
    setup_skills_directory(working_dir)

    # Create pyproject.toml if it doesn't exist
    pyproject_path = working_path / "pyproject.toml"
    if not pyproject_path.exists():
        pyproject_path.write_text(get_minimal_pyproject())
        logger.info(f"[Claude Code] Created pyproject.toml in {working_dir}")

    # Create initial README.md
    readme_path = working_path / "README.md"
    if not readme_path.exists():
        readme_content = f"""# Agentic Data Scientist Session

Working Directory: `{working_dir}`

## Directory Structure

- `user_data/` - Input files from user
- `workflow/` - Implementation scripts and notebooks
- `results/` - Final analysis outputs

## Implementation Progress

_This file will be updated as the implementation progresses._
"""
        readme_path.write_text(readme_content)
        logger.info(f"[Claude Code] Created README.md in {working_dir}")


class ClaudeCodeAgent(Agent):
    """
    Agent that uses Claude Agent SDK for coding tasks.

    This agent:
    - Uses Claude Agent SDK which handles tools internally
    - Provides instructions via system prompt
    - Wraps responses as ADK Events for streaming
    - Uses Claude Code preset for coding-focused behavior
    """

    # Add model config to allow extra attributes
    model_config = {"extra": "allow"}

    _working_dir: Optional[str] = PrivateAttr(default=None)
    _output_key: str = PrivateAttr(default="implementation_summary")
    _model_config: dict[str, Any] = PrivateAttr(default_factory=dict)
    _provider: str = PrivateAttr(default="")

    def __init__(
        self,
        name: str = "claude_coding_agent",
        description: Optional[str] = None,
        working_dir: Optional[str] = None,
        output_key: str = "implementation_summary",
        model_config: Optional[dict] = None,
        after_agent_callback: Optional[Any] = None,
        **kwargs: Any,
    ):
        """
        Initialize the Claude Code agent.

        Parameters
        ----------
        name : str
            Agent name used in ADK event stream.
        description : str, optional
            Human-readable description for the agent.
        working_dir : str, optional
            Working directory for the agent
        output_key : str
            State key where the final implementation summary will be stored.
        after_agent_callback : callable, optional
            Callback function to be invoked after the agent completes execution.
            Useful for event compression or post-processing.

        Notes
        -----
        Claude Agent SDK has a 1MB JSON buffer limit for tool responses. When reading
        large files (>1MB), the agent will fail with a JSON buffer overflow error.
        Instructions are provided to Claude to avoid reading large files directly.

        The model is determined by CODING_MODEL environment variable or detected from LLM_PROVIDER.
        Bedrock requires a Bedrock-specific model ID; other providers use standard model names.
        """
        self._model_config = model_config or {}
        self._provider = resolve_provider_for_role(self._model_config, role="coding")

        raw_coding_model = str(self._model_config.get("coding_model") or "").strip()
        selected_coding_base_source = (self._model_config.get("coding_api_base_source") or "").strip().lower()

        if not self._provider and selected_coding_base_source in {"openai", "anthropic", "local"}:
            self._provider = selected_coding_base_source
        if not self._provider:
            self._provider = _infer_provider_from_model_name(raw_coding_model)
        if not self._provider:
            self._provider = (self._model_config.get("provider") or LLM_PROVIDER or "openai").strip().lower()

        # Resolve coding model from per-project config first, then provider defaults, then env.
        model = resolve_model_name(self._model_config, role="coding")
        if not model:
            model = CODING_MODEL_NAME

        model = _normalize_model_for_claude_sdk(model, self._provider)

        if self._provider == "bedrock" and AWS_BEDROCK_API_KEY and "/" not in model:
            model = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"

        # Pass model to parent Agent class (it has a model field)
        super().__init__(
            name=name,
            description=description or "A coding agent that uses Claude Agent SDK to implement plans",
            model=model,
            after_agent_callback=after_agent_callback,
            **kwargs,
        )
        self._working_dir = working_dir
        self._output_key = output_key

    @property
    def working_dir(self) -> Optional[str]:
        return self._working_dir

    @property
    def output_key(self) -> str:
        return self._output_key

    def _truncate_summary(self, summary: str) -> str:
        """
        Truncate implementation summary to prevent token overflow.

        Parameters
        ----------
        summary : str
            The full implementation summary.

        Returns
        -------
        str
            Truncated summary.
        """
        MAX_CHARS = 40000  # ~10k tokens

        if not summary or len(summary) <= MAX_CHARS:
            return summary

        # Keep start and end
        keep_start = MAX_CHARS * 3 // 4
        keep_end = MAX_CHARS // 4
        truncated = (
            summary[:keep_start]
            + "\n\n[... middle section truncated to fit token limits ...]\n\n"
            + summary[-keep_end:]
        )
        logger.info(
            f"[Claude Code] [{self.name}] Truncated implementation_summary from {len(summary)} to {len(truncated)} chars"
        )
        return truncated

    def _build_usage_metadata(self, usage: Optional[dict[str, Any]]) -> Optional[types.GenerateContentResponseUsageMetadata]:
        """Convert Claude SDK usage dicts to Google GenAI usage metadata."""
        if not usage:
            return None

        prompt_tokens = int(
            usage.get("input_tokens")
            or usage.get("prompt_tokens")
            or usage.get("inputTokens")
            or 0
        )
        output_tokens = int(
            usage.get("output_tokens")
            or usage.get("completion_tokens")
            or usage.get("outputTokens")
            or 0
        )
        cached_tokens = int(
            usage.get("cache_read_input_tokens")
            or usage.get("cached_input_tokens")
            or usage.get("cacheReadInputTokens")
            or 0
        )
        total_tokens = int(
            usage.get("total_tokens")
            or usage.get("totalTokens")
            or (prompt_tokens + output_tokens)
        )

        if total_tokens == 0 and prompt_tokens == 0 and output_tokens == 0 and cached_tokens == 0:
            return None

        return types.GenerateContentResponseUsageMetadata(
            prompt_token_count=prompt_tokens,
            cached_content_token_count=cached_tokens,
            candidates_token_count=output_tokens,
            total_token_count=total_tokens,
        )

    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        """Execute Claude Agent with the implementation plan."""
        try:
            state = ctx.session.state

            if not CLAUDE_SDK_AVAILABLE:
                install_hint = (
                    "Error: `claude-agent-sdk` is required for Claude Code mode but is not installed.\n\n"
                    "Install it in this environment:\n"
                    "  uv pip install claude-agent-sdk\n\n"
                    "Then run your command again."
                )
                logger.error(f"[Claude Code] [{self.name}] {CLAUDE_SDK_IMPORT_ERROR}")
                state[self._output_key] = self._truncate_summary(install_hint)
                yield Event(
                    author=self.name,
                    content=types.Content(role="model", parts=[types.Part.from_text(text=install_hint)]),
                )
                return

            # Get working directory
            working_dir = self._working_dir
            if not working_dir:
                import tempfile

                working_dir = tempfile.mkdtemp(prefix="claude_session_")

            current_stage = state.get("current_stage")

            # Format stage information for the prompt
            if current_stage:
                stage_info = (
                    f"Stage {current_stage.get('index', 0) + 1}: {current_stage.get('title', 'Unknown')}\n\n"
                    f"{current_stage.get('description', '')}"
                )
            else:
                stage_info = ""

            # Set up working directory
            setup_working_directory(working_dir)

            # Yield starting event
            yield Event(
                author=self.name,
                content=types.Content(
                    role="model", parts=[types.Part.from_text(text="Preparing Claude Agent (coding mode)...")]
                ),
            )

            # Generate the prompt with full context (but NOT success criteria - don't show the "answers")
            if stage_info:
                prompt = get_claude_context(
                    implementation_plan=stage_info,
                    working_dir=working_dir,
                    original_request=state.get("original_user_input", ""),
                    completed_stages=state.get("stage_implementations", []),
                    all_stages=state.get("high_level_stages", []),
                )
            else:
                # Fallback: Try multiple state keys to find the task
                task_prompt = (
                    state.get("implementation_task", "")
                    or state.get("original_user_input", "")
                    or state.get("latest_user_input", "")
                    or state.get("user_message", "")
                )

                # Also check if there's a message in the context's initial message
                if not task_prompt and hasattr(ctx, 'initial_message'):
                    initial_msg = ctx.initial_message
                    if initial_msg and hasattr(initial_msg, 'parts'):
                        for part in initial_msg.parts:
                            if hasattr(part, 'text'):
                                task_prompt = part.text
                                break

                if not task_prompt:
                    error_msg = "No implementation task or plan found in state."
                    logger.warning(
                        f"[Claude Code] [{self.name}] {error_msg}. Available state keys: {list(state.keys())}"
                    )
                    yield Event(
                        author=self.name,
                        content=types.Content(role="model", parts=[types.Part.from_text(text=f"Error: {error_msg}")]),
                    )
                    return

                prompt = f"""Create and execute a comprehensive implementation plan.

User Request: {task_prompt}

Working directory: {working_dir}

Requirements:
1. Analyze the request and create a structured plan
2. Execute the plan step by step
3. Save all outputs with descriptive filenames
4. Generate comprehensive documentation
5. Create final execution summary when done"""

            # Generate system instructions
            system_instructions = get_claude_instructions(state=state, working_dir=working_dir)

            env = os.environ.copy()
            env["ANTHROPIC_MODEL"] = str(self.model)

            # Set Anthropic base URL override if provided in model config.
            selected_coding_base_source = (self._model_config.get("coding_api_base_source") or "").strip().lower()
            if selected_coding_base_source == "openai":
                coding_api_base = self._model_config.get("openai_api_base")
            elif selected_coding_base_source == "anthropic":
                coding_api_base = self._model_config.get("anthropic_api_base")
            elif selected_coding_base_source == "local":
                coding_api_base = (
                    self._model_config.get("local_api_base")
                    or os.getenv("LOCAL_API_BASE")
                    or os.getenv("OLLAMA_API_BASE")
                    or os.getenv("OLLAMA_BASE_URL")
                    or os.getenv("LOCAL_LLM_API_BASE")
                    or "http://localhost:11434"
                )
            elif self._provider == "openai":
                coding_api_base = self._model_config.get("openai_api_base") or self._model_config.get("coding_api_base")
            elif self._provider == "anthropic":
                coding_api_base = self._model_config.get("anthropic_api_base") or self._model_config.get("coding_api_base")
            elif self._provider == "local":
                coding_api_base = (
                    self._model_config.get("local_api_base")
                    or self._model_config.get("coding_api_base")
                    or os.getenv("LOCAL_API_BASE")
                    or os.getenv("OLLAMA_API_BASE")
                    or os.getenv("OLLAMA_BASE_URL")
                    or os.getenv("LOCAL_LLM_API_BASE")
                    or "http://localhost:11434"
                )
            else:
                coding_api_base = self._model_config.get("coding_api_base")
            if coding_api_base:
                logger.info(f"[Claude Code] Setting ANTHROPIC_BASE_URL for SDK: {coding_api_base}")
                env["ANTHROPIC_BASE_URL"] = coding_api_base
                env["ANTHROPIC_API_BASE"] = coding_api_base
                if self._provider == "local":
                    env["ANTHROPIC_AUTH_TOKEN"] = "ollama"

            effective_api_base = env.get("ANTHROPIC_BASE_URL") or env.get("ANTHROPIC_API_BASE") or "<default>"
            print(f"[Claude Code] SDK params model={self.model} api_base={effective_api_base} provider={self._provider}, coding_api_base={coding_api_base}, selected_coding_base_source={selected_coding_base_source}")
            logger.info(
                "[Claude Code] SDK params model=%s api_base=%s provider=%s, coding_api_base=%s, selected_coding_base_source=%s",
                self.model,
                effective_api_base,
                self._provider,
                coding_api_base,
                selected_coding_base_source,
            )

            # Ensure PATH includes common locations for the claude binary
            # This is critical when running from server processes (e.g. uvicorn)
            # where the PATH may not include user-local bin directories
            import shutil
            local_bin = str(Path.home() / ".local" / "bin")
            current_path = env.get("PATH", env.get("Path", ""))
            if local_bin not in current_path:
                env["PATH"] = f"{local_bin}{os.pathsep}{current_path}"

            # Try to find the claude binary explicitly
            cli_path = shutil.which("claude", path=env.get("PATH", env.get("Path", "")))
            if not cli_path:
                # Fallback: check common locations
                for candidate in [
                    Path.home() / ".local" / "bin" / "claude.exe",
                    Path.home() / ".local" / "bin" / "claude",
                ]:
                    if candidate.exists():
                        cli_path = str(candidate)
                        break

            if cli_path:
                logger.info(f"[Claude Code] Found claude binary at: {cli_path}")
            else:
                logger.warning("[Claude Code] Could not find claude binary - SDK will attempt to find it")

            # Configure Bedrock for Claude Code if using Bedrock provider
            bedrock_api_key = os.getenv("AWS_BEARER_TOKEN_BEDROCK") or os.getenv("AWS_BEDROCK_API_KEY")
            if self._provider == "bedrock" and bedrock_api_key:
                env["CLAUDE_CODE_USE_BEDROCK"] = "1"
                env["AWS_BEARER_TOKEN_BEDROCK"] = bedrock_api_key
                env["AWS_REGION"] = os.getenv("AWS_REGION_NAME", AWS_REGION_NAME)

            # Create options for Claude Agent SDK
            # Skills are loaded from .claude/skills/ via setting_sources
            # MCP servers are loaded from .claude/settings.json via setting_sources
            options = ClaudeAgentOptions(
                cwd=working_dir,
                permission_mode="bypassPermissions",
                model=self.model,
                env=env,
                cli_path=cli_path,
                system_prompt={"type": "preset", "preset": "claude_code", "append": system_instructions},
                setting_sources=["project", "user", "local"],
                disallowed_tools=["WebFetch", "WebSearch"] if is_network_disabled() else None,
                mcp_servers={
                    "context7": McpHttpServerConfig(
                        type="http",
                        url="https://mcp.context7.com/mcp",
                    )
                },
            )

            yield Event(
                author=self.name,
                content=types.Content(
                    role="model",
                    parts=[types.Part.from_text(text=f"Starting Claude Agent (coding mode) with model: {self.model}")],
                ),
            )

            # CRITICAL MAPPING: Claude Agent SDK → Google GenAI → ADK Events
            #
            # Claude Message Types:
            #   - AssistantMessage: Contains content blocks from Claude (TextBlock, ThinkingBlock, ToolUseBlock)
            #   - UserMessage: User input including ToolResultBlock (tool execution results)
            #   - SystemMessage: System messages
            #   - ResultMessage: Final completion indicator (subtype: 'success' or 'error')
            #
            # Claude Content Block Types → Google GenAI Part Types → ADK Event Types:
            #   AssistantMessage blocks:
            #     - TextBlock              → Part.from_text(text=...)                        → MessageEvent
            #     - ThinkingBlock          → Part(text=..., thought=True)                    → MessageEvent (is_thought=True)
            #     - ToolUseBlock           → Part.from_function_call(name=..., args=...)     → FunctionCallEvent
            #   UserMessage blocks:
            #     - ToolResultBlock        → Part.from_function_response(name=..., response=...) → FunctionResponseEvent
            #     - TextBlock              → Part.from_text(text=...)                        → MessageEvent
            #
            # This mapping ensures proper event parsing and emission.

            max_attempts = 2 if self._provider == "local" else 1
            final_output_lines = []

            for attempt in range(max_attempts):
                attempt_prompt = (
                    _augment_local_execution_prompt(prompt, attempt)
                    if self._provider == "local"
                    else prompt
                )

                # Execute with Claude Code SDK - stream messages in real-time
                output_lines = []
                received_final_result = False  # After ResultMessage, keep draining to let SDK close cleanly
                retry_required = False
                saw_tool_use = False
                saw_tool_result = False

                # Track tool calls to match with their results
                # Claude uses tool_use_id to link ToolUseBlock with ToolResultBlock
                tool_id_to_name = {}

                # Stream messages as they arrive for real-time processing
                # On Windows, uvicorn uses SelectorEventLoop which doesn't support
                # subprocess creation. Use _query_via_proactor to bridge through
                # a ProactorEventLoop in a separate thread.
                query_source = (
                    _query_via_proactor(attempt_prompt, options)
                    if sys.platform == "win32"
                    else query(prompt=attempt_prompt, options=options)
                )
                try:
                    async for message in query_source:
                    # If we've already seen the final ResultMessage, ignore any subsequent messages
                    # and continue draining so the SDK can shut down its internal task group cleanly.
                        if received_final_result:
                            continue
                        if message is None:
                            continue

                        # Get the type name dynamically to avoid import issues
                        message_type = type(message).__name__

                        if message_type == "AssistantMessage":
                        # Assistant message contains content blocks - convert to Google GenAI Parts
                        # Each AssistantMessage becomes one Event with multiple Parts
                            content_blocks = getattr(message, 'content', [])

                        # Collect all parts for a single Event
                            google_parts = []

                            for block in content_blocks:
                                block_type = type(block).__name__

                                if block_type == "TextBlock":
                                # Regular text output from Claude
                                # Map to: Part.from_text(text=...)
                                    text = getattr(block, 'text', '')
                                    if text:
                                        output_lines.append(text)
                                        google_parts.append(types.Part.from_text(text=text))
                                        logger.info(f"[Claude Code] [TextBlock] {len(text)} chars")

                                elif block_type == "ThinkingBlock":
                                # Extended thinking (if enabled)
                                # Map to: Part(text=..., thought=True)
                                    thinking = getattr(block, 'thinking', '')
                                    if thinking:
                                        logger.info(
                                            f"[Claude Code] [ThinkingBlock] {len(thinking)} chars: {thinking[:100]}..."
                                        )
                                        # Create Part with thought flag set to True
                                        # This will be parsed as MessageEvent with is_thought=True
                                        google_parts.append(types.Part(text=thinking, thought=True))

                                elif block_type == "ToolUseBlock":
                                # Claude is requesting to use a tool
                                # Map to: Part.from_function_call(name=..., args=...)
                                    tool_id = getattr(block, 'id', '')
                                    tool_name = getattr(block, 'name', 'unknown')
                                    tool_input = getattr(block, 'input', {})
                                    saw_tool_use = True

                                    logger.info(
                                        f"[Claude Code] [ToolUseBlock] {tool_name} (id: {tool_id}) with args: {list(tool_input.keys())}"
                                    )

                                # Store mapping from tool_use_id to tool_name for later matching
                                    if tool_id:
                                        tool_id_to_name[tool_id] = tool_name

                                # Convert to Google GenAI function call format
                                # This will be parsed as FunctionCallEvent downstream
                                    google_parts.append(types.Part.from_function_call(name=tool_name, args=tool_input))

                                else:
                                # Unknown content block type in AssistantMessage
                                    logger.info(
                                        f"[Claude Code] [AssistantMessage] Unknown ContentBlock type: {block_type} - {block}"
                                    )
                                    google_parts.append(types.Part.from_text(text=f"[Unknown block: {block_type}]"))

                        # Yield a single Event with all converted Parts from this AssistantMessage
                            if google_parts:
                                yield Event(author=self.name, content=types.Content(role="model", parts=google_parts))

                            usage_metadata = self._build_usage_metadata(getattr(message, 'usage', None))
                            if usage_metadata:
                                yield Event(
                                    author=self.name,
                                    usage_metadata=usage_metadata,
                                    custom_metadata={
                                        "model": getattr(message, 'model', str(self.model) if self.model else ""),
                                        "provider": LLM_PROVIDER,
                                    },
                                )

                        elif message_type == "UserMessage":
                        # User message - contains ToolResultBlock (tool execution results) and possibly TextBlock
                        # In Claude Agent SDK, tool results come back as UserMessage with ToolResultBlock
                            content_blocks = getattr(message, 'content', [])
                            logger.info(f"[Claude Code] Received UserMessage with {len(content_blocks)} content blocks")

                        # Parse content blocks and convert to Google GenAI Parts
                            google_parts = []

                            for block in content_blocks:
                                block_type = type(block).__name__

                                if block_type == "ToolResultBlock":
                                # Result from a tool execution (comes from user/system after executing tool)
                                # Map to: Part.from_function_response(name=..., response=...)
                                    tool_use_id = getattr(block, 'tool_use_id', '')
                                    is_error = getattr(block, 'is_error', False)
                                    content = getattr(block, 'content', '')
                                    saw_tool_result = True

                                # Retrieve the tool name from our tracking dict
                                    tool_name = tool_id_to_name.get(tool_use_id, f"tool_{tool_use_id}")

                                # Convert Claude's content format to Google's response format
                                # Claude returns content as list of content items, Google expects dict
                                    response_data = {}

                                    if isinstance(content, list):
                                    # Extract text from content blocks
                                        text_parts = []
                                        for content_item in content:
                                            if isinstance(content_item, dict):
                                                if content_item.get('type') == 'text':
                                                    text_parts.append(content_item.get('text', ''))
                                            elif hasattr(content_item, 'text'):
                                                text_parts.append(getattr(content_item, 'text', ''))

                                        combined_text = '\n'.join(text_parts) if text_parts else ''
                                        if is_error:
                                            response_data = {'error': combined_text}
                                            logger.info(
                                                f"[Claude Code] [ToolResultBlock] ERROR for {tool_name}: {combined_text[:200]}..."
                                            )
                                        else:
                                            response_data = {'output': combined_text}
                                            logger.info(
                                                f"[Claude Code] [ToolResultBlock] SUCCESS for {tool_name}: {combined_text[:200]}..."
                                            )
                                    elif isinstance(content, str):
                                        if is_error:
                                            response_data = {'error': content}
                                        else:
                                            response_data = {'output': content}
                                        logger.info(f"[Claude Code] [ToolResultBlock] {tool_name}: {content[:200]}...")
                                    else:
                                    # Fallback for other content types
                                        content_str = str(content)
                                        if is_error:
                                            response_data = {'error': content_str}
                                        else:
                                            response_data = {'output': content_str}
                                        logger.info(
                                            f"[Claude Code] [ToolResultBlock] {tool_name} (converted to str): {content_str[:200]}..."
                                        )

                                # Convert to Google GenAI function response format
                                # This will be parsed as FunctionResponseEvent downstream
                                    google_parts.append(
                                        types.Part.from_function_response(name=tool_name, response=response_data)
                                    )

                                elif block_type == "TextBlock":
                                # User can also send text input
                                    text = getattr(block, 'text', '')
                                    if text:
                                        logger.info(f"[Claude Code] [UserMessage.TextBlock] {len(text)} chars")
                                        google_parts.append(types.Part.from_text(text=text))

                                else:
                                # Unknown content block type in UserMessage
                                    logger.info(
                                        f"[Claude Code] [UserMessage] Unknown ContentBlock type: {block_type} - {block}"
                                    )
                                    google_parts.append(types.Part.from_text(text=f"[Unknown user block: {block_type}]"))

                        # Yield Event with all converted Parts from this UserMessage
                        # Use role="model" since this is from the user/system executing tools
                        # COMMENTED OUT: Prevents long tool responses from polluting ADK context
                        # Tool responses are still logged above for debugging
                        # if google_parts:
                        #     yield Event(author=self.name, content=types.Content(role="model", parts=google_parts))

                        elif message_type == "SystemMessage":
                        # System message
                            logger.info(f"[Claude Code] Received SystemMessage: {message}")

                        elif message_type == "ResultMessage":
                        # Final result from Claude - indicates task completion
                            subtype = getattr(message, 'subtype', None)

                            if subtype == 'success':
                                if self._provider == "local" and not (saw_tool_use or saw_tool_result):
                                    if attempt + 1 < max_attempts:
                                        retry_required = True
                                        retry_text = (
                                            "Local model returned a text-only implementation without executing any tools. "
                                            "Retrying with stricter execution instructions..."
                                        )
                                        logger.warning(f"[Claude Code] [{self.name}] {retry_text}")
                                        yield Event(
                                            author=self.name,
                                            content=types.Content(role="model", parts=[types.Part.from_text(text=retry_text)]),
                                        )
                                    else:
                                        error_text = (
                                            "Error: The local model described an implementation but did not actually execute any tools.\n\n"
                                            "No code was run and any reported output files may be hypothetical. "
                                            "Use a local backend/model that supports Claude Code tool use, or switch to a provider "
                                            "with reliable tool execution."
                                        )
                                        output_lines.append(error_text)
                                        state[self._output_key] = self._truncate_summary(error_text)
                                        yield Event(
                                            author=self.name,
                                            content=types.Content(role="model", parts=[types.Part.from_text(text=error_text)]),
                                        )
                                else:
                                    result_text = "\n=== Task Completed Successfully ==="
                                    output_lines.append(result_text)

                                    # Create summary from all output and truncate to prevent downstream token overflow
                                    summary = "\n".join(output_lines)
                                    state[self._output_key] = self._truncate_summary(summary)
                                    final_output_lines = output_lines

                                    yield Event(
                                        author=self.name,
                                        content=types.Content(role="model", parts=[types.Part.from_text(text=result_text)]),
                                    )
                            elif subtype == 'error':
                                error_text = "\n=== Task Failed ==="
                                error_details = getattr(message, 'error', '')
                                if error_details:
                                    error_text += f"\nError: {error_details}"

                                output_lines.append(error_text)
                                state[self._output_key] = self._truncate_summary(error_text)

                                yield Event(
                                    author=self.name,
                                    content=types.Content(role="model", parts=[types.Part.from_text(text=error_text)]),
                                )

                        # Mark that we've received the final result but DO NOT break the loop.
                        # Draining the generator avoids injecting GeneratorExit into the SDK
                        # which triggers anyio cancel-scope cross-task errors.
                            received_final_result = True

                        else:
                        # Unknown message type - log it with full details
                            logger.info(f"[Claude Code] [Unknown Message type: {message_type}] - Message: {message}")

                # If no result message, create summary from output
                    if not retry_required:
                        if self._output_key not in state:
                            summary = "\n".join(output_lines[-20:]) if output_lines else "Task completed (no output captured)"
                            state[self._output_key] = self._truncate_summary(summary)
                        break

                except asyncio.CancelledError:
                    # If the query was cancelled, just propagate the cancellation
                    logger.info(f"[Claude Code] [{self.name}] Agent cancelled during Claude query execution")
                    raise
                except Exception as e:
                    # Specific handling for JSON buffer overflow errors
                    error_msg = str(e)
                    if "JSON message exceeded maximum buffer" in error_msg:
                        logger.error(
                            f"[Claude Code] [{self.name}] Claude SDK buffer overflow - likely tried to read file >1MB. "
                            "Claude Agent SDK has a 1MB limit on tool response sizes."
                        )
                        summary = (
                            "Error: File too large for Claude SDK buffer (>1MB limit).\n\n"
                            "Claude attempted to read a large file which exceeded the internal 1MB buffer limit "
                            "of the Claude Agent SDK subprocess communication channel.\n\n"
                            "To fix this issue:\n"
                            "1. Use command-line tools (head, tail, wc, ls -lh) to inspect file sizes and contents\n"
                            "2. For large CSV/data files, use pandas with nrows parameter to load only portions\n"
                            "3. Process large files in chunks rather than loading entirely\n"
                            "4. Use streaming or iterative processing for files over 1MB\n\n"
                            f"Full error: {error_msg[:500]}"
                        )
                        state[self._output_key] = self._truncate_summary(summary)
                        yield Event(
                            author=self.name,
                            content=types.Content(role="model", parts=[types.Part.from_text(text=summary)]),
                        )
                        break
                    else:
                        # Re-raise other exceptions for generic handling
                        raise

        except Exception as e:
            # Generic exception handler for all other errors
            logger.error(f"[Claude Code] [{self.name}] Error in Claude Agent: {e}", exc_info=True)
            state[self._output_key] = self._truncate_summary(f"Error: {str(e)}")
            yield Event(
                author=self.name,
                content=types.Content(role="model", parts=[types.Part.from_text(text=f"Error: {str(e)}")]),
            )
