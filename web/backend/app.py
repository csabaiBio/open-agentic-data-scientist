"""FastAPI application for Agentic Data Scientist web interface."""

import asyncio
from datetime import datetime
import importlib
import json
import logging
import mimetypes
import os
from pathlib import Path
from logging.handlers import RotatingFileHandler

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

load_dotenv(override=True)


def _configure_backend_file_logging() -> None:
    """Configure optional file logging for the web backend.

    Enabled when BACKEND_LOG_FILE is set.
    """
    raw_log_file = (os.getenv("BACKEND_LOG_FILE") or "").strip()
    if not raw_log_file:
        return

    log_level_name = (os.getenv("BACKEND_LOG_LEVEL") or "INFO").strip().upper()
    log_level = getattr(logging, log_level_name, logging.INFO)

    log_path = Path(raw_log_file).expanduser()
    log_path.parent.mkdir(parents=True, exist_ok=True)
    resolved_log_path = str(log_path.resolve())

    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    file_handler = RotatingFileHandler(
        filename=resolved_log_path,
        maxBytes=int(os.getenv("BACKEND_LOG_MAX_BYTES", "5242880")),  # 5 MB
        backupCount=int(os.getenv("BACKEND_LOG_BACKUP_COUNT", "3")),
        encoding="utf-8",
    )
    file_handler.setLevel(log_level)
    file_handler.setFormatter(formatter)

    targets = [
        logging.getLogger(),
        logging.getLogger("uvicorn"),
        logging.getLogger("uvicorn.error"),
        logging.getLogger("uvicorn.access"),
        logging.getLogger("fastapi"),
        logging.getLogger("web.backend"),
    ]

    for target_logger in targets:
        already_attached = any(
            isinstance(handler, logging.FileHandler)
            and getattr(handler, "baseFilename", "") == resolved_log_path
            for handler in target_logger.handlers
        )
        if not already_attached:
            target_logger.addHandler(file_handler)

    root_logger = logging.getLogger()
    if root_logger.level == logging.NOTSET or root_logger.level > log_level:
        root_logger.setLevel(log_level)

    logging.getLogger(__name__).info(
        "Backend file logging enabled at %s (level=%s)",
        resolved_log_path,
        logging.getLevelName(log_level),
    )


_configure_backend_file_logging()

# Suppress verbose logging from third-party libs
for lib_name in ["LiteLLM", "litellm", "httpx", "httpcore", "openai", "anthropic", "google_adk"]:
    logging.getLogger(lib_name).setLevel(logging.WARNING)
os.environ["LITELLM_LOG"] = "ERROR"

from .llm_model_store import LlmModelStore
from .models import (
    CostLimitUpdateRequest,
    LlmModelCreate,

    ModelConfig,
    PaperRequest,
    PaperResponse,
    ProjectCreate,
    ProjectMode,
    ProjectStatus,
    AnswerQuestionRequest,
)
from .project_manager import PROJECTS_DIR, ProjectManager

logger = logging.getLogger(__name__)

app = FastAPI(title="Agentic Data Scientist", version="0.2.0")
app.state.backend_warmup_task = None
app.state.backend_warmup_completed = False
app.state.backend_warmup_error = None
_backend_warmup_lock = asyncio.Lock()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

manager = ProjectManager()
llm_model_store = LlmModelStore(PROJECTS_DIR / "llm_models.sqlite3")
DEFAULT_FALLBACK_CODING_MODEL = "claude-sonnet-4-5"
DEFAULT_FALLBACK_CODING_PROVIDER = "anthropic"


def _apply_selected_llm_model(
    selected_model,
    role: str,
    *,
    planning_model: str,
    review_model: str,
    coding_model: str,
    planning_provider: str,
    review_provider: str,
    coding_provider: str,
    planning_api_base: str,
    review_api_base: str,
    coding_api_base: str,
):
    if not selected_model:
        return (
            planning_model, review_model, coding_model,
            planning_provider, review_provider, coding_provider,
            planning_api_base, review_api_base, coding_api_base,
        )

    model_name = selected_model.model_name.strip()
    provider = selected_model.type.value
    api_base = selected_model.provider_url.strip()

    if role == "planning":
        planning_model, planning_provider, planning_api_base = model_name, provider, api_base
    elif role == "review":
        review_model, review_provider, review_api_base = model_name, provider, api_base
    elif role == "coding":
        coding_model, coding_provider, coding_api_base = model_name, provider, api_base

    return (
        planning_model, review_model, coding_model,
        planning_provider, review_provider, coding_provider,
        planning_api_base, review_api_base, coding_api_base,
    )


