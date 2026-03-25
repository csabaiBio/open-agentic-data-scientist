#!/bin/bash

# Exit on any error
set -e

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd)

BACKEND_PORT=${BACKEND_PORT:-8765}
BACKEND_HOST=${BACKEND_HOST:-0.0.0.0}
VITE_HOST_IP=${VITE_HOST_IP:-127.0.0.1}
VITE_FRONTEND_HOST=${VITE_FRONTEND_HOST:-0.0.0.0}
VITE_FRONTEND_PORT=${VITE_FRONTEND_PORT:-5173}
VITE_FRONTEND_URL_PREFIX=${VITE_FRONTEND_URL_PREFIX:-/}

if [[ "$VITE_FRONTEND_URL_PREFIX" != /* ]]; then
    VITE_FRONTEND_URL_PREFIX="/$VITE_FRONTEND_URL_PREFIX"
fi

if [[ "$VITE_FRONTEND_URL_PREFIX" != "/" ]]; then
    VITE_FRONTEND_URL_PREFIX="${VITE_FRONTEND_URL_PREFIX%/}/"
fi

export VITE_HOST_IP
export VITE_PORT
export VITE_BACKEND_PORT
export VITE_FRONTEND_URL_PREFIX

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
echo -e "  \033[0;33mStarting backend ($BACKEND_HOST:$BACKEND_PORT)...\033[0m"
uv run python -m uvicorn web.backend.app:app --host "$BACKEND_HOST" --port "$BACKEND_PORT" --reload &
BACKEND_PID=$!

# Wait for backend to be ready before starting the frontend
echo -e "  \033[0;33mWaiting for backend to be ready...\033[0m"
BACKEND_URL="http://127.0.0.1:$BACKEND_PORT/api/projects"
MAX_WAIT=60
ELAPSED=0
# until curl -sf "$BACKEND_URL" -o /dev/null 2>/dev/null; do
#     if [ $ELAPSED -ge $MAX_WAIT ]; then
#         echo -e "  \033[0;31mBackend did not start within ${MAX_WAIT}s — aborting.\033[0m"
#         kill $BACKEND_PID 2>/dev/null
#         exit 1
#     fi
#     # Check if the backend process died unexpectedly
#     if ! kill -0 $BACKEND_PID 2>/dev/null; then
#         echo -e "  \033[0;31mBackend process exited unexpectedly — aborting.\033[0m"
#         exit 1
#     fi
#     sleep 1
#     ELAPSED=$((ELAPSED + 1))
# done
echo -e "  \033[0;32mBackend is up (${ELAPSED}s)\033[0m"

# Start Vite frontend
echo -e "  \033[0;33mStarting frontend ($VITE_FRONTEND_HOST:$VITE_FRONTEND_PORT, root path $VITE_FRONTEND_URL_PREFIX)...\033[0m"
cd "$ROOT_DIR/web/frontend" && npm run dev -- --host "$VITE_FRONTEND_HOST" --port "$VITE_FRONTEND_PORT" &
VITE_FRONTEND_PID=$!

echo -e "\n  \033[0;32mOpen http://$VITE_HOST_IP:$VITE_FRONTEND_PORT$VITE_FRONTEND_URL_PREFIX in your browser\033[0m\n"
echo -e "  \033[0;90mPress Ctrl+C to stop both servers\033[0m\n"

# Function to kill processes on exit
cleanup() {
    echo -e "\n  \033[0;31mShutting down servers...\033[0m"
    kill $BACKEND_PID $VITE_FRONTEND_PID 2>/dev/null
    exit
}

# Trap Ctrl+C (SIGINT) and call cleanup
trap cleanup SIGINT

# Wait for background processes
wait