#!/bin/bash

# Script to stop all Async Research Frames services

echo "Stopping all Async Research Frames services..."

# Stop tmux sessions
echo "Stopping tmux sessions..."
tmux kill-session -t database 2>/dev/null && echo "  ✓ Database session stopped"
tmux kill-session -t llm-server 2>/dev/null && echo "  ✓ LLM server session stopped"
tmux kill-session -t api-server 2>/dev/null && echo "  ✓ API server session stopped"

# Stop Docker services
echo "Stopping Docker services..."
docker-compose down 2>/dev/null && echo "  ✓ Docker services stopped"

echo ""
echo "All services stopped successfully!"
echo ""
echo "To restart: ./run_all.sh"