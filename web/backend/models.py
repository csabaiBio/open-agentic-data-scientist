"""Pydantic models for the web API."""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ProjectStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    STOPPED = "stopped"
    AWAITING_CONFIRMATION = "awaiting_confirmation"


class ProjectMode(str, Enum):
    ORCHESTRATED = "orchestrated"
    SIMPLE = "simple"
    DISCOVERY = "discovery"


class StageStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class Stage(BaseModel):
    index: int = 0
    title: str = ""
    description: str = ""
    status: StageStatus = StageStatus.PENDING
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    duration_seconds: Optional[float] = None


class ProjectEvent(BaseModel):
    id: int = 0
    type: str = "message"
    content: str = ""
    author: str = ""
    timestamp: str = ""
    is_thought: bool = False
    stage_index: Optional[int] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class GeneratedFile(BaseModel):
    path: str
    name: str
    size: int = 0
    type: str = "unknown"  # "figure", "report", "data", "code", "other"
    stage_index: Optional[int] = None
    created_at: str = ""


class DiscoveryResult(BaseModel):
    papers: List[Dict[str, Any]] = Field(default_factory=list)
    synthesis: str = ""
    hypothesis: str = ""
    datasets: str = ""
    research_question: str = ""
    analysis_prompt: str = ""


class ModelConfig(BaseModel):
    """Model configuration for a project run."""
    provider: str = "openai"  # bedrock, openrouter, openai, anthropic, local
    planning_model: str = ""  # model ID for planning/review/summary agents (LiteLLM)
    coding_model: str = ""  # model ID for coding agent (Claude Code SDK)
    api_base: Optional[str] = None  # base URL for local provider (vLLM, Ollama, TGI)
    api_key: Optional[str] = None  # optional API key


class ProjectCreate(BaseModel):
    query: str
    mode: ProjectMode = ProjectMode.ORCHESTRATED
    files: List[str] = Field(default_factory=list)
    num_papers: int = 10
    days_back: int = 30
    llm_config: Optional[ModelConfig] = None
    base_project_id: Optional[str] = None  # inherit outputs from this project


class Project(BaseModel):
    id: str
    query: str
    mode: ProjectMode
    status: ProjectStatus = ProjectStatus.PENDING
    created_at: str = ""
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    duration: Optional[float] = None
    working_dir: str = ""
    base_project_id: Optional[str] = None  # project this was based on
    stages: List[Stage] = Field(default_factory=list)
    events: List[ProjectEvent] = Field(default_factory=list)
    files: List[GeneratedFile] = Field(default_factory=list)
    error: Optional[str] = None
    input_files: List[str] = Field(default_factory=list)
    # Discovery-specific
    num_papers: int = 10
    days_back: int = 30
    discovery: Optional[DiscoveryResult] = None
    discovery_phase: Optional[str] = None  # current phase of discovery
    analysis_query: Optional[str] = None  # the research question (editable by user before analysis)
    # Model configuration
    llm_config: Optional[ModelConfig] = None
    # Persisted generated content
    paper_content: Optional[str] = None
    in_silico_suggestions: Optional[str] = None
    experimental_suggestions: Optional[str] = None
    # Skills/tools used during the workflow
    skills_used: List[str] = Field(default_factory=list)


class ProjectSummary(BaseModel):
    id: str
    query: str
    mode: ProjectMode
    status: ProjectStatus
    created_at: str
    duration: Optional[float] = None
    stages_total: int = 0
    stages_completed: int = 0
    files_count: int = 0
    discovery_phase: Optional[str] = None


class PaperRequest(BaseModel):
    title: Optional[str] = None
    include_figures: bool = True
    include_code: bool = False


class PaperResponse(BaseModel):
    content: str
    format: str = "markdown"
    title: str = ""
