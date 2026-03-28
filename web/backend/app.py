"""FastAPI application for Agentic Data Scientist web interface."""

import asyncio
import importlib
import json
import logging
import mimetypes
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

load_dotenv(override=True)

# Suppress verbose logging from third-party libs
for lib_name in ["LiteLLM", "litellm", "httpx", "httpcore", "openai", "anthropic", "google_adk"]:
    logging.getLogger(lib_name).setLevel(logging.WARNING)
os.environ["LITELLM_LOG"] = "ERROR"

from .models import CostLimitUpdateRequest, ModelConfig, PaperRequest, PaperResponse, ProjectCreate, ProjectMode, ProjectStatus
from .project_manager import ProjectManager

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


def _infer_provider_from_model_name(model_name: str) -> str:
    model = (model_name or "").strip().lower()
    if not model:
        return ""
    if model.startswith("openai/"):
        return "openai"
    if model.startswith("anthropic/"):
        return "anthropic"
    if model.startswith("ollama/") or model.startswith("local/"):
        return "local"
    return ""


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
    num_papers: int = Form(10),
    days_back: int = Form(30),
    max_cost_usd: float = Form(0.0),
    planning_model: str = Form(""),
    review_model: str = Form(""),
    coding_model: str = Form(""),
    model_openai_api_base: str = Form(""),
    model_anthropic_api_base: str = Form(""),
    model_local_api_base: str = Form(""),
    model_planning_api_base_source: str = Form(""),
    model_review_api_base_source: str = Form(""),
    model_coding_api_base_source: str = Form(""),
    model_litellm_api_base: str = Form(""),
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

    # Build model config if any model settings were specified
    mc = None
    has_model_overrides = any([
        planning_model,
        review_model,
        coding_model,
        model_openai_api_base,
        model_anthropic_api_base,
        model_local_api_base,
        model_planning_api_base_source,
        model_review_api_base_source,
        model_coding_api_base_source,
        model_litellm_api_base,
    ])
    if has_model_overrides:
        inferred_provider = (
            _infer_provider_from_model_name(planning_model)
            or _infer_provider_from_model_name(review_model)
            or _infer_provider_from_model_name(coding_model)
            or "openai"
        )
        planning_provider = _infer_provider_from_model_name(planning_model) or inferred_provider
        review_provider = _infer_provider_from_model_name(review_model) or planning_provider
        coding_provider = _infer_provider_from_model_name(coding_model) or review_provider
        litellm_api_base = model_litellm_api_base
        mc = ModelConfig(
            provider=inferred_provider,
            planning_provider=planning_provider,
            review_provider=review_provider,
            coding_provider=coding_provider,
            planning_model=planning_model or "",
            review_model=review_model or "",
            coding_model=coding_model or "",
            openai_api_base=model_openai_api_base or None,
            anthropic_api_base=model_anthropic_api_base or None,
            local_api_base=model_local_api_base or None,
            planning_api_base_source=model_planning_api_base_source or None,
            review_api_base_source=model_review_api_base_source or None,
            coding_api_base_source=model_coding_api_base_source or None,
            litellm_api_base=litellm_api_base or None,
        )
    print("MODEL CONFIG FROM API:", mc)
    req = ProjectCreate(
        query=query, mode=project_mode,
        num_papers=max(1, min(20, num_papers)),
        days_back=max(1, min(180, days_back)),
        max_cost_usd=max_cost_usd if max_cost_usd > 0 else None,
        llm_config=mc,
        base_project_id=base_project_id or None,
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
