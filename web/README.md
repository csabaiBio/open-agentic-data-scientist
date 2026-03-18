# Agentic Data Scientist - Web UI

A modern web interface for creating, monitoring, and managing data science analyses.

## Features

- **Project Management** — Create, track, and delete analysis projects
- **Real-time Progress** — Stage-by-stage progress with live event streaming (SSE)
- **File Upload** — Drag & drop input files for your analyses
- **Figure Gallery** — Browse generated visualizations with lightbox view
- **Output Browser** — Preview reports, data files, and code with inline expansion
- **Paper Generation** — One-click comprehensive research paper from all outputs
- **Stop/Resume** — Stop running analyses at any time

## Quick Start

### Prerequisites
- Python 3.12+ with `uv` installed
- Node.js 18+ with `npm`
- Project dependencies installed (`uv sync` from root)

### Start both servers

```powershell
# From the project root:
.\web\start.ps1
```

Or start manually:

```powershell
# Terminal 1 - Backend (FastAPI)
uv run python -m uvicorn web.backend.app:app --host 0.0.0.0 --port 8765 --reload

# Terminal 2 - Frontend (React + Vite)
cd web/frontend
npm run dev
```

Open **http://localhost:5173** in your browser.

## Architecture

```
web/
├── backend/
│   ├── app.py              # FastAPI routes + SSE streaming
│   ├── models.py           # Pydantic data models
│   └── project_manager.py  # Project lifecycle + paper generation
├── frontend/
│   ├── src/
│   │   ├── App.tsx         # Router setup
│   │   ├── api.ts          # API client + SSE subscription
│   │   ├── types.ts        # TypeScript interfaces
│   │   ├── components/     # Reusable UI components
│   │   │   ├── Layout.tsx
│   │   │   ├── StatusBadge.tsx
│   │   │   ├── StageProgress.tsx
│   │   │   ├── EventLog.tsx
│   │   │   ├── FigureGallery.tsx
│   │   │   └── OutputPanel.tsx
│   │   └── pages/
│   │       ├── Dashboard.tsx      # Project list + new project form
│   │       └── ProjectDetail.tsx  # Live progress + outputs + paper
│   └── package.json
├── start.ps1               # One-click launcher
└── README.md
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List all projects |
| POST | `/api/projects` | Create + start a project (multipart form) |
| GET | `/api/projects/:id` | Get project details |
| DELETE | `/api/projects/:id` | Delete a project |
| POST | `/api/projects/:id/stop` | Stop a running project |
| GET | `/api/projects/:id/stream` | SSE event stream |
| GET | `/api/projects/:id/files/:path` | Serve generated files |
| POST | `/api/projects/:id/paper` | Generate research paper |
