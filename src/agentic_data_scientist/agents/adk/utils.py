"""
Utility functions and configurations for ADK agents.

This module provides model configuration, helper functions, and shared settings
for the ADK agent system.
"""

from __future__ import annotations

import logging
import os
import re
from typing import TYPE_CHECKING, Any, Callable, Optional

from dotenv import load_dotenv

if TYPE_CHECKING:
    from google.adk.models.lite_llm import LiteLlm
    from google.adk.tools.tool_context import ToolContext
    from google.genai import types


load_dotenv(override=False)

logger = logging.getLogger(__name__)

_LITELLM_DEBUG_ENABLED = False


def _is_truthy(value: Optional[str]) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def _maybe_enable_litellm_debug() -> None:
    """Enable LiteLLM internal debug logging when explicitly requested."""
    global _LITELLM_DEBUG_ENABLED
    if _LITELLM_DEBUG_ENABLED:
        return

    if not (_is_truthy(os.getenv("LITELLM_DEBUG")) or _is_truthy(os.getenv("AGENTICDS_LITELLM_DEBUG"))):
        return

    try:
        import litellm

        # Compatibility across LiteLLM versions.
        if hasattr(litellm, "_turn_on_debug"):
            litellm._turn_on_debug()
            _LITELLM_DEBUG_ENABLED = True
            logger.info("[LiteLLM] Internal debug logging enabled via _turn_on_debug()")
            return

        if hasattr(litellm, "turn_on_debug"):
            litellm.turn_on_debug()
            _LITELLM_DEBUG_ENABLED = True
            logger.info("[LiteLLM] Internal debug logging enabled via turn_on_debug()")
            return

        if hasattr(litellm, "set_verbose"):
            litellm.set_verbose = True
            _LITELLM_DEBUG_ENABLED = True
            logger.info("[LiteLLM] Internal debug logging enabled via set_verbose=True")
            return

        logger.warning("[LiteLLM] No known debug toggle found in installed litellm version")
    except Exception as e:
        logger.warning("[LiteLLM] Failed to enable debug logging: %s", e)

# Model/provider routing is resolved per role and per model name at runtime.

DEFAULT_MODEL_NAME = os.getenv("DEFAULT_MODEL", "gpt-4.1-mini")
REVIEW_MODEL_NAME = os.getenv("REVIEW_MODEL", DEFAULT_MODEL_NAME)
CODING_MODEL_NAME = os.getenv("CODING_MODEL", DEFAULT_MODEL_NAME)

logger.info(f"[AgenticDS] DEFAULT_MODEL={DEFAULT_MODEL_NAME}")
logger.info(f"[AgenticDS] REVIEW_MODEL={REVIEW_MODEL_NAME}")
logger.info(f"[AgenticDS] CODING_MODEL={CODING_MODEL_NAME}")


# OpenRouter configuration
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_API_BASE = os.getenv("OPENROUTER_API_BASE", "https://openrouter.ai/api/v1")
OR_SITE_URL = os.getenv("OR_SITE_URL", "k-dense.ai")
OR_APP_NAME = os.getenv("OR_APP_NAME", "Agentic Data Scientist")

# OpenAI configuration
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_API_BASE = os.getenv("OPENAI_API_BASE")

# Anthropic configuration
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
ANTHROPIC_API_BASE = os.getenv("ANTHROPIC_API_BASE")

# Local OpenAI-compatible server behavior (vLLM, TGI, etc.)
# Most local servers reject OpenAI `tool_choice="auto"` unless explicitly enabled.
# Default to disabling automatic function-calling for local provider.
LOCAL_ENABLE_AUTO_TOOL_CHOICE = os.getenv("LOCAL_ENABLE_AUTO_TOOL_CHOICE", "false").lower() in ("true", "1", "yes")

# AWS Bedrock configuration
# Uses the single Bedrock API key (AWS_BEARER_TOKEN_BEDROCK) for authentication.
# See: https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html
AWS_BEDROCK_API_KEY = os.getenv("AWS_BEDROCK_API_KEY") or os.getenv("AWS_BEARER_TOKEN_BEDROCK")
AWS_REGION_NAME = os.getenv("AWS_REGION_NAME", "us-east-1")

# Provider is selected per call; environment only contributes credentials.

logger.info("[AgenticDS] Provider config loaded from environment variables")

