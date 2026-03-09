#!/bin/bash
export HF_HOME=/mnt/scratch/Anonymized/huggingface/
export HF_HUB_CACHE=/mnt/scratch/Anonymized/huggingface/

# # Install the special vLLM version for gpt-oss
# uv pip install --pre vllm==0.10.1+gptoss \
#   --extra-index-url https://wheels.vllm.ai/gpt-oss/ \
#   --extra-index-url https://download.pytorch.org/whl/nightly/cu128 \
#   --index-strategy unsafe-best-match \
#   --no-cache 
# uv pip install vllm==0.10.1 --torch-backend=auto
VLLM_ATTENTION_BACKEND=TRITON_ATTN_VLLM_V1 vllm serve openai/gpt-oss-120b --config llm_config.yaml