def _warm_backend_imports() -> None:
    """Import slow modules in a background thread after the UI is ready."""
    modules = [
        "agentic_data_scientist.core.api",
        "agentic_data_scientist.agents.adk.agent",
        "agentic_data_scientist.agents.claude_code.agent",
        "google.adk.runners",
        "google.adk.sessions",
        "google.adk.models.lite_llm",
        "google.genai.types",
    ]
    for module_name in modules:
        importlib.import_module(module_name)


async def _run_backend_warmup() -> None:
    """Warm heavy imports without blocking request handling."""
    if app.state.backend_warmup_completed:
        return

    try:
        logger.info("Starting deferred backend warmup")
        await asyncio.to_thread(_warm_backend_imports)
        app.state.backend_warmup_completed = True
        app.state.backend_warmup_error = None
        logger.info("Deferred backend warmup completed")
    except Exception as e:
        app.state.backend_warmup_error = str(e)
        logger.exception("Deferred backend warmup failed")
    finally:
        app.state.backend_warmup_task = None


# ── Projects CRUD ──────────────────────────────────────────────────

@app.post("/api/warmup")
async def warmup_backend():
    """Schedule heavy backend imports after the UI has become interactive."""
    if app.state.backend_warmup_completed:
        return {"status": "ready"}

    existing_task = app.state.backend_warmup_task
    if existing_task and not existing_task.done():
        return {"status": "warming"}

    async with _backend_warmup_lock:
        existing_task = app.state.backend_warmup_task
        if existing_task and not existing_task.done():
            return {"status": "warming"}

        app.state.backend_warmup_task = asyncio.create_task(_run_backend_warmup())

    return {"status": "scheduled"}

@app.get("/api/projects")
async def list_projects():
    return manager.list_projects()


@app.get("/api/llm-models")
async def list_llm_models():
    return llm_model_store.list_models()


@app.post("/api/llm-models")
async def create_llm_model(req: LlmModelCreate):
    model_name = req.model_name.strip()
    provider_url = req.provider_url.strip()
    api_key = req.api_key.strip() if req.api_key else None
    if not model_name:
        raise HTTPException(400, "model_name is required")
    if not provider_url:
        raise HTTPException(400, "provider_url is required")
    try:
        return llm_model_store.create_model(
            LlmModelCreate(type=req.type, model_name=model_name, provider_url=provider_url, api_key=api_key),
        )
    except Exception as e:
        raise HTTPException(400, f"Failed to create LLM model: {e}")


@app.delete("/api/llm-models/{model_id}")
async def delete_llm_model(model_id: int):
    ok = llm_model_store.delete_model(model_id)
    if not ok:
        raise HTTPException(404, "LLM model not found")
    return {"status": "deleted"}


@app.get("/api/projects/{project_id}")
async def get_project(project_id: str):
    project = manager.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return project


