# Research Frames — Backend

FastAPI backend for Research Frames. Handles JWT authentication, a persistent frame-generation task queue, PostgreSQL storage, and real-time WebSocket notifications. Frame generation uses a vLLM server running a Meta Llama model.

## Setup

### Prerequisites
- Python 3.8+ with conda
- Docker (for PostgreSQL)
- A GPU node running vLLM with a compatible model (e.g. `meta-llama/Llama-3.3-70B-Instruct`)
- conda environment: `knowledge-gap-finder`

### Install
```bash
conda env create -f environment.yml
conda activate knowledge-gap-finder
cp .env.example .env   # fill in DATABASE_URL, VLLM_API_URL, etc.
```

### Run

**All services (recommended):**
```bash
./run_all.sh   # starts PostgreSQL (Docker), vLLM server, and FastAPI in tmux sessions
```

**Individual services:**
```bash
docker-compose up    # PostgreSQL only
./run_llm.sh         # vLLM server only
python main.py       # FastAPI server only
```

The API is available at `http://localhost:8000` by default.
