"""Human-in-the-loop ask_user tool for interactive agent sessions.

When HUMAN_IN_THE_LOOP=true, agents can call ask_user() to pause execution
and wait for a human answer via the web interface.
"""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from typing import Awaitable, Callable, List, Optional

logger = logging.getLogger(__name__)


def is_human_in_the_loop_enabled() -> bool:
    """Return True unless HUMAN_IN_THE_LOOP is explicitly set to a falsy value."""
    raw = os.getenv("HUMAN_IN_THE_LOOP")
    if raw is None or raw.strip() == "":
        return True
    return raw.strip().lower() in ("1", "true", "yes", "on")


def make_ask_user_tool(ask_fn: Callable[[str, str], Awaitable[str]]) -> Callable:
    """Create a bound ask_user tool function for the given callback.

    Args:
        ask_fn: Async function(question_id, question_text) -> answer_text.
                Called when the agent invokes ask_user. Blocks until the
                human submits an answer via the web interface.

    Returns:
        Async tool function suitable for passing to an ADK agent's tools list.
    """

    async def ask_user(question: str) -> str:
        """Ask the human user a clarifying question and wait for their answer.

        Use this tool when the current task is ambiguous, you need more information,
        or you want to confirm an assumption before proceeding.

        Args:
            question: The question to ask the user.

        Returns:
            The user's text answer.
        """
        question_id = uuid.uuid4().hex[:12]
        logger.info("[ask_user] Asking question %s: %r", question_id, question[:80])
        try:
            answer = await ask_fn(question_id, question)
            logger.info("[ask_user] Received answer for %s", question_id)
            return answer
        except asyncio.CancelledError:
            return "[Question cancelled — proceeding with best judgment]"
        except Exception as exc:  # noqa: BLE001
            logger.warning("[ask_user] ask_fn raised %s: %s", type(exc).__name__, exc)
            return f"[No answer received: {exc}]"

    return ask_user


def make_ask_user_questions_tool(ask_fn: Callable[[str, str], Awaitable[str]]) -> Callable:
    """Create an AskUserQuestion tool that handles structured multi-question prompts.

    The LLM may call this tool by name ``AskUserQuestion`` with a ``questions``
    list where each entry has a ``question`` string, optional ``header``,
    optional ``options`` list and optional ``multiSelect`` flag.

    Each question is presented to the user one at a time via ask_fn and the
    combined answers are returned as a structured summary.

    Args:
        ask_fn: Async function(question_id, question_text) -> answer_text.

    Returns:
        Async tool function named ``AskUserQuestion``.
    """
    async def AskUserQuestion(questions: List[dict]) -> str:  # noqa: N802
        """Ask the user one or more clarifying questions and wait for their answers.

        Use this tool when you need structured input: each question can carry
        optional pre-defined options for the user to choose from.

        Args:
            questions: List of question objects. Each object should have:
                - question (str): The question text.
                - header (str, optional): Short label for the question.
                - options (list, optional): Pre-defined answer choices, each
                  with a ``label`` and optional ``description``.
                - multiSelect (bool, optional): Whether multiple options can
                  be selected.

        Returns:
            A text summary of all answers, one per question.
        """
        if not questions:
            return "[No questions provided]"

        answers = []
        for item in questions:
            q_text = item.get("question", "").strip()
            header = item.get("header", "")
            options = item.get("options") or []

            # Build a readable prompt that includes the options when present
            prompt_parts = []
            if header:
                prompt_parts.append(f"[{header}] {q_text}")
            else:
                prompt_parts.append(q_text)

            if options:
                prompt_parts.append("Options:")
                for i, opt in enumerate(options, 1):
                    label = opt.get("label", f"Option {i}")
                    desc = opt.get("description", "")
                    if desc:
                        prompt_parts.append(f"  {i}. {label} — {desc}")
                    else:
                        prompt_parts.append(f"  {i}. {label}")
                if item.get("multiSelect"):
                    prompt_parts.append("(You may select multiple options or type a free-form answer.)")
                else:
                    prompt_parts.append("(Choose one option or type a free-form answer.)")

            full_prompt = "\n".join(prompt_parts)
            question_id = uuid.uuid4().hex[:12]
            logger.info("[AskUserQuestion] Asking question %s: %r", question_id, q_text[:80])

            try:
                answer = await ask_fn(question_id, full_prompt)
                label = header or q_text[:40]
                answers.append(f"{label}: {answer}")
                logger.info("[AskUserQuestion] Received answer for %s", question_id)
            except asyncio.CancelledError:
                answers.append(f"{header or q_text[:40]}: [cancelled]")
                break
            except Exception as exc:  # noqa: BLE001
                logger.warning("[AskUserQuestion] ask_fn raised %s: %s", type(exc).__name__, exc)
                answers.append(f"{header or q_text[:40]}: [no answer received: {exc}]")

        return "\n".join(answers)

    return AskUserQuestion
