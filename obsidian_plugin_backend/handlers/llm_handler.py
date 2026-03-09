import os
import aiohttp
from enum import Enum
from typing import Optional
from pydantic import BaseModel
from dotenv import load_dotenv
from openai import AsyncOpenAI

# Load environment variables with override enabled
load_dotenv(override=True)

class ModelType(str, Enum):
    """Supported model types - GPT OSS 120B only"""
    GPT_OSS_120B = "openai/gpt-oss-120b"

    @classmethod
    def get_default(cls) -> "ModelType":
        """Get the default model from environment or use GPT OSS 120B"""
        model_path = os.getenv("MODEL_PATH", cls.GPT_OSS_120B.value)
        if model_path == cls.GPT_OSS_120B.value:
            return cls.GPT_OSS_120B
        return cls.GPT_OSS_120B

class LLMResponse(BaseModel):
    """Response from an LLM"""
    text: str
    model: str
    finish_reason: Optional[str] = None

class LLMHandler:
    """
    Handler for interacting with GPT OSS 120B via vLLM API.
    Uses OpenAI SDK for responses endpoint.
    """

    def __init__(
        self,
        model: ModelType = None,
        vllm_api_url: str = None
    ):
        """
        Initialize the LLM handler.

        Args:
            model: The model to use (GPT OSS 120B)
            vllm_api_url: URL for vLLM API base (defaults to localhost:8001)
        """
        self.model = model if model else ModelType.get_default()
        base_url = vllm_api_url or os.getenv("VLLM_API_URL", "http://localhost:8001")
        # Remove /v1 suffix if present, OpenAI client will add it
        if base_url.endswith("/v1"):
            base_url = base_url[:-3]

        # Initialize OpenAI client for vLLM
        self.client = AsyncOpenAI(
            base_url=f"{base_url}/v1",
            api_key="EMPTY"  # vLLM doesn't require real API key
        )

        # Default system prompt for research assistance
        self.default_system_prompt = "You are a helpful research assistant specialized in academic analysis and synthesis."

        # Callback for streaming outputs to frontend
        self.output_callback = None

    def set_output_callback(self, callback):
        """Set callback function to stream outputs to frontend"""
        self.output_callback = callback
    
    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: Optional[float] = None,
        **kwargs
    ) -> LLMResponse:
        """
        Generate a response from GPT OSS 120B using the /v1/responses endpoint.

        Args:
            prompt: The prompt text
            system_prompt: Optional system prompt
            temperature: Temperature for sampling
            **kwargs: Additional parameters

        Returns:
            LLMResponse object containing the generated text and metadata
        """
        # Use defaults if not provided
        final_system_prompt = system_prompt or self.default_system_prompt
        final_temperature = temperature if temperature is not None else 0.7

        # Stream the prompt to frontend if callback is set
        if self.output_callback:
            self.output_callback(f"[{self.model.value}] Generating response...")
            self.output_callback(f"Config: temp={final_temperature}")
            self.output_callback(f"Prompt: {prompt}")

        try:
            # Use responses endpoint for GPT OSS 120B
            response = await self.client.responses.create(
                model=self.model.value,
                instructions=final_system_prompt,
                input=prompt,
                temperature=final_temperature,
                **kwargs
            )

            generated_text = response.output_text
            finish_reason = getattr(response, 'finish_reason', None)

            # Stream the response to frontend if callback is set
            if self.output_callback:
                self.output_callback(f"Response: {generated_text}")

            # Create response object
            llm_response = LLMResponse(
                text=generated_text,
                model=self.model.value,
                finish_reason=finish_reason
            )

            return llm_response

        except Exception as e:
            error_msg = f"Error calling vLLM API: {str(e)}"
            if self.output_callback:
                self.output_callback(f"ERROR: {error_msg}")

            # Return an error response
            return LLMResponse(
                text=f"Error: Failed to generate response. {str(e)}",
                model=self.model.value
            )