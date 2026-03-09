"""
All Content Strategy for question-focused frame generation.
Takes research interest, question, and all available content pairs to generate comprehensive exploratory frames.
"""
import logging
from typing import List, Dict, Any, Optional, Tuple
from .base_strategy import BaseFrameStrategy, FrameGenerationContext, FrameResult
from .prompts import get_comprehensive_frame_prompt
from modules.console import create_console
from modules.logging_config import setup_user_logger, log_llm_interaction
from db.models import Note, PDF
import random
logger = logging.getLogger(__name__)

class AllObjectsStrategy(BaseFrameStrategy):
    """Strategy that uses research interest, question, and all available content pairs to generate comprehensive exploratory frames."""
    
    def __init__(self, websocket_manager=None):
        super().__init__()
        self.strategy_name = "all_content"
        self.websocket_manager = websocket_manager
        self.console = None
    
    def get_required_params(self) -> List[str]:
        """No required parameters for all content strategy."""
        return []
    
    def get_default_params(self) -> Dict[str, Any]:
        """Default parameters for all objects strategy."""
        return {
            'max_content_items': None,  # No limit - process all content
        }
    
    def set_websocket_manager(self, websocket_manager):
        """Set the WebSocket manager for console output."""
        self.websocket_manager = websocket_manager
    
    async def generate_frame(self, context: FrameGenerationContext, 
                           llm_handler) -> FrameResult:
        """Generate frame using all available notes and PDFs."""
        
        if not self.validate_context(context):
            raise ValueError(f"Invalid context for {self.strategy_name}")
        
        try:
            # Set up console for progress reporting
            self.console = create_console(f"strategy_{self.strategy_name}", self.websocket_manager, context.user_id)
            if self.websocket_manager:
                self.console.setup_websocket_streaming(context.user_id)

            # Set up user-specific Python logging
            user_logger = setup_user_logger(__name__, context.user_id, self.strategy_name)

            self.console.info(f"Starting {self.strategy_name} strategy for question-focused frame generation")
            self.console.info(f"Research Interest: {context.research_interest}")
            self.console.info(f"Research Question: {context.research_question}")

            # Merge default params with provided params
            params = {**self.get_default_params(), **context.strategy_params}

            total_content = len(context.content_pairs)
            self.console.info(f"Processing {total_content} content pairs with question context")
            logger.info(f"Starting all content strategy with {len(context.content_pairs)} content pairs and question: {context.research_question}")

            # Use all content, but limit if specified
            max_items = params['max_content_items']
            selected_content_pairs = self._select_content_pairs(
                context.content_pairs, max_items
            )

            self.console.info(f"Selected {len(selected_content_pairs)} content pairs for frame generation")
            logger.info(f"Using {len(selected_content_pairs)} content pairs for frame generation")

            # Create comprehensive prompt with all content and question
            self.console.info("Creating comprehensive frame prompt with question and all content")
            if context.existing_frames:
                self.console.info(f"Including diversity requirements based on {len(context.existing_frames)} existing frames")
            prompt = self._create_comprehensive_frame_prompt(
                context.research_interest,
                context.research_question,
                selected_content_pairs,
                context.pdf_summaries,
                params,
                context.existing_frames
            )

            # Generate frame with LLM
            self.console.info("Generating frame with LLM using comprehensive prompt")

            response = await llm_handler.generate(
                prompt=prompt,
                temperature=0.7
            )

            # Log complete LLM interaction for analysis
            log_llm_interaction(
                user_logger,
                "Comprehensive Frame Generation",
                prompt,
                response.text,
                response.model,
                0.7
            )

            # Parse response
            self.console.info("Parsing LLM response into frame structure")
            frame_content = self._parse_frame_response(response.text, context.research_interest)

            self.console.info(f"Successfully generated frame: '{frame_content['title']}'")
            logger.info(f"Successfully generated frame using all content strategy")
            
            # Create result
            return FrameResult(
                title=frame_content['title'],
                perspective=frame_content['perspective'],
                strategy_used=self.strategy_name,
                notes_used=[note.id for note, _ in selected_content_pairs if note],
                pdfs_used=[pdf.id for _, pdf in selected_content_pairs if pdf],
                generation_metadata={
                    'content_pairs_used': len(selected_content_pairs),
                    'total_content_pairs_available': len(context.content_pairs),
                    'strategy_params': params,
                    'content_truncated': len(context.content_pairs) > max_items if max_items else False,
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
    
    def _select_content_pairs(self, content_pairs: List[Tuple[Optional[Note], Optional[PDF]]], 
                             max_items: int) -> List[Tuple[Optional[Note], Optional[PDF]]]:
        """Select content pairs, limiting total if specified."""
        if not max_items:
            return content_pairs
        
        if len(content_pairs) <= max_items:
            return content_pairs
        
        # Randomly shuffle and select to maintain diversity
        shuffled_pairs = content_pairs.copy()
        random.shuffle(shuffled_pairs)
        
        return shuffled_pairs[:max_items]
    
    def _create_comprehensive_frame_prompt(self, research_interest: str,
                                         research_question: str,
                                         content_pairs: List[Tuple[Optional[Note], Optional[PDF]]],
                                         pdf_summaries: Dict[int, str],
                                         params: Dict[str, Any],
                                         existing_frames=None) -> str:
        """Create a comprehensive prompt using all content pairs."""
        
        # Build comprehensive context from all content pairs
        sources_text = ""
        source_count = 1
        
        for note, pdf in content_pairs:
            if note and pdf:
                # Linked note-PDF pair
                note_preview = note.content
                pdf_summary = pdf_summaries.get(pdf.id, "")
                pdf_preview = pdf_summary if pdf_summary else "[Summary not available]"
                sources_text += f"\n{source_count}. [LINKED CONTENT]\n"
                sources_text += f"   Note ({note.file_path}): {note_preview}\n"
                sources_text += f"   PDF ({pdf.original_filename}): {pdf_preview}\n"
            elif note:
                # Standalone note
                content_preview = note.content
                sources_text += f"\n{source_count}. [NOTE] {note.file_path}\n"
                sources_text += f"   Content: {content_preview}\n"
            elif pdf:
                # Standalone PDF
                pdf_summary = pdf_summaries.get(pdf.id, "")
                content_preview = pdf_summary if pdf_summary else "[Summary not available]"
                sources_text += f"\n{source_count}. [PDF] {pdf.original_filename}\n"
                sources_text += f"   Content: {content_preview}\n"
            
            source_count += 1
                
        prompt = get_comprehensive_frame_prompt(
            research_interest,
            research_question,
            sources_text,
        )

        # Add diversity prompt if existing frames are present
        if existing_frames:
            diversity_prompt = self.format_existing_frames_for_prompt(existing_frames)
            prompt += diversity_prompt

        return prompt