@app.post("/api/projects")
async def create_project(
    query: str = Form(...),
    mode: str = Form("orchestrated"),
    human_in_the_loop: str = Form("false"),
    num_papers: int = Form(10),
    days_back: int = Form(30),
    max_cost_usd: float = Form(0.0),
    planning_llm_model_id: str = Form(""),
    review_llm_model_id: str = Form(""),
    coding_llm_model_id: str = Form(""),
    base_project_id: str = Form(""),
    files: list[UploadFile] = File(default=[]),
):
    """Create a new project with optional file uploads."""
    mode_map = {
        "orchestrated": ProjectMode.ORCHESTRATED,
        "simple": ProjectMode.SIMPLE,
        "discovery": ProjectMode.DISCOVERY,
    }
    project_mode = mode_map.get(mode, ProjectMode.ORCHESTRATED)

    selected_planning_model = llm_model_store.get_stored_model(int(planning_llm_model_id)) if planning_llm_model_id else None
    selected_review_model = llm_model_store.get_stored_model(int(review_llm_model_id)) if review_llm_model_id else None
    selected_coding_model = llm_model_store.get_stored_model(int(coding_llm_model_id)) if coding_llm_model_id else None

    if planning_llm_model_id and not selected_planning_model:
        raise HTTPException(404, "Selected planning model not found")
    if review_llm_model_id and not selected_review_model:
        raise HTTPException(404, "Selected review model not found")
    if coding_llm_model_id and not selected_coding_model:
        raise HTTPException(404, "Selected coding model not found")

    planning_model = review_model = coding_model = ""
    planning_provider = review_provider = coding_provider = ""
    planning_api_base = review_api_base = coding_api_base = ""

    for selected, role in [
        (selected_planning_model, "planning"),
        (selected_review_model, "review"),
        (selected_coding_model, "coding"),
    ]:
        (
            planning_model, review_model, coding_model,
            planning_provider, review_provider, coding_provider,
            planning_api_base, review_api_base, coding_api_base,
        ) = _apply_selected_llm_model(
            selected, role,
            planning_model=planning_model, review_model=review_model, coding_model=coding_model,
            planning_provider=planning_provider, review_provider=review_provider, coding_provider=coding_provider,
            planning_api_base=planning_api_base, review_api_base=review_api_base, coding_api_base=coding_api_base,
        )

    # If no coding model is selected/saved, use a safe default coding model.
    if not coding_model:
        coding_model = DEFAULT_FALLBACK_CODING_MODEL
        coding_provider = DEFAULT_FALLBACK_CODING_PROVIDER

    # Build model config if any model was selected from the dashboard
    mc = None
    if any([planning_model, review_model, coding_model]):
        mc = ModelConfig(
            planning_model=planning_model,
            review_model=review_model,
            coding_model=coding_model,
            planning_provider=planning_provider or None,
            review_provider=review_provider or None,
            coding_provider=coding_provider or None,
            planning_api_base=planning_api_base or None,
            review_api_base=review_api_base or None,
            coding_api_base=coding_api_base or None,
        )
    req = ProjectCreate(
        query=query, mode=project_mode,
        human_in_the_loop=(str(human_in_the_loop).strip().lower() in ("1", "true", "yes", "on")),
        num_papers=max(1, min(20, num_papers)),
        days_back=max(1, min(180, days_back)),
        max_cost_usd=max_cost_usd if max_cost_usd > 0 else None,
        llm_config=mc,
        base_project_id=base_project_id or None,
        planning_llm_model_id=int(planning_llm_model_id) if planning_llm_model_id else None,
        review_llm_model_id=int(review_llm_model_id) if review_llm_model_id else None,
        coding_llm_model_id=int(coding_llm_model_id) if coding_llm_model_id else None,
    )
    project = manager.create_project(req)

    # Save uploaded files
    uploaded = []
    if files:
        upload_dir = Path(project.working_dir) / "user_data"
        upload_dir.mkdir(parents=True, exist_ok=True)
        for f in files:
            if f.filename:
                dest = upload_dir / f.filename
                content = await f.read()
                dest.write_bytes(content)
                uploaded.append((f.filename, dest))
                project.input_files.append(f.filename)

    # Start the project in the background
    await manager.start_project(project.id, uploaded)

    return project


@app.post("/api/projects/{project_id}/stop")
async def stop_project(project_id: str):
    ok = manager.stop_project(project_id)
    if not ok:
        raise HTTPException(400, "Project is not running")
    return {"status": "stopped"}


@app.post("/api/projects/{project_id}/resume")
async def resume_project(project_id: str):
    project = manager.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    ok = await manager.resume_project(project_id)
    if not ok:
        raise HTTPException(400, f"Project cannot be resumed (status={project.status.value})")
    return {"status": "running"}


@app.post("/api/projects/{project_id}/answer")
async def answer_question(project_id: str, req: AnswerQuestionRequest):
    """Submit a human answer to a pending agent question."""
    if not manager.get_project(project_id):
        raise HTTPException(404, "Project not found")
    ok = manager.answer_question(project_id, req.question_id, req.answer)
    if not ok:
        raise HTTPException(404, "Question not found or already answered")
    return {"status": "answered"}


@app.get("/api/projects/{project_id}/pending-questions")
async def get_pending_questions(project_id: str):
    """Return list of question IDs awaiting a human answer."""
    if not manager.get_project(project_id):
        raise HTTPException(404, "Project not found")
    return {"questions": manager.get_pending_questions(project_id)}


@app.patch("/api/projects/{project_id}/cost-limit")
async def update_cost_limit(project_id: str, req: CostLimitUpdateRequest):
    project = manager.update_cost_limit(project_id, req.max_cost_usd)
    if not project:
        raise HTTPException(404, "Project not found")
    return {
        "status": project.status.value,
        "max_cost_usd": project.max_cost_usd,
        "total_cost_usd": project.total_cost_usd,
    }


@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str):
    ok = manager.delete_project(project_id)
    if not ok:
        raise HTTPException(404, "Project not found")
    return {"status": "deleted"}


# ── SSE Event Stream ──────────────────────────────────────────────