# Export for use in event compression
__all__ = [
    'DEFAULT_MODEL',
    'REVIEW_MODEL',
    'DEFAULT_MODEL_NAME',
    'REVIEW_MODEL_NAME',
    'CODING_MODEL_NAME',
    'OPENROUTER_API_KEY',
    'OPENROUTER_API_BASE',
    'AWS_BEDROCK_API_KEY',
    'AWS_REGION_NAME',
    'resolve_model_name',
    'calculate_llm_cost',
    'create_litellm_model',
    'get_default_model',
    'get_review_model',
    'resolve_model_api_pair',
    'resolve_provider_from_model_name',
    'resolve_provider_for_role',
    'get_generate_content_config',
    'exit_loop_simple',
    'is_network_disabled',
]

if AWS_BEDROCK_API_KEY:
    os.environ["AWS_BEARER_TOKEN_BEDROCK"] = AWS_BEDROCK_API_KEY
    os.environ["AWS_REGION_NAME"] = AWS_REGION_NAME
if OPENROUTER_API_KEY:
    os.environ["OPENROUTER_API_KEY"] = OPENROUTER_API_KEY
if OPENAI_API_KEY:
    os.environ["OPENAI_API_KEY"] = OPENAI_API_KEY
if OPENAI_API_BASE:
    os.environ["OPENAI_API_BASE"] = OPENAI_API_BASE
if ANTHROPIC_API_KEY:
    os.environ["ANTHROPIC_API_KEY"] = ANTHROPIC_API_KEY
if ANTHROPIC_API_BASE:
    os.environ["ANTHROPIC_API_BASE"] = ANTHROPIC_API_BASE

_maybe_enable_litellm_debug()


def _normalize_model_name(provider: str, model_name: str) -> str:
    """Normalize model names for provider-specific LiteLLM routing."""
    if not model_name:
        return model_name

    model_name = str(model_name).strip()

    if provider == "openai" and model_name.startswith("openai/"):
        return model_name[len("openai/"):]
    if provider == "anthropic":
        if model_name.startswith("anthropic/"):
            model_name = model_name[len("anthropic/"):]

        # Anthropic accepts hyphenated major/minor aliases (e.g., 4-5), not dot form (4.5).
        model_name = re.sub(
            r"^(claude-(?:sonnet|opus|haiku)-)(\d+)\.(\d+)(.*)$",
            r"\1\2-\3\4",
            model_name,
        )
        return model_name
    if provider == "openrouter" and model_name.startswith("openrouter/"):
        return model_name[len("openrouter/"):]
    if provider == "local" and model_name.startswith("local/"):
        return model_name[len("local/"):]
    return model_name


def _infer_provider_from_model_name(model_name: str) -> Optional[str]:
    """Infer provider from model prefix when present (e.g., anthropic/..., openai/...)."""
    if not model_name or "/" not in model_name:
        return None
    prefix = str(model_name).split("/", 1)[0].strip().lower()
    if prefix in {"openai", "anthropic", "bedrock", "openrouter", "local"}:
        return prefix
    if prefix in {"ollama", "huggingface"}:
        return "local"
    return None


def resolve_provider_from_model_name(model_name: str, fallback: Optional[str] = None) -> str:
    """Resolve provider strictly from model name prefix, with optional fallback."""
    inferred = _infer_provider_from_model_name(model_name or "")
    if inferred:
        return inferred
    return (fallback or "openai").lower()


def resolve_model_api_pair(model_config: Optional[dict], role: str = "planning") -> tuple[str, Optional[str]]:
    """Resolve a role into its effective model name and API base URL."""
    role = (role or "planning").lower()

    if role == "coding":
        default_name = CODING_MODEL_NAME
        role_model_key = "coding_model"
    elif role == "review":
        default_name = REVIEW_MODEL_NAME
        role_model_key = "review_model"
    else:
        default_name = DEFAULT_MODEL_NAME
        role_model_key = "planning_model"

    if not model_config:
        provider = resolve_provider_from_model_name(default_name, fallback="openai")
        model_name = _normalize_model_name(provider, default_name)
        default_api_base, _ = _resolve_provider_defaults(provider)
        return model_name, default_api_base

    raw_model_name = str(model_config.get(role_model_key, "") or "").strip()
    if not raw_model_name:
        raw_model_name = default_name

    provider = resolve_provider_from_model_name(
        raw_model_name,
        fallback=(model_config.get(f"{role}_provider") or "openai"),
    )
    model_name = _normalize_model_name(provider, raw_model_name)
    api_base = model_config.get(f"{role}_api_base") or None
    return model_name, api_base


