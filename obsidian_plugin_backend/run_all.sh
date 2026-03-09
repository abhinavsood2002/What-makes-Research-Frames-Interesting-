#!/bin/bash

# Script to start Async Research Frames services in tmux sessions

# Check if tmux is installed
if ! command -v tmux &> /dev/null; then
    echo "tmux is not installed. Please install tmux first."
    exit 1
fi

# Check if conda is available
if ! command -v conda &> /dev/null; then
    echo "conda is not installed. Please install conda first."
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "docker-compose is not installed. Please install docker-compose first."
    exit 1
fi

# Kill existing sessions if they exist
tmux kill-session -t database 2>/dev/null
tmux kill-session -t llm-server 2>/dev/null
tmux kill-session -t api-server 2>/dev/null

echo "Starting Async Research Frames services..."

# Start database first
echo "Starting database services..."
tmux new-session -d -s database -c "$(pwd)"
tmux send-keys -t database "echo 'Starting PostgreSQL and support services...'" Enter
tmux send-keys -t database "docker-compose up" Enter

# Wait a bit for database to start
echo "Waiting for database to initialize..."
sleep 10

# Create session for LLM server
echo "Creating LLM server session..."
tmux new-session -d -s llm-server -c "$(pwd)"
tmux send-keys -t llm-server "source .venv/bin/activate" Enter
tmux send-keys -t llm-server "echo 'Starting LLM server...'" Enter
tmux send-keys -t llm-server "./run_llm.sh" Enter

# Create session for API server
echo "Creating async API server session..."
tmux new-session -d -s api-server -c "$(pwd)"
tmux send-keys -t api-server "source .venv/bin/activate" Enter
tmux send-keys -t api-server "echo 'Starting async API server with background worker...'" Enter
tmux send-keys -t api-server "python main.py" Enter

echo ""
echo "Async Research Frames services started in tmux sessions:"
echo "  - Database Services: tmux attach -t database"
echo "  - LLM Server: tmux attach -t llm-server"
echo "  - API Server: tmux attach -t api-server"
echo ""
echo "To view all sessions: tmux list-sessions"
echo "To stop services: ./stop_all.sh"
echo ""
echo "The system includes:"
echo "  - PostgreSQL database for persistent storage"
echo "  - Background frame generator for continuous processing"
echo "  - Async API for real-time frame browsing"
echo ""
echo "Attaching to API server session..."

# Attach to the API server session by default
tmux attach -t api-server