@app.get("/api/projects/{project_id}/stream")
async def stream_events(project_id: str, after: int = 0):
    """Server-Sent Events stream for real-time project updates."""
    project = manager.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    async def event_generator():
        # First, send any existing events the client hasn't seen
        for event in project.events[after:]:
            data = json.dumps(event.model_dump(), default=str)
            yield f"data: {data}\n\n"

        # If project is already done or awaiting confirmation, send status and stop
        if project.status.value in ("completed", "failed", "stopped", "awaiting_confirmation"):
            yield f"data: {json.dumps({'type': 'done', 'status': project.status.value})}\n\n"
            return

        # Subscribe to live events
        queue = manager.subscribe(project_id)
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30)
                    if event is None:  # Sentinel = project finished
                        p = manager.get_project(project_id)
                        status = p.status.value if p else "unknown"
                        yield f"data: {json.dumps({'type': 'done', 'status': status})}\n\n"
                        return
                    data = json.dumps(event.model_dump(), default=str)
                    yield f"data: {data}\n\n"
                except asyncio.TimeoutError:
                    # Send keepalive
                    yield ": keepalive\n\n"
        finally:
            manager.unsubscribe(project_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── File Serving ──────────────────────────────────────────────────

@app.get("/api/projects/{project_id}/files/{file_path:path}")
async def get_file(project_id: str, file_path: str):
    """Serve a generated file from the project directory."""
    abs_path = manager.get_file_path(project_id, file_path)
    if not abs_path:
        raise HTTPException(404, "File not found")

    media_type, _ = mimetypes.guess_type(str(abs_path))
    return FileResponse(abs_path, media_type=media_type or "application/octet-stream")


# ── Paper Generation ──────────────────────────────────────────────

@app.post("/api/projects/{project_id}/paper")
async def generate_paper(project_id: str, req: PaperRequest | None = None):
    """Generate a comprehensive paper from project outputs."""
    project = manager.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    if project.status != ProjectStatus.COMPLETED:
        raise HTTPException(400, "Project must be completed to generate a paper")

    try:
        title = req.title if req else None
        content = await manager.generate_paper(project_id, title=title)
        pdf_url = f"/api/projects/{project_id}/paper.pdf"
        return {
            "content": content,
            "format": "markdown",
            "title": title or f"Analysis Report: {project.query}",
            "pdf_url": pdf_url,
        }
    except Exception as e:
        logger.exception("Paper generation failed")
        raise HTTPException(500, f"Paper generation failed: {e}")


@app.get("/api/projects/{project_id}/paper.pdf")
async def get_paper_pdf(project_id: str):
    """Serve the generated PDF paper."""
    project = manager.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    pdf_path = Path(project.working_dir) / "paper.pdf"
    if not pdf_path.exists():
        raise HTTPException(404, "PDF not yet generated. Generate the paper first.")

    return FileResponse(
        str(pdf_path),
        media_type="application/pdf",
    )


# ── Confirm Discovery ────────────────────────────────────────────

@app.post("/api/projects/{project_id}/confirm-discovery")
async def confirm_discovery(project_id: str, body: dict):
    """User confirms or edits the research question after discovery, then analysis starts."""
    analysis_query = body.get("analysis_query", "").strip()
    if not analysis_query:
        raise HTTPException(400, "analysis_query is required")

    project = manager.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    if project.status != ProjectStatus.AWAITING_CONFIRMATION:
        raise HTTPException(400, f"Project is not awaiting confirmation (status={project.status.value})")

    try:
        await manager.confirm_discovery(project_id, analysis_query)
        return {"status": "running", "analysis_query": analysis_query}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("confirm_discovery failed")
        raise HTTPException(500, str(e))


# ── Data Suggestions ─────────────────────────────────────────────

@app.post("/api/projects/{project_id}/data-suggestions/{suggestion_type}")
async def generate_data_suggestions(project_id: str, suggestion_type: str):
    """Generate in-silico or experimental data suggestions."""
    if suggestion_type not in ("in_silico", "experimental"):
        raise HTTPException(400, "suggestion_type must be 'in_silico' or 'experimental'")

    project = manager.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    if project.status != ProjectStatus.COMPLETED:
        raise HTTPException(400, "Project must be completed to generate suggestions")

    try:
        content = await manager.generate_data_suggestions(project_id, suggestion_type)
        return {"content": content, "type": suggestion_type}
    except Exception as e:
        logger.exception("Data suggestion generation failed")
        raise HTTPException(500, f"Generation failed: {e}")


# ── Serve Frontend ────────────────────────────────────────────────

frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")


def main():
    """Entry point for running the web server."""
    import uvicorn
    port = int(os.getenv("PORT", "8765"))
    uvicorn.run(
        "web.backend.app:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        reload_dirs=["web/backend", "src"],
    )


if __name__ == "__main__":
    main()
