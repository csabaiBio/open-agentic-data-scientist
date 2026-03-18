"""
Utility functions and configurations for ADK agents.

This module provides model configuration, helper functions, and shared settings
for the ADK agent system.
"""

import logging
import os
from typing import Optional

from dotenv import load_dotenv
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools.tool_context import ToolContext
from google.genai import types


load_dotenv(override=True)

logger = logging.getLogger(__name__)


# Model configuration
DEFAULT_MODEL_NAME = os.getenv("DEFAULT_MODEL", "bedrock/us.anthropic.claude-sonnet-4-5-20250929-v1:0")
REVIEW_MODEL_NAME = os.getenv("REVIEW_MODEL", "bedrock/us.anthropic.claude-sonnet-4-5-20250929-v1:0")
CODING_MODEL_NAME = os.getenv("CODING_MODEL", "claude-sonnet-4-5-20250929")

logger.info(f"[AgenticDS] DEFAULT_MODEL={DEFAULT_MODEL_NAME}")
logger.info(f"[AgenticDS] REVIEW_MODEL={REVIEW_MODEL_NAME}")
logger.info(f"[AgenticDS] CODING_MODEL={CODING_MODEL_NAME}")

# Configure LLM provider
# Supported providers: "openrouter" (default), "bedrock"
# Auto-detected from available API keys if LLM_PROVIDER is not set.
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "").lower()

# OpenRouter configuration
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_API_BASE = os.getenv("OPENROUTER_API_BASE", "https://openrouter.ai/api/v1")
OR_SITE_URL = os.getenv("OR_SITE_URL", "k-dense.ai")
OR_APP_NAME = os.getenv("OR_APP_NAME", "Agentic Data Scientist")

# AWS Bedrock configuration
# Uses the single Bedrock API key (AWS_BEARER_TOKEN_BEDROCK) for authentication.
# See: https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html
AWS_BEDROCK_API_KEY = os.getenv("AWS_BEDROCK_API_KEY") or os.getenv("AWS_BEARER_TOKEN_BEDROCK")
AWS_REGION_NAME = os.getenv("AWS_REGION_NAME", "us-east-1")

# Auto-detect provider if not explicitly set
if not LLM_PROVIDER:
    if AWS_BEDROCK_API_KEY:
        LLM_PROVIDER = "bedrock"
    elif OPENROUTER_API_KEY:
        LLM_PROVIDER = "openrouter"
    else:
        LLM_PROVIDER = "openrouter"  # fallback

logger.info(f"[AgenticDS] LLM_PROVIDER={LLM_PROVIDER}")

# Export for use in event compression
__all__ = [
    'DEFAULT_MODEL',
    'REVIEW_MODEL',
    'DEFAULT_MODEL_NAME',
    'REVIEW_MODEL_NAME',
    'LLM_PROVIDER',
    'OPENROUTER_API_KEY',
    'OPENROUTER_API_BASE',
    'create_litellm_model',
    'get_generate_content_config',
    'exit_loop_simple',
    'is_network_disabled',
]

# Set up LiteLLM environment based on provider
if LLM_PROVIDER == "bedrock":
    if AWS_BEDROCK_API_KEY:
        os.environ["AWS_BEARER_TOKEN_BEDROCK"] = AWS_BEDROCK_API_KEY
    os.environ["AWS_REGION_NAME"] = AWS_REGION_NAME
    logger.info(f"[AgenticDS] AWS Bedrock configured (region={AWS_REGION_NAME})")
elif LLM_PROVIDER == "openrouter":
    if OPENROUTER_API_KEY:
        os.environ["OPENROUTER_API_KEY"] = OPENROUTER_API_KEY
        logger.info("[AgenticDS] OpenRouter API key configured")
    else:
        logger.warning("[AgenticDS] OPENROUTER_API_KEY not set - using default credentials")
else:
    logger.warning(f"[AgenticDS] Unknown LLM_PROVIDER '{LLM_PROVIDER}' - no provider-specific setup")


