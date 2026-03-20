# Agentic Data Scientist

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/PharosBioTeam/open-agentic-data-scientist/pulls)
[![Python 3.12](https://img.shields.io/badge/python-3.12-blue.svg)](https://www.python.org/downloads/)
[![PyPI version](https://badge.fury.io/py/agentic-data-scientist.svg?icon=si%3Apython)](https://badge.fury.io/py/agentic-data-scientist)

**An Adaptive Multi-Agent Framework for Data Science**

Agentic Data Scientist is an open-source framework that uses a sophisticated multi-agent workflow to tackle complex data science tasks. Built on Google's Agent Development Kit (ADK) and Claude Agent SDK, it separates planning from execution, validates work continuously, and adapts its approach based on progress.

## Features

- 🤖 **Adaptive Multi-Agent Workflow**: Iterative planning, execution, validation, and reflection
- 📋 **Intelligent Planning**: Creates comprehensive analysis plans before starting work
- 🔄 **Continuous Validation**: Tracks progress against success criteria at every step
- 🎯 **Self-Correcting**: Reviews and adapts the plan based on discoveries during execution
- 🔌 **MCP Integration**: Tool access via Model Context Protocol servers
- 🧠 **Claude Scientific Skills Integration**: Access 120+ scientific skills directly within your workflows
- 📁 **File Handling**: Simple file upload and management
- 🛠️ **Extensible**: Customize prompts, agents, and workflows
- 📦 **Easy Installation**: Available via pip and uvx

### 🆕 Key New Features

- **🌐 Web Interface**: Full-featured web UI with real-time monitoring and interactive workflow visualization
- **📊 Project Inheritance**: Build new projects on top of completed ones - all scripts, data, and results are copied automatically
- **♾️ Unlimited Event History**: Complete preservation of all analysis steps - no more truncated logs
- **🔄 Server-Sent Events**: Real-time streaming of project progress via API
- **📈 Interactive Workflow Graph**: Visual narrative of your entire analysis with embedded figure thumbnails
- **🎛️ Flexible Model Configuration**: Support for Bedrock, OpenRouter, OpenAI, Anthropic, and local inference servers
- **📱 REST API**: Complete programmatic access to all features

## Quick Start

### Prerequisites

Before using Agentic Data Scientist, you must have:

1. **Claude Code CLI** installed
   ```bash
   npm install -g @anthropic-ai/claude-code
   ```
   Or visit [Claude Code Quickstart](https://code.claude.com/docs/en/quickstart)

2. **Required API Keys** configured (see Configuration section below)
  - OPENAI_API_KEY or OPENROUTER_API_KEY or AWS_BEARER_TOKEN_BEDROCK (for planning/review agents)
   - ANTHROPIC_API_KEY (for coding agent)

### Installation

```bash
# Install from PyPI
uv tool install agentic-data-scientist

# Or use with uvx (no installation needed)
uvx agentic-data-scientist --mode simple "your query here"
```

### Configuration

**API Keys**

Configure API keys based on your chosen providers:

1. **Planning/Review provider** (choose one):
  - **OpenAI**
    ```bash
    export OPENAI_API_KEY="your_key_here"
    ```
  - **OpenRouter**
    ```bash
    export OPENROUTER_API_KEY="your_key_here"
    ```
    Get your key at: https://openrouter.ai/keys
  - **Bedrock**
    ```bash
    export AWS_BEARER_TOKEN_BEDROCK="your_token_here"
    ```

2. **Coding provider** (Claude Code):
   ```bash
  export ANTHROPIC_API_KEY="your_key_here"
   ```
   Get your key at: https://console.anthropic.com/

Alternatively, create a `.env` file in your project directory:
```bash
OPENAI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
```

**Network Access Control** (Optional)

By default, agents have access to network tools (web search and URL fetching). To disable network access:

```bash
export DISABLE_NETWORK_ACCESS=true
```

This disables:
- `fetch_url` tool for ADK agents
- `WebFetch` and `WebSearch` tools for Claude Code agent

Network access is enabled by default. Set to "true" or "1" to disable.

### Basic Usage

**Important**: You must specify `--mode` to choose your execution strategy. This ensures you're aware of the complexity and API costs.

**Working Directory**: By default, files are saved to `./agentic_output/` in your current directory and preserved after completion. Use `--temp-dir` for temporary storage with auto-cleanup.

#### Orchestrated Mode (Full Multi-Agent Workflow)

```bash
# Complex analysis with planning, execution, and validation
agentic-data-scientist "Perform differential expression analysis" --mode orchestrated --files data.csv

# Multiple files with custom working directory
agentic-data-scientist "Compare datasets" --mode orchestrated -f data1.csv -f data2.csv --working-dir ./my_analysis

# Directory upload (recursive)
agentic-data-scientist "Analyze all data" --mode orchestrated --files data_folder/
```

#### Simple Mode (Direct Coding, No Planning)

```bash
# Quick coding tasks without planning overhead
agentic-data-scientist "Write a Python script to parse CSV files" --mode simple

# Question answering
agentic-data-scientist "Explain how gradient boosting works" --mode simple

# Fast analysis with temporary directory
agentic-data-scientist "Quick data exploration" --mode simple --files data.csv --temp-dir
```

#### Additional Options

```bash
# Custom log file location
agentic-data-scientist "Analyze data" --mode orchestrated --files data.csv --log-file ./analysis.log

# Verbose logging for debugging
agentic-data-scientist "Debug issue" --mode simple --files data.csv --verbose

# Keep files (override default preservation)
agentic-data-scientist "Generate report" --mode orchestrated --files data.csv --keep-files
```

## Web Interface

### Starting the Web UI

```bash
# Start the web server
agentic-data-scientist --web --port 8080

# Access the interface
open http://localhost:8080
```

### Web UI Features

- **📊 Dashboard**: Overview of all projects with status tracking
- **🎯 Project Management**: Create, monitor, and manage data science projects
- **📈 Real-time Monitoring**: Watch agents work live with streaming updates
- **🔍 Interactive Workflow Graph**: Visual exploration of analysis steps with embedded figures
- **📁 File Upload**: Drag-and-drop interface for data files
- **🎛️ Model Configuration**: Switch between providers and models dynamically
- **📱 REST API**: Complete programmatic access to all features

### Using the Web Interface

1. **Create a New Project**: 
   - Click "New Project" on the dashboard
   - Upload your data files (CSV, JSON, etc.)
   - Choose execution mode (Orchestrated/Simple)
   - Set your analysis question

2. **Monitor Progress**:
   - Real-time event log shows agent activities
   - Workflow graph updates as analysis progresses
   - Figure gallery displays generated visualizations

3. **Review Results**:
   - Download generated scripts and reports
   - Explore interactive figures
   - Export project data for reuse

4. **Project Inheritance**:
   - Build new projects on completed analyses
   - All scripts, data, and results are automatically copied

## How It Works

Agentic Data Scientist uses a multi-phase workflow designed to produce high-quality, reliable results:

### Workflow Design Rationale

**Why separate planning from execution?**
- Thorough analysis of requirements before starting reduces errors and rework
- Clear success criteria established upfront ensure all requirements are met
- Plans can be validated and refined before committing resources to implementation

**Why use iterative refinement?**
- Multiple review loops catch issues early when they're easier to fix
- Both plans and implementations are validated before proceeding
- Continuous feedback improves quality at every step

**Why adapt during execution?**
- Discoveries during implementation often reveal new requirements
- Rigid plans can't accommodate unexpected insights or challenges
- Adaptive replanning ensures the final deliverable meets actual needs

**Why continuous validation?**
- Success criteria tracking provides objective progress measurement
- Early detection of issues prevents wasted effort
- Clear visibility into what's been accomplished and what remains

### The Multi-Agent Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                     USER QUERY                              │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────▼────────────────┐
        │   PLANNING PHASE             │
        │  ┌───────────────────────┐   │
        │  │ Plan Maker            │◄──┤ Iterative refinement
        │  │ "What needs to be     │   │ until plan is complete
        │  │  done?"               │   │ and validated
        │  └──────────┬────────────┘   │
        │             │                │
        │  ┌──────────▼────────────┐   │
        │  │ Plan Reviewer         │   │
        │  │ "Is this complete?"   │───┤
        │  └──────────┬────────────┘   │
        │             │                │
        │  ┌──────────▼────────────┐   │
        │  │ Plan Parser           │   │
        │  │ Structures into       │   │
        │  │ executable stages     │   │
        │  └──────────┬────────────┘   │
        └─────────────┼────────────────┘
                      │
        ┌─────────────▼────────────────┐
        │   EXECUTION PHASE            │
        │   (Repeated for each stage)  │
        │                              │
        │  ┌───────────────────────┐   │
        │  │ Coding Agent          │   │
        │  │ Implements the stage  │   │  Stage-by-stage
        │  │ (uses Claude Code)    │   │  implementation with
        │  └──────────┬────────────┘   │  continuous validation
        │             │                │
        │  ┌──────────▼────────────┐   │
        │  │ Review Agent          │◄──┤ Iterates until
        │  │ "Was this done        │   │ implementation
        │  │  correctly?"          │───┤ is approved
        │  └──────────┬────────────┘   │
        │             │                │
        │  ┌──────────▼────────────┐   │
        │  │ Criteria Checker      │   │
        │  │ "What have we         │   │
        │  │  accomplished?"       │   │
        │  └──────────┬────────────┘   │
        │             │                │
        │  ┌──────────▼────────────┐   │
        │  │ Stage Reflector       │   │
        │  │ "What should we do    │   │
        │  │  next?" Adapts plan   │   │
        │  └──────────┬────────────┘   │
        └─────────────┼────────────────┘
                      │
        ┌─────────────▼────────────────┐
        │   SUMMARY PHASE              │
        │  ┌───────────────────────┐   │
        │  │ Summary Agent         │   │
        │  │ Creates comprehensive │   │
        │  │ final report          │   │
        │  └───────────────────────┘   │
        └──────────────────────────────┘
```

### Agent Roles

Each agent in the workflow has a specific responsibility:

- **Plan Maker**: "What needs to be done?" - Creates comprehensive analysis plans with clear stages and success criteria
- **Plan Reviewer**: "Is this plan complete?" - Validates that plans address all requirements before execution begins
- **Plan Parser**: Converts natural language plans into structured, executable stages with trackable success criteria
- **Stage Orchestrator**: Manages the execution cycle - runs stages one at a time, validates progress, and adapts as needed
- **Coding Agent**: Does the actual implementation work (powered by Claude Code SDK with access to 380+ scientific Skills)
- **Review Agent**: "Was this done correctly?" - Validates implementations against requirements before proceeding
- **Criteria Checker**: "What have we accomplished?" - Objectively tracks progress against success criteria after each stage
- **Stage Reflector**: "What should we do next?" - Analyzes progress and adapts remaining stages based on what's been learned
- **Summary Agent**: Synthesizes all work into a comprehensive, publication-ready report

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    CLI Interface                             │
├──────────────────────────────────────────────────────────────┤
│          Agentic Data Scientist Core                         │
│        (Session & Event Management)                          │
├──────────────────────────────────────────────────────────────┤
│               ADK Multi-Agent Workflow                       │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Planning Loop (Plan Maker → Reviewer → Parser)         │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Stage Orchestrator                                     │  |
│  │   ├─> Implementation Loop (Coding → Review)            │  │
│  │   ├─> Criteria Checker                                 │  │
│  │   └─> Stage Reflector                                  │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Summary Agent                                          │  │
│  └────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────┤
│                     Tool Layer                               │
│  • Built-in Tools: Read-only file ops, web fetch             │
│  • Claude Scientific Skills: 120+ skills                     │
└──────────────────────────────────────────────────────────────┘
```

## Web UI

The project includes a full-featured web interface for creating, monitoring, and managing analysis projects.

### Web UI Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| **Python** | 3.12+ | Backend server |
| **Node.js** | 18+ | Frontend dev server + Claude Code CLI |
| **uv** | latest | Python package management |
| **Claude Code CLI** | latest | Coding agent (`npm install -g @anthropic-ai/claude-code`) |

### Web UI Installation

The web interface provides the full feature set including project inheritance, unlimited event history, and interactive workflow visualization.

```bash
# 1. Clone the repository
git clone https://github.com/your-org/agentic-data-scientist.git
cd agentic-data-scientist

# 2. Install Python dependencies
uv sync

# 3. Install frontend dependencies
cd web/frontend
npm install
cd ../..

# 4. Configure environment (see Configuration section below)
cp .env.example .env   # then edit .env with your API keys
```

### Starting the Web UI

**Quick start (PowerShell):**
```powershell
.\web\start.ps1
```

**Manual start (two terminals):**
```bash
# Terminal 1: Backend (port 8765)
uv run python -m uvicorn web.backend.app:app --host 0.0.0.0 --port 8765 --reload

# Terminal 2: Frontend (port 5173)
cd web/frontend && npm run dev
```

Open **http://localhost:5173** in your browser.

### Web UI vs CLI

| Feature | Web UI | CLI |
|---------|--------|-----|
| **Project Management** | Visual dashboard, drag-and-drop files | Command-line interface |
| **Real-time Monitoring** | Live event streaming, progress bars | Terminal output |
| **Workflow Visualization** | Interactive graph with figure thumbnails | Text-based logs |
| **Project Inheritance** | Dropdown selector for base projects | Manual file copying |
| **Model Configuration** | GUI for providers and models | Environment variables |
| **File Browsing** | Built-in file browser and gallery | File system access |
| **API Access** | Full REST API + SSE endpoints | Direct execution |

### Model Configuration (Web UI)

When creating a new project, click **Model Settings** to configure which LLM provider and models to use. If you don't configure anything, the system uses your `.env` defaults (typically Bedrock).

#### Supported Providers

| Provider | Planning/Review Agents | Coding Agent | Notes |
|----------|----------------------|--------------|-------|
| **Default** | From `.env` config | Claude Code CLI | No setup needed if `.env` is configured |
| **Bedrock** | `bedrock/us.anthropic.claude-sonnet-4-5-20250929-v1:0` | Claude Code CLI | Requires AWS credentials |
| **OpenAI** | `openai/gpt-4.1` | Claude Code CLI | Requires `OPENAI_API_KEY` |
| **Anthropic** | `anthropic/claude-sonnet-4-5-20250929` | Claude Code CLI | Requires `ANTHROPIC_API_KEY` |
| **OpenRouter** | `anthropic/claude-sonnet-4` | Claude Code CLI | Requires `OPENROUTER_API_KEY` |
| **Local** | Any HuggingFace model via OpenAI-compatible API | Claude Code CLI | Requires local inference server |

> **Note:** The coding agent always uses Claude Code CLI regardless of provider selection. The provider setting controls the planning, review, and summary agents.

### Using Local Models (HuggingFace / vLLM / Ollama)

You can run planning and review agents on local open-source models instead of cloud APIs. This requires an OpenAI-compatible inference server running locally.

#### Step 1: Set Up a Local Inference Server

**Option A: vLLM (recommended for GPU servers)**
```bash
pip install vllm

# Serve a model (e.g., Qwen3-Coder)
vllm serve Qwen/Qwen3-Coder-480B-A35B-Instruct \
  --host 0.0.0.0 --port 8000 \
  --tensor-parallel-size 4 \
  --max-model-len 32768
```

AgenticDS disables automatic tool choice for `provider=local` by default to avoid vLLM 400 errors on `/v1/chat/completions`.

Only use vLLM tool-calling flags (`--enable-auto-tool-choice` + `--tool-call-parser ...`) when your model/tokenizer explicitly supports that parser. For example, `--tool-call-parser hermes` requires Hermes-specific tool-call tokens and will fail on many non-Hermes models.

**Option B: Ollama (easiest setup)**
```bash
# Install Ollama from https://ollama.ai
ollama pull qwen2.5-coder:32b

# Ollama serves on http://localhost:11434 by default
```

**Option C: Text Generation Inference (TGI)**
```bash
docker run --gpus all -p 8000:80 \
  ghcr.io/huggingface/text-generation-inference:latest \
  --model-id Qwen/Qwen2.5-Coder-32B-Instruct
```

#### Step 2: Configure in the Web UI

1. Click **"New Project"** on the dashboard
2. Expand **Model Settings**
3. Select **Local** provider
4. Set your model name (e.g., `Qwen/Qwen3-Coder-480B-A35B-Instruct`)
5. Set API Base URL to your server (e.g., `http://localhost:8000/v1`)
6. Leave API Key empty for most local servers

#### Recommended Local Models

| Model | Parameters | Use Case |
|-------|-----------|----------|
| `Qwen/Qwen3-Coder-480B-A35B-Instruct` | 480B (35B active) | Best coding quality, needs multi-GPU |
| `Qwen/Qwen2.5-Coder-32B-Instruct` | 32B | Good balance of quality and speed |
| `deepseek-ai/DeepSeek-R1-0528` | 671B (37B active) | Strong reasoning, needs multi-GPU |
| `meta-llama/Llama-4-Maverick-17B-128E-Instruct` | 17B per expert | Fast inference, good quality |

#### Important Notes for Local Models

- Local models handle **planning and review only**. The coding agent still uses Claude Code CLI (requires Anthropic API key or Bedrock credentials)
- Model quality matters significantly for planning — smaller models may produce less reliable analysis plans
- Ensure your server supports the model's required context length (16K+ recommended)
- For Ollama, use the API base `http://localhost:11434/v1`

## Configuration

### Environment Variables

Create a `.env` file:

```bash
# Required: API keys (choose provider(s))
ANTHROPIC_API_KEY=your_key_here        # Required for Claude Code coding agent
OPENAI_API_KEY=your_key_here           # Optional: OpenAI for planning/review
OPENROUTER_API_KEY=your_key_here       # Optional: OpenRouter for planning/review
AWS_BEARER_TOKEN_BEDROCK=your_token    # Optional: Bedrock for planning/review (+ coding if configured)

# Optional: Override default models
DEFAULT_MODEL=openai/gpt-4.1
REVIEW_MODEL=openai/gpt-4.1
CODING_MODEL=claude-sonnet-4-5-20250929

# Optional: Provider selection (bedrock, openrouter, openai, anthropic, local)
LLM_PROVIDER=openai

# Optional: Local provider tool-calling behavior
# Default false: avoids OpenAI tool_choice="auto" for vLLM compatibility
LOCAL_ENABLE_AUTO_TOOL_CHOICE=false
```

### Tools & Skills

**Built-in Tools** (planning/review agents):
- **File Operations**: Read-only file access within working directory
  - `read_file`, `read_media_file`, `list_directory`, `directory_tree`, `search_files`, `get_file_info`
- **Web Operations**: HTTP fetch for retrieving web content
  - `fetch_url`

**Claude Scientific Skills** (coding agent):
- **120+ Scientific Skills** automatically loaded from claude-scientific-skills
  - Scientific databases: UniProt, PubChem, PDB, KEGG, PubMed, and more
  - Scientific packages: BioPython, RDKit, PyDESeq2, scanpy, and more
  - Auto-cloned to `.claude/skills/` at coding agent startup

All tools are sandboxed to the working directory for security.

## API Documentation

The Agentic Data Scientist provides a RESTful API for programmatic project management and execution.

### API Endpoints

#### Projects
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create a new project
- `GET /api/projects/{id}` - Get project details
- `POST /api/projects/{id}/start` - Start project execution
- `POST /api/projects/{id}/stop` - Stop running project
- `DELETE /api/projects/{id}` - Delete a project

#### Files & Outputs
- `GET /api/projects/{id}/files/{file_path}` - Download project files
- `GET /api/projects/{id}/stream` - Server-sent events for real-time progress
- `POST /api/projects/{id}/paper` - Generate final report

#### Project Creation Parameters
```json
{
  "query": "Your research question",
  "mode": "orchestrated|simple|discovery",
  "files": ["file1.csv", "file2.xlsx"],
  "base_project_id": "optional_base_project_id",
  "num_papers": 10,
  "days_back": 30,
  "llm_config": {
    "provider": "bedrock|openrouter|local",
    "planning_model": "model_id",
    "coding_model": "model_id",
    "api_base": "http://localhost:8000/v1",
    "api_key": "optional_key"
  }
}
```

### Example API Usage

```bash
# Create a new project
curl -X POST http://localhost:8765/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Analyze customer churn patterns",
    "mode": "orchestrated",
    "files": ["customers.csv"]
  }'

# Start the project
curl -X POST http://localhost:8765/api/projects/{project_id}/start

# Stream real-time progress
curl -N http://localhost:8765/api/projects/{project_id}/stream

# Download generated figure
curl -O http://localhost:8765/api/projects/{id}/files/figures/plot.png
```

### Server-Sent Events (SSE)

The `/stream` endpoint provides real-time updates:
```javascript
const eventSource = new EventSource('/api/projects/{id}/stream');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Event:', data);
  // Handle different event types: message, tool_call, stage_complete, etc.
};
```

## Web UI Features

The web interface provides a complete project management experience:

### Dashboard
- **Project List**: View all projects with status, duration, and file counts
- **Quick Actions**: Start, stop, delete projects from the dashboard
- **Real-time Updates**: Auto-refresh for running projects

### Project Creation
- **Three Modes**: Orchestrated, Simple, Discovery
- **File Upload**: Drag-and-drop multiple files
- **Model Configuration**: Choose LLM providers and models
- **Project Inheritance**: Build on top of completed projects

### Project Detail View
- **Live Progress**: Real-time event streaming
- **Stage Tracking**: Visual progress through analysis stages
- **File Browser**: Browse and download all generated files
- **Figure Gallery**: View all generated plots and visualizations
- **Workflow Graph**: Interactive narrative visualization of the entire analysis

### Advanced Features
- **Project Inheritance**: Start new projects based on existing ones
- **Unlimited Event History**: Complete preservation of all analysis steps
- **Custom Model Providers**: Support for Bedrock, OpenRouter, and local models
- **Paper Generation**: Export complete reports in various formats

## Documentation

- [Getting Started Guide](docs/getting_started.md) - Learn how the workflow operates step by step
- [API Reference](docs/api_reference.md) - Complete API documentation
- [Tools Configuration](docs/tools_configuration.md) - Configure tools and skills
- [Extending](docs/extending.md) - Customize prompts, agents, and workflows

## Examples

### Orchestrated Mode Use Cases

**Complex Data Analysis**
```bash
# Differential expression analysis with multiple files
agentic-data-scientist "Perform DEG analysis comparing treatment vs control" \
  --mode orchestrated \
  --files treatment_data.csv \
  --files control_data.csv
```

**Multi-Step Workflows**
```bash
# Complete analysis pipeline with visualization
agentic-data-scientist "Analyze customer churn, create predictive model, and generate report" \
  --mode orchestrated \
  --files customers.csv \
  --working-dir ./churn_analysis
```

**Directory Processing**
```bash
# Process entire dataset directory
agentic-data-scientist "Analyze all CSV files and create summary statistics" \
  --mode orchestrated \
  --files ./raw_data/
```

### Simple Mode Use Cases

**Quick Scripts**
```bash
# Generate utility scripts
agentic-data-scientist "Write a Python script to merge CSV files by common column" \
  --mode simple
```

**Code Explanation**
```bash
# Technical questions
agentic-data-scientist "Explain the difference between Random Forest and Gradient Boosting" \
  --mode simple
```

**Fast Prototypes**
```bash
# Quick analysis with temporary workspace
agentic-data-scientist "Create a basic scatter plot from this data" \
  --mode simple \
  --files data.csv \
  --temp-dir
```

### Working Directory Examples

```bash
# Default behavior (./agentic_output/ with file preservation)
agentic-data-scientist "Analyze data" --mode orchestrated --files data.csv

# Temporary directory (auto-cleanup)
agentic-data-scientist "Quick test" --mode simple --files data.csv --temp-dir

# Custom location
agentic-data-scientist "Project analysis" --mode orchestrated --files data.csv --working-dir ./my_project

# Custom location with explicit cleanup
agentic-data-scientist "Temporary analysis" --mode simple --files data.csv --working-dir ./temp --keep-files=false
```

## Development

### Setup

```bash
# Clone repository
git clone https://github.com/your-org/agentic-data-scientist.git
cd agentic-data-scientist

# Install with dev dependencies using uv
uv sync --extra dev

# Run tests
uv run pytest tests/

# Format code
uv run ruff format .

# Lint
uv run ruff check --fix .
```

### Project Structure

```
agentic-data-scientist/
├── src/agentic_data_scientist/
│   ├── core/           # Core API and session management
│   ├── agents/         # Agent implementations
│   │   ├── adk/        # ADK multi-agent workflow
│   │   │   ├── agent.py              # Agent factory
│   │   │   ├── stage_orchestrator.py # Stage-by-stage execution
│   │   │   ├── implementation_loop.py# Coding + review loop
│   │   │   ├── loop_detection.py     # Loop detection agent
│   │   │   └── review_confirmation.py# Review decision logic
│   │   └── claude_code/# Claude Code integration
│   ├── prompts/        # Prompt templates
│   │   ├── base/       # Agent role prompts
│   │   └── domain/     # Domain-specific prompts
│   ├── tools/          # Built-in tools (file ops, web fetch)
│   └── cli/            # CLI interface
├── tests/              # Test suite
└── docs/               # Documentation
```

## Requirements

- Python 3.12+
- Node.js (for Claude Code)
- API keys for Anthropic and OpenRouter

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

```bash
# Fork and clone, then:
uv sync --extra dev
# Make changes, add tests
uv run pytest tests/ -v
# Submit PR
```

## Release Process

For maintainers:

1. **Create and push tag:**
   ```bash
   ./scripts/release.sh 0.2.0
   ```

2. **Create GitHub release:**
   - Go to https://github.com/your-org/agentic-data-scientist/releases/new?tag=v0.2.0
   - Click "Generate release notes" for automatic changelog
   - Publish release
   - Package automatically publishes to PyPI

**One-time PyPI Setup:** Configure [trusted publishing](https://docs.pypi.org/trusted-publishers/) on PyPI with repo `your-org/agentic-data-scientist` and workflow `pypi-publish.yml`.

Use conventional commits (`feat:`, `fix:`, `docs:`, etc.) for clean changelogs.

## Technical Notes

### Context Window Management

The framework implements aggressive event compression to manage context window usage during long-running analyses:

#### Event Compression Strategy

- **Automatic Compression**: Events are automatically compressed when count exceeds threshold (default: 40 events)
- **LLM-based Summarization**: Old events are summarized using LLM before removal to preserve critical context
- **Aggressive Truncation**: Large text content (>10KB) is truncated to prevent token overflow
- **Direct Event Queue Manipulation**: Uses direct assignment to `session.events` to ensure changes take effect

#### Preventing Token Overflow

The system employs multiple layers of protection:

- **Callback-based compression**: Triggers automatically after each agent turn
- **Manual compression**: Triggered at key orchestration points (e.g., after implementation loop)
- **Hard limit trimming**: Emergency fallback that discards old events if count exceeds maximum
- **Large text truncation**: Prevents individual events from consuming excessive tokens

These mechanisms work together to keep the total context under 1M tokens even during complex multi-stage analyses.

## Support

- GitHub Issues: [Report bugs or request features](https://github.com/your-org/agentic-data-scientist/issues)
- Documentation: [Full documentation](https://github.com/your-org/agentic-data-scientist/blob/main/docs)

## Acknowledgments

Built with:
- [Google Agent Development Kit (ADK)](https://google.github.io/adk-docs/)
- [Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Claude Scientific Skills](https://github.com/your-org/claude-scientific-skills)

## License

MIT License - see [LICENSE](LICENSE) for details.

Copyright © 2025 Agentic Data Scientist Contributors

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=PharosBioTeam/open-agentic-data-scientist&type=date&legend=top-left)](https://www.star-history.com/#PharosBioTeam/open-agentic-data-scientist&type=date&legend=top-left)