def resolve_model_name(model_config: Optional[dict], role: str = "planning") -> str:
    """Backward-compatible model resolver; now sourced from model+api_base pair logic."""
    model_name, _ = resolve_model_api_pair(model_config, role=role)
    return model_name


def resolve_provider_for_role(model_config: Optional[dict], role: str = "planning") -> str:
    """Resolve provider from the raw role config, preserving explicit role provider selection."""
    role = (role or "planning").lower()
    role_model_key = f"{role}_model"
    role_provider_key = f"{role}_provider"

    if not model_config:
        if role == "coding":
            default_name = CODING_MODEL_NAME
        elif role == "review":
            default_name = REVIEW_MODEL_NAME
        else:
            default_name = DEFAULT_MODEL_NAME
        return resolve_provider_from_model_name(default_name, fallback="openai")

    raw_model_name = str(model_config.get(role_model_key, "") or "").strip()
    return resolve_provider_from_model_name(
        raw_model_name,
        fallback=(model_config.get(role_provider_key) or "openai"),
    )


def calculate_llm_cost(
    model_name: str,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    provider_override: Optional[str] = None,
    cached_tokens: int = 0,
    call_type: str = "completion",
) -> float:
    """Estimate request cost in USD via LiteLLM pricing tables."""
    if not model_name:
        return 0.0

    provider = (provider_override or resolve_provider_from_model_name(model_name, fallback="openai")).lower()
    normalized_model = _normalize_model_name(provider, model_name)
    prompt_tokens = abs(int(prompt_tokens))
    completion_tokens = abs(int(completion_tokens))
    cached_tokens = abs(int(cached_tokens))

    # Some Anthropic usage payloads report cache reads separately from input tokens.
    # If cache reads exceed prompt tokens, LiteLLM's internal cache discount math can
    # become negative unless prompt includes cached tokens too.
    prompt_tokens_for_pricing = prompt_tokens
    if cached_tokens > prompt_tokens:
        prompt_tokens_for_pricing = prompt_tokens + cached_tokens

    try:
        import litellm

        prompt_cost, completion_cost = litellm.cost_per_token(
            model=normalized_model,
            prompt_tokens=prompt_tokens_for_pricing,
            completion_tokens=completion_tokens,
            cache_read_input_tokens=cached_tokens,
            custom_llm_provider=provider,
            call_type=call_type,
        )
        return abs(float(prompt_cost + completion_cost))
    except Exception as e:
        logger.debug(
            "[AgenticDS] Failed to calculate LLM cost for model=%s provider=%s: %s",
            normalized_model,
            provider,
            e,
        )
        return 0.0


def _resolve_provider_defaults(provider: str) -> tuple[Optional[str], Optional[str]]:
    """Resolve provider API base/key from the latest environment values."""
    provider = (provider or "").lower()
    if provider == "openrouter":
        return (
            os.getenv("OPENROUTER_API_BASE", OPENROUTER_API_BASE),
            os.getenv("OPENROUTER_API_KEY", OPENROUTER_API_KEY),
        )
    if provider == "openai":
        return (
            os.getenv("OPENAI_API_BASE", OPENAI_API_BASE),
            os.getenv("OPENAI_API_KEY", OPENAI_API_KEY),
        )
    if provider == "anthropic":
        return (
            os.getenv("ANTHROPIC_API_BASE")
            or os.getenv("ANTHROPIC_BASE_URL")
            or ANTHROPIC_API_BASE,
            os.getenv("ANTHROPIC_API_KEY", ANTHROPIC_API_KEY),
        )
    if provider == "local":
        return (
            os.getenv("LOCAL_API_BASE")
            or os.getenv("OLLAMA_API_BASE")
            or os.getenv("OLLAMA_BASE_URL")
            or os.getenv("LOCAL_LLM_API_BASE")
            or "http://localhost:11434",
            os.getenv("LOCAL_API_KEY") or os.getenv("OLLAMA_API_KEY"),
        )
    return (None, None)


