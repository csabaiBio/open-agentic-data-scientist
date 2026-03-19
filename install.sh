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