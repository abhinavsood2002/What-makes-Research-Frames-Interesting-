"""
Dorst's Frame Creation Strategy - implements a simplified 5-step design thinking process.
Steps: Archaeology, Paradox, Context, Frames, Futures
This is the most sophisticated strategy using multiple LLM calls building on each other.
"""
import logging
from typing import List, Dict, Any, Optional, Tuple
from .base_strategy import BaseFrameStrategy, FrameGenerationContext, FrameResult
from .prompts import get_archaeology_prompt, get_paradox_prompt, get_context_prompt, get_frames_prompt
from modules.console import create_console
from modules.logging_config import setup_user_logger, log_llm_interaction
from db.models import Note, PDF

logger = logging.getLogger(__name__)

class DorstsFrameStrategy(BaseFrameStrategy):
    """Strategy implementing Dorst's frame creation process for complex design thinking."""

    def __init__(self, websocket_manager=None):
        super().__init__()
        self.strategy_name = "dorsts_frame"
        self.websocket_manager = websocket_manager
        self.console = None

    def get_required_params(self) -> List[str]:
        """No required parameters for Dorst's frame strategy."""
        return []

    def get_default_params(self) -> Dict[str, Any]:
        """Default parameters for Dorst's frame strategy."""
        return {
            'max_content_items': None,  # No limit - process all content
        }

    def set_websocket_manager(self, websocket_manager):
        """Set the WebSocket manager for console output."""
        self.websocket_manager = websocket_manager

    async def generate_frame(self, context: FrameGenerationContext,
                           llm_handler) -> FrameResult:
        """Generate frame using Dorst's 5-step frame creation process."""

        try:
            # Set up console for progress reporting
            self.console = create_console(f"strategy_{self.strategy_name}", self.websocket_manager, context.user_id)
            if self.websocket_manager:
                self.console.setup_websocket_streaming(context.user_id)

            # Set up user-specific Python logging
            user_logger = setup_user_logger(__name__, context.user_id, self.strategy_name)

            self.console.info(f"Starting {self.strategy_name} strategy - Dorst's 5-step frame creation process")
            self.console.info(f"Research Interest: {context.research_interest}")
            self.console.info(f"Research Question: {context.research_question}")

            # Merge default params with provided params
            params = {**self.get_default_params(), **context.strategy_params}

            logger.info(f"Starting Dorst's frame strategy with question: {context.research_question}")

            # Select content if available
            max_items = params['max_content_items']
            selected_content_pairs = self._select_content_pairs(context.content_pairs, max_items)

            self.console.info(f"Using {len(selected_content_pairs)} content pairs for Dorst's process")

            # Step 1: Archaeology - Understanding previous attempts and problem definition
            self.console.info("STEP 1: Archaeology - Understanding problem context and previous approaches")
            archaeology_result = await self._step_archaeology(
                context.research_interest,
                context.research_question,
                selected_content_pairs,
                context.pdf_summaries,
                llm_handler,
                user_logger
            )

            # Step 2: Paradox - Identify what makes the problem difficult
            self.console.info("STEP 2: Paradox - Identifying tensions and difficulties")
            paradox_result = await self._step_paradox(
                context.research_interest,
                context.research_question,
                archaeology_result,
                selected_content_pairs,
                context.pdf_summaries,
                llm_handler,
                user_logger
            )

            # Step 3: Context - Understanding stakeholders and practices
            self.console.info("STEP 3: Context - Understanding stakeholders and existing practices")
            context_result = await self._step_context(
                context.research_interest,
                context.research_question,
                archaeology_result,
                paradox_result,
                selected_content_pairs,
                context.pdf_summaries,
                llm_handler,
                user_logger
            )

            # Step 4: Frames - Final creative leap to new frame
            self.console.info("STEP 4: Frames - Final creative reframing of the problem")
            if context.existing_frames:
                self.console.info(f"Including diversity requirements based on {len(context.existing_frames)} existing frames")
            final_frame = await self._step_frames(
                context.research_interest,
                context.research_question,
                archaeology_result,
                paradox_result,
                context_result,
                selected_content_pairs,
                context.pdf_summaries,
                llm_handler,
                user_logger,
                context.existing_frames
            )

            self.console.info(f"Successfully completed Dorst's 4-step frame creation process: '{final_frame['title']}'")
            logger.info(f"Successfully generated frame using Dorst's frame strategy")

            # Create result
            return FrameResult(
                title=final_frame['title'],
                perspective=final_frame['perspective'],
                strategy_used=self.strategy_name,
                notes_used=[note.id for note, _ in selected_content_pairs if note],
                pdfs_used=[pdf.id for _, pdf in selected_content_pairs if pdf],
                generation_metadata={
                    'dorst_steps_completed': 4,
                    'content_pairs_used': len(selected_content_pairs),
                    'strategy_params': params,
                    'research_interest': context.research_interest,
                    'research_question': context.research_question,
                    'archaeology_insight': archaeology_result,
                    'paradox_identified': paradox_result,
                    'context_understanding': context_result
                }
            )

        except Exception as e:
            if self.console:
                self.console.error(f"Error in Dorst's frame creation process: {e}")
            logger.error(f"Error generating frame with {self.strategy_name}: {e}")
            raise
        finally:
            # Clean up console session
            if self.console:
                self.console.cleanup_websocket_streaming()

    def _select_content_pairs(self, content_pairs: List[Tuple[Optional[Note], Optional[PDF]]],
                             max_items: int) -> List[Tuple[Optional[Note], Optional[PDF]]]:
        """Select content pairs, limiting total if specified."""
        if not max_items or len(content_pairs) <= max_items:
            return content_pairs

        # Take first max_items to maintain consistency across steps
        return content_pairs[:max_items]

    def _build_sources_context(self, content_pairs: List[Tuple[Optional[Note], Optional[PDF]]],
                              pdf_summaries: Dict[int, str]) -> str:
        """Build sources context for prompts."""
        if not content_pairs:
            return "No specific source materials provided."

        sources_text = ""
        source_count = 1

        for note, pdf in content_pairs:
            if note and pdf:
                note_preview = note.content
                pdf_summary = pdf_summaries.get(pdf.id, "")
                pdf_preview = pdf_summary if pdf_summary else "[Summary not available]"
                sources_text += f"\n{source_count}. [LINKED CONTENT]\n"
                sources_text += f"   Note ({note.file_path}): {note_preview}\n"
                sources_text += f"   PDF ({pdf.original_filename}): {pdf_preview}\n"
            elif note:
                content_preview = note.content
                sources_text += f"\n{source_count}. [NOTE] {note.file_path}\n"
                sources_text += f"   Content: {content_preview}\n"
            elif pdf:
                pdf_summary = pdf_summaries.get(pdf.id, "")
                content_preview = pdf_summary if pdf_summary else "[Summary not available]"
                sources_text += f"\n{source_count}. [PDF] {pdf.original_filename}\n"
                sources_text += f"   Content: {content_preview}\n"

            source_count += 1

        return sources_text

    async def _step_archaeology(self, research_interest: str, research_question: str,
                               content_pairs: List[Tuple[Optional[Note], Optional[PDF]]],
                               pdf_summaries: Dict[int, str], llm_handler, user_logger) -> str:
        """Step 1: Archaeology - Understand previous attempts and problem definition."""

        sources_text = self._build_sources_context(content_pairs, pdf_summaries)

        prompt = get_archaeology_prompt(research_interest, research_question, sources_text)

        response = await llm_handler.generate(
            prompt=prompt,
            temperature=0.7,
        )

        # Log complete LLM interaction for analysis
        log_llm_interaction(
            user_logger,
            "Step 1 - Archaeology Analysis",
            prompt,
            response.text,
            response.model,
            0.7
        )

        return response.text.strip()

    async def _step_paradox(self, research_interest: str, research_question: str,
                           archaeology_result: str,
                           content_pairs: List[Tuple[Optional[Note], Optional[PDF]]],
                           pdf_summaries: Dict[int, str], llm_handler, user_logger) -> str:
        """Step 2: Paradox - Identify what makes the problem hard to solve."""

        sources_text = self._build_sources_context(content_pairs, pdf_summaries)

        prompt = get_paradox_prompt(research_interest, research_question, archaeology_result, sources_text)

        response = await llm_handler.generate(
            prompt=prompt,
            temperature=0.7,
        )

        # Log complete LLM interaction for analysis
        log_llm_interaction(
            user_logger,
            "Step 2 - Paradox Identification",
            prompt,
            response.text,
            response.model,
            0.7
        )

        return response.text.strip()

    async def _step_context(self, research_interest: str, research_question: str,
                           archaeology_result: str, paradox_result: str,
                           content_pairs: List[Tuple[Optional[Note], Optional[PDF]]],
                           pdf_summaries: Dict[int, str], llm_handler, user_logger) -> str:
        """Step 3: Context - Understand stakeholders and practices involved."""

        sources_text = self._build_sources_context(content_pairs, pdf_summaries)

        prompt = get_context_prompt(research_interest, research_question, archaeology_result, paradox_result, sources_text)

        response = await llm_handler.generate(
            prompt=prompt,
            temperature=0.7,
        )

        # Log complete LLM interaction for analysis
        log_llm_interaction(
            user_logger,
            "Step 3 - Context Understanding",
            prompt,
            response.text,
            response.model,
            0.7
        )

        return response.text.strip()

    async def _step_frames(self, research_interest: str, research_question: str,
                          archaeology_result: str, paradox_result: str, context_result: str,
                          content_pairs: List[Tuple[Optional[Note], Optional[PDF]]],
                          pdf_summaries: Dict[int, str], llm_handler, user_logger, existing_frames=None) -> Dict[str, str]:
        """Step 4: Frames - Final creative leap to new way of framing the problem."""

        sources_text = self._build_sources_context(content_pairs, pdf_summaries)

        prompt = get_frames_prompt(research_interest, research_question, archaeology_result, paradox_result, context_result, sources_text)

        # Add diversity prompt if existing frames are present
        if existing_frames:
            diversity_prompt = self.format_existing_frames_for_prompt(existing_frames)
            prompt += diversity_prompt

        response = await llm_handler.generate(
            prompt=prompt,
            temperature=0.7,
        )

        # Log complete LLM interaction for analysis
        log_llm_interaction(
            user_logger,
            "Step 4 - Final Frame Creation",
            prompt,
            response.text,
            response.model,
            0.7
        )

        # Parse the response into title and perspective
        return self._parse_frame_response(response.text, research_interest)

