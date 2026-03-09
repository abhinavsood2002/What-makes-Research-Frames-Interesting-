"""
Base strategy class for frame generation.
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel
from db.models import Note, PDF
import logging

logger = logging.getLogger(__name__)

class FrameGenerationContext(BaseModel):
    """Context for frame generation containing all necessary data."""
    user_id: int
    research_interest: str
    research_question: str  # The specific question to address in this frame
    content_pairs: List[Tuple[Optional[Note], Optional[PDF]]] = []  # (Note, PDF) pairs where either can be None
    pdf_summaries: Dict[int, str] = {}  # PDF ID -> AI-generated summary
    strategy_params: Dict[str, Any] = {}
    existing_frames: List[Any] = []  # List of existing frames for same strategy/question to encourage diversity

class FrameResult(BaseModel):
    """Result of frame generation."""
    title: str
    perspective: str
    strategy_used: str
    notes_used: List[int] = []  # IDs of notes used
    pdfs_used: List[int] = []   # IDs of PDFs used
    generation_metadata: Dict[str, Any] = {}

class BaseFrameStrategy(ABC):
    """Base class for all frame generation strategies."""

    def __init__(self):
        self.strategy_name = self.__class__.__name__

    @abstractmethod
    async def generate_frame(self, context: FrameGenerationContext,
                           llm_handler) -> FrameResult:
        """
        Generate a research frame using this strategy.

        Args:
            context: Frame generation context with content pairs and parameters
            llm_handler: LLM handler for generating content

        Returns:
            FrameResult with generated frame content
        """
        pass

    def format_existing_frames_for_prompt(self, existing_frames: List[Any]) -> str:
        """
        Format existing frames into a prompt section to encourage diversity.

        Args:
            existing_frames: List of existing Frame objects for same strategy/question

        Returns:
            Formatted string for inclusion in LLM prompt
        """
        if not existing_frames:
            return ""

        diversity_section = "\n**Previous Frames**\n"
        diversity_section += f"There are {len(existing_frames)} existing frame(s) that have already addressed this same research question using this strategy."
        diversity_section += "To provide value, you MUST take a different approach, angle, or perspective than these previous attempts:\n\n"

        for i, frame in enumerate(existing_frames, 1):
            diversity_section += f"Previous Frame {i}:\n"
            diversity_section += f"Title: {frame.title}\n"
            diversity_section += f"Approach: {frame.perspective}\n\n"


        return diversity_section
    
    @abstractmethod
    def get_required_params(self) -> List[str]:
        """Return list of required parameter names for this strategy."""
        pass
    
    def get_default_params(self) -> Dict[str, Any]:
        """Return default parameters for this strategy."""
        return {}
    
    def validate_context(self, context: FrameGenerationContext) -> bool:
        """Validate that the context has sufficient data for this strategy."""
        if not context.content_pairs:
            logger.warning(f"No content pairs available for {self.strategy_name}")
            return False
        
        # Check required parameters
        required_params = self.get_required_params()
        for param in required_params:
            if param not in context.strategy_params:
                logger.warning(f"Missing required parameter '{param}' for {self.strategy_name}")
                return False
        
        return True
    
    def _create_frame_prompt(self, research_interest: str,
                           selected_content_pairs: List[Tuple[Optional[Note], Optional[PDF]]],
                           pdf_summaries: Dict[int, str],
                           strategy_context: str = "") -> str:
        """Create a prompt for frame generation."""
        
        # Build context from content pairs
        sources_text = ""
        source_count = 1
        
        for note, pdf in selected_content_pairs:
            if note and pdf:
                # Linked note-PDF pair
                note_preview = note.content
                pdf_summary = pdf_summaries.get(pdf.id, "")
                pdf_preview = pdf_summary if pdf_summary else "[Summary not available]"
                sources_text += f"\n{source_count}. Linked Content:\n"
                sources_text += f"   Note ({note.file_path}): {note_preview}\n"
                sources_text += f"   PDF ({pdf.original_filename}): {pdf_preview}\n"
            elif note:
                # Standalone note
                content_preview = note.content
                sources_text += f"\n{source_count}. Note ({note.file_path}): {content_preview}\n"
            elif pdf:
                # Standalone PDF
                pdf_summary = pdf_summaries.get(pdf.id, "")
                content_preview = pdf_summary if pdf_summary else "[Summary not available]"
                sources_text += f"\n{source_count}. PDF ({pdf.original_filename}): {content_preview}\n"
            
            source_count += 1
        
        prompt = f""""""

        return prompt
    
    def _parse_frame_response(self, response: str, research_interest: str) -> Dict[str, str]:
        """Parse LLM response to extract title and perspective."""
        import re
        
        try:
            # Extract title - try same line first, fallback to next single line only
            title_match = re.search(r'TITLE:\s*(.+?)(?=\n|$)', response, re.DOTALL)
            title = title_match.group(1).strip() if title_match else None

            # If title is empty/whitespace or just markdown artifacts (e.g., "**" from "**TITLE:**"),
            # try next single line only
            if not title or re.match(r'^\*+$', title):
                # Handle both "TITLE:\n" and "**TITLE:**\n" formats
                title_match = re.search(r'TITLE:\*{0,2}\s*\n\s*([^\n]+)', response)
                title = title_match.group(1).strip() if title_match else None

            if not title:
                title = "Empty Title"

            # Extract perspective
            perspective_match = re.search(r'PERSPECTIVE:\s*(.+)', response, re.DOTALL)
            perspective = perspective_match.group(1).strip() if perspective_match else ""
            
            # Clean up title - collapse whitespace for single line
            title = re.sub(r'\s+', ' ', title)
            # No title length restriction - allow full titles

            # Clean up perspective - preserve markdown formatting
            perspective = perspective.strip()
            
            # Fallback for perspective - but raise error instead of creating useless content
            if not perspective or len(perspective) < 100:
                raise ValueError(f"LLM response lacks sufficient perspective content. Response was: {response}")
            
            # No perspective length restriction - allow full content
            
            return {
                'title': title,
                'perspective': perspective
            }
            
        except Exception as e:
            logger.error(f"Error parsing frame response: {e}")
            raise ValueError(f"Failed to parse LLM response into valid frame format: {e}. Response was: {response}")