def create_litellm_model(model_name: str, num_retries: int = 10, timeout: int = 300,
                         provider_override: str = None, api_base_override: str = None,
                         api_key_override: str = None) -> LiteLlm:
    """
    Create a LiteLlm model instance configured for the active LLM provider.

    Parameters
    ----------
    model_name : str
        The model identifier (e.g., "bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0")
    num_retries : int
        Number of retries on failure
    timeout : int
        Request timeout in seconds
    provider_override : str, optional
        Override the global LLM_PROVIDER for this model
    api_base_override : str, optional
        Override the API base URL (for local providers)
    api_key_override : str, optional
        Override the API key

    Returns
    -------
    LiteLlm
        Configured model instance
    """
    provider = provider_override or LLM_PROVIDER

    if provider == "local":
        # Local provider: vLLM, Ollama, TGI, or any OpenAI-compatible server
        # Model name should be like "openai/Qwen/Qwen2.5-Coder-32B-Instruct"
        # or just the HF model name — we prefix "openai/" if not already prefixed
        if not model_name.startswith(("openai/", "ollama/", "huggingface/")):
            model_name = f"openai/{model_name}"
        kwargs = {
            "model": model_name,
            "num_retries": num_retries,
            "timeout": timeout,
        }
        if api_base_override:
            kwargs["api_base"] = api_base_override
        if api_key_override:
            kwargs["api_key"] = api_key_override
        else:
            # Local servers often don't need a key; set a dummy to avoid LiteLLM errors
            kwargs["api_key"] = "not-needed"
        return LiteLlm(**kwargs)
    elif provider == "bedrock":
        return LiteLlm(
            model=model_name,
            num_retries=num_retries,
            timeout=timeout,
        )
    elif provider == "openrouter":
        return LiteLlm(
            model=model_name,
            num_retries=num_retries,
            timeout=timeout,
            api_base=OPENROUTER_API_BASE if OPENROUTER_API_KEY else None,
            custom_llm_provider="openrouter" if OPENROUTER_API_KEY else None,
        )
    else:
        return LiteLlm(
            model=model_name,
            num_retries=num_retries,
            timeout=timeout,
        )


def create_litellm_model_from_config(model_config: dict, role: str = "planning",
                                     num_retries: int = 10, timeout: int = 300) -> LiteLlm:
    """
    Create a LiteLlm model from a project model_config dict.

    Parameters
    ----------
    model_config : dict
        Model configuration with keys: provider, planning_model, coding_model, api_base, api_key
    role : str
        Which model to use: "planning" or "coding"
    num_retries : int
        Number of retries on failure
    timeout : int
        Request timeout in seconds

    Returns
    -------
    LiteLlm
        Configured model instance
    """
    if not model_config:
        return create_litellm_model(DEFAULT_MODEL_NAME, num_retries, timeout)

    provider = model_config.get("provider", LLM_PROVIDER)
    model_name = model_config.get("planning_model" if role == "planning" else "coding_model", "")
    if not model_name:
        model_name = DEFAULT_MODEL_NAME

    return create_litellm_model(
        model_name, num_retries, timeout,
        provider_override=provider,
        api_base_override=model_config.get("api_base"),
        api_key_override=model_config.get("api_key"),
    )


# Create LiteLLM model instances
DEFAULT_MODEL = create_litellm_model(DEFAULT_MODEL_NAME)
REVIEW_MODEL = create_litellm_model(REVIEW_MODEL_NAME)

# Language requirement (empty for English-only models)
LANGUAGE_REQUIREMENT = ""


def is_network_disabled() -> bool:
    """
    Check if network access is disabled via environment variable.

    Network access is enabled by default. Set DISABLE_NETWORK_ACCESS
    to "true" or "1" to disable network tools.

    Returns
    -------
    bool
        True if network access should be disabled, False otherwise
    """
    disable_network = os.getenv("DISABLE_NETWORK_ACCESS", "").lower()
    return disable_network in ("true", "1")


# DEPRECATED: Use review_confirmation agents instead
# This function is kept for backward compatibility but should not be used in new code.
# Loop exit decisions should be made by dedicated review_confirmation agents with
# structured output and callbacks, not by direct tool calls from review agents.
def exit_loop_simple(tool_context: ToolContext):
    """
    Exit the iterative loop when no further changes are needed.

    DEPRECATED: Use review_confirmation agents instead.

    This function is called by review agents to signal that the iterative
    process should end.

    Parameters
    ----------
    tool_context : ToolContext
        The tool execution context

    Returns
    -------
    dict
        Empty dictionary (tools should return JSON-serializable output)
    """
    tool_context.actions.escalate = True
    return {}


def get_generate_content_config(temperature: float = 0.0, output_tokens: Optional[int] = None):
    """
    Create a GenerateContentConfig with retry settings.

    Parameters
    ----------
    temperature : float, optional
        Sampling temperature (default: 0.0)
    output_tokens : int, optional
        Maximum output tokens

    Returns
    -------
    types.GenerateContentConfig
        Configuration for content generation
    """
    config_kwargs = {
        "temperature": temperature,
        "max_output_tokens": output_tokens,
        "http_options": types.HttpOptions(
            retry_options=types.HttpRetryOptions(
                attempts=50,
                initial_delay=1.0,
                max_delay=30,
                exp_base=1.5,
                jitter=0.5,
                http_status_codes=[429, 500, 502, 503, 504],
            )
        ),
    }
    # Bedrock doesn't allow temperature and top_p together
    if LLM_PROVIDER != "bedrock":
        config_kwargs["top_p"] = 0.95
        config_kwargs["seed"] = 42
    return types.GenerateContentConfig(**config_kwargs)
