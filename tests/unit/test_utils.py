"""Unit tests for ADK utility helpers."""

import sys
from types import SimpleNamespace

from agentic_data_scientist.agents.adk import utils


class TestCalculateLlmCost:
    """Tests for calculate_llm_cost edge cases."""

    def test_anthropic_cache_tokens_do_not_create_negative_pricing_inputs(self, monkeypatch):
        """Prompt tokens should include cached reads when cache reads exceed prompt."""
        captured = {}

        def fake_cost_per_token(**kwargs):
            captured.update(kwargs)
            return (1.0, 2.0)

        monkeypatch.setitem(sys.modules, "litellm", SimpleNamespace(cost_per_token=fake_cost_per_token))

        cost = utils.calculate_llm_cost(
            model_name="claude-sonnet-4-5",
            prompt_tokens=20,
            completion_tokens=30,
            cached_tokens=100,
            provider_override="anthropic",
            call_type="generate_content",
        )

        assert captured["prompt_tokens"] == 120
        assert captured["cache_read_input_tokens"] == 100
        assert cost == 3.0

    def test_negative_litellm_cost_is_clamped_to_zero(self, monkeypatch):
        """Defensive clamp should prevent negative cost values from propagating."""

        def fake_cost_per_token(**kwargs):
            return (-1.5, -0.2)

        monkeypatch.setitem(sys.modules, "litellm", SimpleNamespace(cost_per_token=fake_cost_per_token))

        cost = utils.calculate_llm_cost(
            model_name="claude-sonnet-4-5",
            prompt_tokens=10,
            completion_tokens=5,
            provider_override="anthropic",
        )

        assert cost == 0.0
