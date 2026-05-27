"""Unit tests for core API."""

from datetime import datetime
from pathlib import Path

import pytest

from agentic_data_scientist.core.api import DataScientist, FileInfo, Result, SessionConfig


class TestSessionConfig:
    """Test SessionConfig dataclass."""

    def test_default_config(self):
        """Test default configuration."""
        config = SessionConfig()
        assert config.agent_type == "adk"
        assert config.mcp_servers is None
        assert config.max_llm_calls == 1024

    def test_custom_config(self):
        """Test custom configuration."""
        config = SessionConfig(
            agent_type="claude_code",
            mcp_servers=["filesystem", "fetch"],
            max_llm_calls=512,
        )
        assert config.agent_type == "claude_code"
        assert config.mcp_servers == ["filesystem", "fetch"]
        assert config.max_llm_calls == 512


class TestFileInfo:
    """Test FileInfo dataclass."""

    def test_file_info_creation(self):
        """Test FileInfo creation."""
        file_info = FileInfo(name="test.txt", path="/path/to/test.txt", size_kb=1.5)
        assert file_info.name == "test.txt"
        assert file_info.path == "/path/to/test.txt"
        assert file_info.size_kb == 1.5


class TestResult:
    """Test Result dataclass."""

    def test_successful_result(self):
        """Test successful result."""
        result = Result(
            session_id="test_session",
            status="completed",
            response="Test response",
            files_created=["output.txt"],
            duration=1.5,
            events_count=10,
        )
        assert result.session_id == "test_session"
        assert result.status == "completed"
        assert result.response == "Test response"
        assert result.error is None
        assert len(result.files_created) == 1
        assert result.duration == 1.5
        assert result.events_count == 10

    def test_error_result(self):
        """Test error result."""
        result = Result(
            session_id="test_session",
            status="error",
            error="Test error",
            duration=0.5,
        )
        assert result.session_id == "test_session"
        assert result.status == "error"
        assert result.error == "Test error"
        assert result.response is None


class TestDataScientist:
    """Test DataScientist class."""

    def test_initialization_adk(self):
        """Test DataScientist initialization with ADK agent."""
        ds = DataScientist(agent_type="adk")
        assert ds.config.agent_type == "adk"
        assert ds.session_id.startswith("session_")
        assert ds.working_dir.exists()
        ds.cleanup()

    def test_initialization_claude_code(self):
        """Test DataScientist initialization with Claude Code agent."""
        ds = DataScientist(agent_type="claude_code")
        assert ds.config.agent_type == "claude_code"
        assert ds.session_id.startswith("session_")
        assert ds.working_dir.exists()
        ds.cleanup()

    def test_checkpoint_env_configuration(self, monkeypatch, tmp_path):
        """Checkpoint cadence and retention should be configurable from env vars."""
        monkeypatch.setenv("CHECKPOINT_EVENT_INTERVAL", "7")
        monkeypatch.setenv("CHECKPOINT_MAX_EVENTS", "80")
        monkeypatch.setenv("CHECKPOINT_MAX_SUMMARIES", "5")

        ds = DataScientist(agent_type="adk", working_dir=str(tmp_path))

        assert ds._checkpoint_event_interval == 7
        assert ds.checkpoint_store.max_events_to_keep == 80
        assert ds.checkpoint_store.max_summaries_to_keep == 5
        ds.cleanup()

    def test_checkpoint_env_invalid_values_fallback(self, monkeypatch, tmp_path):
        """Invalid or too-small env values should fall back or clamp safely."""
        monkeypatch.setenv("CHECKPOINT_EVENT_INTERVAL", "0")
        monkeypatch.setenv("CHECKPOINT_MAX_EVENTS", "not-an-int")
        monkeypatch.setenv("CHECKPOINT_MAX_SUMMARIES", "-3")

        ds = DataScientist(agent_type="adk", working_dir=str(tmp_path))

        assert ds._checkpoint_event_interval == 1
        assert ds.checkpoint_store.max_events_to_keep == 200
        assert ds.checkpoint_store.max_summaries_to_keep == 1
        ds.cleanup()

    def test_save_files_bytes(self, tmp_path):
        """Test saving files from bytes."""
        ds = DataScientist(agent_type="adk")
        ds.working_dir = tmp_path

        content = b"Test content"
        files = [("test.txt", content)]

        file_info_list = ds.save_files(files)

        assert len(file_info_list) == 1
        assert file_info_list[0].name == "test.txt"
        assert Path(file_info_list[0].path).exists()
        assert Path(file_info_list[0].path).read_bytes() == content
        ds.cleanup()

    def test_prepare_prompt_no_files(self):
        """Test prompt preparation without files."""
        ds = DataScientist(agent_type="adk")
        message = "Test message"
        prompt = ds.prepare_prompt(message)
        assert prompt == message
        ds.cleanup()

    def test_prepare_prompt_with_files(self):
        """Test prompt preparation with files."""
        ds = DataScientist(agent_type="adk")
        message = "Analyze these files"
        file_info = [FileInfo(name="data.csv", path="/tmp/data.csv", size_kb=10.5)]

        prompt = ds.prepare_prompt(message, file_info)

        assert "Analyze these files" in prompt
        assert "data.csv" in prompt
        assert "10.5 KB" in prompt
        assert "user_data" in prompt
        ds.cleanup()

    def test_context_manager(self):
        """Test DataScientist as context manager."""
        with DataScientist(agent_type="adk") as ds:
            assert ds.working_dir.exists()

        # Cleanup should have been called
        # Note: cleanup is best-effort, directory may still exist

    @pytest.mark.asyncio
    async def test_async_context_manager(self):
        """Test DataScientist as async context manager."""
        async with DataScientist(agent_type="adk") as ds:
            assert ds.working_dir.exists()

        # Cleanup should have been called

    @pytest.mark.asyncio
    async def test_function_response_checkpoint_contains_response(self, monkeypatch, tmp_path):
        """function_response checkpoint events should persist tool response payload."""

        class DummyFunctionResponse:
            def __init__(self, name, response):
                self.name = name
                self.response = response

        class DummyPart:
            def __init__(self, function_response):
                self.text = None
                self.function_call = None
                self.function_response = function_response

        class DummyContent:
            def __init__(self, parts):
                self.parts = parts

        class DummyEvent:
            def __init__(self):
                self.author = "plan_maker_agent"
                self.partial = False
                self.content = DummyContent([
                    DummyPart(DummyFunctionResponse("ask_user", {"response": "random number generator"})),
                ])
                self.usage_metadata = None

        class DummyRunner:
            async def run_async(self, **kwargs):
                yield DummyEvent()

        ds = DataScientist(agent_type="adk", working_dir=str(tmp_path))
        ds.runner = DummyRunner()

        checkpoint_events = []

        def _capture_checkpoint_event(event_type, message, data=None):
            checkpoint_events.append({"event_type": event_type, "message": message, "data": data or {}})

        monkeypatch.setattr(ds, "_checkpoint_event", _capture_checkpoint_event)

        streamed = [event async for event in ds._stream_responses("prompt", datetime.now())]

        function_response_events = [e for e in streamed if e.get("type") == "function_response"]
        assert function_response_events
        assert function_response_events[0]["response"] == {"response": "random number generator"}

        checkpoint_function_responses = [e for e in checkpoint_events if e["event_type"] == "function_response"]
        assert checkpoint_function_responses
        assert checkpoint_function_responses[0]["data"]["name"] == "ask_user"
        assert checkpoint_function_responses[0]["data"]["response"] == {"response": "random number generator"}