def _infer_litellm_path(provider: str, model_name: str) -> str:
    """Best-effort path hint for logging outgoing LiteLLM requests."""
    provider = (provider or "").lower()
    if provider in {"openai", "openrouter", "local"}:
        return "/chat/completions"
    if provider == "anthropic":
        return "/v1/messages"
    if provider == "bedrock":
        return f"/model/{model_name}/converse (AWS Bedrock runtime)"
    return "provider-specific (resolved by LiteLLM)"


def _log_litellm_target(provider: str, model_name: str, api_base: Optional[str], role: Optional[str] = None) -> None:
    """Emit detailed target information for LiteLLM routing."""
    path_hint = _infer_litellm_path(provider, model_name)
    logger.info(
        "[LiteLLM] target provider=%s role=%s model=%s api_base=%s path_hint=%s",
        provider,
        role or "n/a",
        model_name,
        api_base or "<provider-default>",
        path_hint,
    )


def _sanitize_openrouter_model(model_name: str) -> str:
    """Ensure OpenRouter receives raw provider/model ID, not openrouter-prefixed forms."""

    if not model_name:
        return model_name
    sanitized = str(model_name).strip()
    while sanitized.startswith("openrouter/"):
        sanitized = sanitized[len("openrouter/"):]
    return sanitized


def create_litellm_model(model_name: str, num_retries: int = 2, timeout: int = 300,
                         provider_override: Optional[str] = None, api_base_override: Optional[str] = None,
                         api_key_override: Optional[str] = None) -> LiteLlm:
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
        Override inferred provider for this model
    api_base_override : str, optional
        Override the API base URL (for local providers)
    api_key_override : str, optional
        Override the API key

    Returns
    -------
    LiteLlm
        Configured model instance
    """
    from google.adk.models.lite_llm import LiteLlm

    provider = (provider_override or resolve_provider_from_model_name(model_name, fallback="openai")).lower()
    inferred_provider = _infer_provider_from_model_name(model_name)
    if inferred_provider and inferred_provider != provider:
        logger.info(
            "[AgenticDS] provider override by direct model name configured_provider=%s inferred_provider=%s model=%s",
            provider,
            inferred_provider,
            model_name,
        )
        provider = inferred_provider
    model_name = _normalize_model_name(provider, model_name)
    default_api_base, default_api_key = _resolve_provider_defaults(provider)
    effective_api_base = api_base_override or default_api_base
    effective_api_key = api_key_override or default_api_key

    if provider == "local":
        # Local provider: vLLM, Ollama, TGI, or any OpenAI-compatible server
        local_model_name = model_name[len("local/"):] if model_name.startswith("local/") else model_name
        _log_litellm_target(provider, local_model_name, effective_api_base)
        kwargs = {
            "model": local_model_name,
            "num_retries": num_retries,
            "timeout": timeout,
            "custom_llm_provider": "openai",
        }
        if effective_api_base and not effective_api_base.endswith("/v1"):
            effective_api_base += "/v1"
        if effective_api_base:
            kwargs["api_base"] = effective_api_base
        if effective_api_key:
            kwargs["api_key"] = effective_api_key
        else:
            # Local servers often don't need a key; set a dummy to avoid LiteLLM errors
            kwargs["api_key"] = "not-needed"
        print(kwargs)
        return LiteLlm(**kwargs)
    elif provider == "bedrock":
        _log_litellm_target(provider, model_name, effective_api_base)
        kwargs = {
            "model": model_name,
            "num_retries": num_retries,
            "timeout": timeout,
            "custom_llm_provider": "bedrock",
        }
        return LiteLlm(**kwargs)
    elif provider == "openrouter":
        openrouter_model = _sanitize_openrouter_model(model_name)
        if openrouter_model != model_name:
            logger.info("[LiteLLM] normalized OpenRouter model from %s to %s", model_name, openrouter_model)
        _log_litellm_target(provider, openrouter_model, effective_api_base)
        kwargs = {
            "model": openrouter_model,
            "num_retries": num_retries,
            "timeout": timeout,
            "custom_llm_provider": "openrouter",
            "api_base": effective_api_base or OPENROUTER_API_BASE,
            "api_key": effective_api_key or OPENROUTER_API_KEY,
        }
        return LiteLlm(**kwargs)
    elif provider == "openai":
        _log_litellm_target(provider, model_name, effective_api_base)
        if effective_api_base and not effective_api_base.endswith("/v1"):
            effective_api_base += "/v1"
        kwargs = {
            "model": model_name,
            "num_retries": num_retries,
            "timeout": timeout,
            "custom_llm_provider": "openai",
        }
        if effective_api_base:
            kwargs["api_base"] = effective_api_base
        if effective_api_key:
            kwargs["api_key"] = effective_api_key
        print(kwargs)
        return LiteLlm(**kwargs)
    elif provider == "anthropic":
        _log_litellm_target(provider, model_name, effective_api_base)
        kwargs = {
            "model": model_name,
            "num_retries": num_retries,
            "timeout": timeout,
            "custom_llm_provider": "anthropic",
        }
        if effective_api_base:
            kwargs["api_base"] = effective_api_base
        if effective_api_key:
            kwargs["api_key"] = effective_api_key
        print(kwargs)
        return LiteLlm(**kwargs)
    else:
        _log_litellm_target(provider, model_name, effective_api_base)
        return LiteLlm(
            model=model_name,
            num_retries=num_retries,
            timeout=timeout,
        )


def create_litellm_model_from_config(model_config: dict, role: str = "planning",
                                     num_retries: int = 2, timeout: int = 300) -> LiteLlm:
    """
    Create a LiteLlm model from a project model_config dict.

    Parameters
    ----------
    model_config : dict
        Model configuration with keys: provider, planning_model, coding_model, api_base, api_key
    role : str
        Which model to use: "planning", "review", or "coding"
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

    model_name, litellm_api_base = resolve_model_api_pair(model_config, role=role)
    provider = resolve_provider_for_role(model_config, role=role)
    _log_litellm_target(provider, model_name, litellm_api_base, role=role)

    return create_litellm_model(
        model_name, num_retries, timeout,
        provider_override=provider,
        api_base_override=litellm_api_base,
        api_key_override=model_config.get(f"{role}_api_key") or model_config.get("api_key"),
    )


