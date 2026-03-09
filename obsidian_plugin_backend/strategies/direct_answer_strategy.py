"""
Direct Answer Strategy - generates frames using only research interest and question, no content.
This strategy provides pure analytical responses without any notes or PDFs.
"""
import logging
from typing import List, Dict, Any
from .base_strategy import BaseFrameStrategy, FrameGenerationContext, FrameResult
from .prompts import get_direct_answer_prompt
from modules.console import create_console
from modules.logging_config import setup_user_logger, log_llm_interaction

logger = logging.getLogger(__name__)

class DirectAnswerStrategy(BaseFrameStrategy):
    """Strategy that generates frames using only research interest and question - no content."""

    def __init__(self, websocket_manager=None):
        super().__init__()
        self.strategy_name = "direct_answer"
        self.websocket_manager = websocket_manager
        self.console = None

    def get_required_params(self) -> List[str]:
        """No required parameters for direct answer strategy."""
        return []

    def get_default_params(self) -> Dict[str, Any]:
        """Default parameters for direct answer strategy."""
        return {}

    def set_websocket_manager(self, websocket_manager):
        """Set the WebSocket manager for console output."""
        self.websocket_manager = websocket_manager

    async def generate_frame(self, context: FrameGenerationContext,
                           llm_handler) -> FrameResult:
        """Generate frame using only research interest and question - no content."""

        try:
            # Set up console for progress reporting
            self.console = create_console(f"strategy_{self.strategy_name}", self.websocket_manager, context.user_id)
            if self.websocket_manager:
                self.console.setup_websocket_streaming(context.user_id)

            # Set up user-specific Python logging
            user_logger = setup_user_logger(__name__, context.user_id, self.strategy_name)

            self.console.info(f"Starting {self.strategy_name} strategy - pure analytical approach")
            self.console.info(f"Research Interest: {context.research_interest}")
            self.console.info(f"Research Question: {context.research_question}")

            # Merge default params with provided params
            params = {**self.get_default_params(), **context.strategy_params}

            logger.info(f"Starting direct answer strategy with question: {context.research_question}")

            # Create prompt using only research interest and question
            self.console.info("Creating direct analytical prompt (no content sources)")
            if context.existing_frames:
                self.console.info(f"Including diversity requirements based on {len(context.existing_frames)} existing frames")
            prompt = self._create_direct_answer_prompt(
                context.research_interest,
                context.research_question,
                context.existing_frames
            )

            # Generate frame with LLM
            self.console.info("Generating analytical frame with LLM")

            response = await llm_handler.generate(
                prompt=prompt,
                temperature=0.7
            )

            # Log complete LLM interaction for analysis
            log_llm_interaction(
                user_logger,
                "Direct Analytical Response",
                prompt,
                response.text,
                response.model,
                0.7
            )

            # Parse response
            self.console.info("Parsing LLM response into frame structure")
            frame_content = self._parse_frame_response(response.text, context.research_interest)

            self.console.info(f"Successfully generated direct answer frame: '{frame_content['title']}'")
            logger.info(f"Successfully generated frame using direct answer strategy")

            # Create result - no content used
            return FrameResult(
                title=frame_content['title'],
                perspective=frame_content['perspective'],
                strategy_used=self.strategy_name,
                notes_used=[],  # No notes used in direct answer
                pdfs_used=[],   # No PDFs used in direct answer
                generation_metadata={
                    'approach': 'direct_analytical',
                    'content_sources_used': 0,
                    'strategy_params': params,
                    'research_interest': context.research_interest,
                    'research_question': context.research_question
                }
            )

        except Exception as e:
            if self.console:
                self.console.error(f"Error generating frame with {self.strategy_name}: {e}")
            logger.error(f"Error generating frame with {self.strategy_name}: {e}")
            raise
        finally:
            # Clean up console session
            if self.console:
                self.console.cleanup_websocket_streaming()

    def _create_direct_answer_prompt(self, research_interest: str, research_question: str, existing_frames=None) -> str:
        """Create a prompt for direct analytical frame generation without any content sources."""

        prompt = get_direct_answer_prompt(research_interest, research_question)

        # Add diversity prompt if existing frames are present
        if existing_frames:
            diversity_prompt = self.format_existing_frames_for_prompt(existing_frames)
            prompt += diversity_prompt

        return prompt