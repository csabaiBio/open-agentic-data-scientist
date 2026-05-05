"""Unit tests for agent implementations."""

import tempfile
from pathlib import Path

from agentic_data_scientist.agents.claude_code.agent import ClaudeCodeAgent, setup_working_directory


class TestClaudeCodeAgent:
    """Test ClaudeCodeAgent."""

    def test_initialization_default(self):
        """Test ClaudeCodeAgent default initialization."""
        agent = ClaudeCodeAgent()
        assert agent.name == "claude_coding_agent"
        assert agent.model == "claude-sonnet-4-5-20250929"
        assert agent._output_key == "implementation_summary"

    def test_initialization_custom(self):
        """Test ClaudeCodeAgent custom initialization."""
        with tempfile.TemporaryDirectory() as tmpdir:
            agent = ClaudeCodeAgent(
                name="custom_agent",
                description="Custom description",
                working_dir=tmpdir,
                output_key="custom_output",
            )
            assert agent.name == "custom_agent"
            assert agent.description == "Custom description"
            assert agent._working_dir == tmpdir
            assert agent._output_key == "custom_output"
            assert agent.model == "claude-sonnet-4-5-20250929"

    def test_initialization_keeps_qwen_namespace_for_local_models(self):
        """Namespaced local model IDs like Qwen/... must remain intact."""
        agent = ClaudeCodeAgent(
            model_config={
                "coding_provider": "local",
                "coding_model": "Qwen/Qwen3.6-35B-A3B-FP8",
            }
        )
        assert agent.model == "Qwen/Qwen3.6-35B-A3B-FP8"

    def test_initialization_preserves_private_local_routing_state(self):
        """Private attrs must survive Agent base initialization for runtime routing."""
        model_config = {
            "coding_provider": "local",
            "coding_model": "Qwen/Qwen3.6-35B-A3B-FP8",
            "coding_api_base": "http://localhost:8000",
        }
        agent = ClaudeCodeAgent(model_config=model_config, working_dir="/tmp/test-session")
        assert agent._provider == "local"
        assert agent._model_config == model_config
        assert agent._working_dir == "/tmp/test-session"

    def test_truncate_summary_short(self):
        """Test summary truncation with short text."""
        agent = ClaudeCodeAgent()
        short_text = "Short summary"
        truncated = agent._truncate_summary(short_text)
        assert truncated == short_text

    def test_truncate_summary_long(self):
        """Test summary truncation with long text."""
        agent = ClaudeCodeAgent()
        long_text = "x" * 50000  # 50k characters
        truncated = agent._truncate_summary(long_text)
        assert len(truncated) <= 41000  # Should be around 40k + truncation message
        assert "middle section truncated" in truncated


class TestSetupWorkingDirectory:
    """Test setup_working_directory function."""

    def test_create_directory_structure(self):
        """Test that working directory is created with proper structure."""
        with tempfile.TemporaryDirectory() as tmpdir:
            working_dir = Path(tmpdir) / "test_session"
            setup_working_directory(str(working_dir))

            assert working_dir.exists()
            assert (working_dir / "user_data").exists()
            assert (working_dir / "workflow").exists()
            assert (working_dir / "results").exists()
            assert (working_dir / "pyproject.toml").exists()
            assert (working_dir / "README.md").exists()

    def test_pyproject_content(self):
        """Test that pyproject.toml is created with proper content."""
        with tempfile.TemporaryDirectory() as tmpdir:
            working_dir = Path(tmpdir) / "test_session"
            setup_working_directory(str(working_dir))

            pyproject_content = (working_dir / "pyproject.toml").read_text()
            assert "[project]" in pyproject_content
            assert "python" in pyproject_content.lower()

    def test_readme_content(self):
        """Test that README.md is created with proper content."""
        with tempfile.TemporaryDirectory() as tmpdir:
            working_dir = Path(tmpdir) / "test_session"
            setup_working_directory(str(working_dir))

            readme_content = (working_dir / "README.md").read_text()
            assert "Agentic Data Scientist Session" in readme_content
            assert "user_data/" in readme_content
            assert "workflow/" in readme_content
            assert "results/" in readme_content

    def test_idempotent(self):
        """Test that setup is idempotent (can be called multiple times)."""
        with tempfile.TemporaryDirectory() as tmpdir:
            working_dir = Path(tmpdir) / "test_session"

            # Call setup twice
            setup_working_directory(str(working_dir))
            setup_working_directory(str(working_dir))

            # Should still have correct structure
            assert (working_dir / "user_data").exists()
            assert (working_dir / "pyproject.toml").exists()