_DEFAULT_MODEL_INSTANCE: Optional[LiteLlm] = None
_REVIEW_MODEL_INSTANCE: Optional[LiteLlm] = None


def get_default_model() -> LiteLlm:
    """Return cached default LiteLlm model (created lazily on first use)."""
    global _DEFAULT_MODEL_INSTANCE
    if _DEFAULT_MODEL_INSTANCE is None:
        _DEFAULT_MODEL_INSTANCE = create_litellm_model(DEFAULT_MODEL_NAME)
    return _DEFAULT_MODEL_INSTANCE


def get_review_model() -> LiteLlm:
    """Return cached review LiteLlm model (created lazily on first use)."""
    global _REVIEW_MODEL_INSTANCE
    if _REVIEW_MODEL_INSTANCE is None:
        _REVIEW_MODEL_INSTANCE = create_litellm_model(REVIEW_MODEL_NAME)
    return _REVIEW_MODEL_INSTANCE


class _LazyLiteLlm:
    """Lazy proxy for LiteLlm to avoid network-dependent startup work at import time."""

    def __init__(self, getter: Callable[[], LiteLlm]):
        self._getter = getter

    def __getattr__(self, name: str) -> Any:
        return getattr(self._getter(), name)


# Backward-compatible exports that are initialized lazily
DEFAULT_MODEL = _LazyLiteLlm(get_default_model)
REVIEW_MODEL = _LazyLiteLlm(get_review_model)

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


def get_generate_content_config(
    temperature: float = 0.0,
    output_tokens: Optional[int] = None,
    provider_override: Optional[str] = None,
):
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
    from google.genai import types

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
    provider = (provider_override or resolve_provider_from_model_name(DEFAULT_MODEL_NAME, fallback="openai")).lower()

    # Local OpenAI-compatible servers (e.g., vLLM) often reject tool_choice="auto"
    # unless started with explicit flags. Disable automatic function-calling by
    # default so requests remain compatible out of the box.
    if provider == "local" and not LOCAL_ENABLE_AUTO_TOOL_CHOICE:
        config_kwargs["automatic_function_calling"] = types.AutomaticFunctionCallingConfig(
            disable=True,
        )
        config_kwargs["tool_config"] = types.ToolConfig(
            function_calling_config=types.FunctionCallingConfig(mode=types.FunctionCallingConfigMode.NONE),
        )

    # Bedrock and Anthropic models can reject temperature+top_p together
    if provider not in ("bedrock", "anthropic"):
        config_kwargs["top_p"] = 0.95
        config_kwargs["seed"] = 42
    return types.GenerateContentConfig(**config_kwargs)
