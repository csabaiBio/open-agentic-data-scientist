#!/bin/bash

# Exit on any error
set -e

# Get the directory where the script is located
ROOT_DIR=$(pwd)

echo -e "\n \033[0;36m Agentic Data Scientist - Web UI\033[0m"
echo -e "  \033[0;34m================================\033[0m\n"

# Ensure frontend dependencies are installed
if ! command -v npm >/dev/null 2>&1; then
    echo -e "  \033[0;31mError: npm is not installed or not in PATH\033[0m"
    exit 1
fi

if [ ! -x "$ROOT_DIR/web/frontend/node_modules/.bin/vite" ]; then
    echo -e "  \033[0;33mInstalling frontend dependencies...\033[0m"
    cd "$ROOT_DIR/web/frontend"
    npm install
    cd "$ROOT_DIR"
fi

# Start FastAPI backend
echo -e "  \033[0;33mStarting backend (port 8765)...\033[0m"
uv run python -m uvicorn web.backend.app:app --host 0.0.0.0 --port 8765 &
BACKEND_PID=$!

# Start Vite frontend
echo -e "  \033[0;33mStarting frontend (port 5173)...\033[0m"
cd "$ROOT_DIR/web/frontend" && npm run dev &
FRONTEND_PID=$!

echo -e "\n  \033[0;32mOpen http://localhost:5173 in your browser\033[0m\n"
echo -e "  \033[0;90mPress Ctrl+C to stop both servers\033[0m\n"

# Function to kill processes on exit
cleanup() {
    echo -e "\n  \033[0;31mShutting down servers...\033[0m"
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit
}

# Trap Ctrl+C (SIGINT) and call cleanup
trap cleanup SIGINT

# Wait for background processes
wait