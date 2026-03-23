#!/bin/bash

# Exit on any error
set -e

# Get the directory where the script is located
ROOT_DIR=$(pwd)
HOST_IP=${HOST_IP:-157.181.34.22}

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

# Wait for backend to be ready before starting the frontend
echo -e "  \033[0;33mWaiting for backend to be ready...\033[0m"
BACKEND_URL="http://127.0.0.1:8765/api/projects"
MAX_WAIT=60
ELAPSED=0
until curl -sf "$BACKEND_URL" -o /dev/null 2>/dev/null; do
    if [ $ELAPSED -ge $MAX_WAIT ]; then
        echo -e "  \033[0;31mBackend did not start within ${MAX_WAIT}s — aborting.\033[0m"
        kill $BACKEND_PID 2>/dev/null
        exit 1
    fi
    # Check if the backend process died unexpectedly
    if ! kill -0 $BACKEND_PID 2>/dev/null; then
        echo -e "  \033[0;31mBackend process exited unexpectedly — aborting.\033[0m"
        exit 1
    fi
    sleep 1
    ELAPSED=$((ELAPSED + 1))
done
echo -e "  \033[0;32mBackend is up (${ELAPSED}s)\033[0m"

# Start Vite frontend
echo -e "  \033[0;33mStarting frontend (port 5173)...\033[0m"
cd "$ROOT_DIR/web/frontend" && npm run dev &
FRONTEND_PID=$!

echo -e "\n  \033[0;32mOpen http://$HOST_IP:5173 in your browser\033[0m\n"
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