"""
Direct Content Processor - prepares notes and PDFs for frame generation
Prepares notes and PDFs for direct frame generation using AI-generated summaries.
"""
import logging
from typing import List, Dict, Any, Optional, Tuple
from db.models import Note, PDF
from db import get_repos

logger = logging.getLogger(__name__)

class ContentProcessor:
    """Processes and prepares content directly for frame generation using PDF summaries."""

    def __init__(self):
        pass  # No longer need PDF extractor as we use summaries from database
    
    async def prepare_content(self, user_id: int, research_interest: str,
                             selected_notes: List[Note], selected_pdfs: List[PDF]) -> Dict[str, Any]:
        """
        Prepare content for direct frame generation, organizing as linked pairs.
        
        Args:
            user_id: User ID
            research_interest: User's research interest
            selected_notes: List of Note objects
            selected_pdfs: List of PDF objects
        
        Returns:
            Dictionary with prepared content including content_pairs
        """
        try:
            logger.info(f"Preparing content for user {user_id}: {len(selected_notes)} notes, {len(selected_pdfs)} PDFs")

            # Get PDF summaries from database
            pdf_summaries = {}
            if selected_pdfs:
                repos = get_repos()
                pdf_summaries_repo = repos['pdf_summaries_repo']

                pdf_ids = [pdf.id for pdf in selected_pdfs]
                summaries = await pdf_summaries_repo.get_summaries_by_pdf_ids(pdf_ids)

                for pdf in selected_pdfs:
                    if pdf.id in summaries:
                        pdf_summaries[pdf.id] = summaries[pdf.id]
                        logger.info(f"Using summary for PDF {pdf.id}: {len(summaries[pdf.id])} characters")
                    else:
                        logger.warning(f"No summary available for PDF {pdf.id}")
                        pdf_summaries[pdf.id] = f"[No summary available for {pdf.original_filename}]"
            
            # Create content pairs respecting note-PDF links
            content_pairs = self._create_content_pairs(selected_notes, selected_pdfs)
            
            # Simple validation - ensure we have some content
            total_content_available = len(content_pairs) > 0 and (
                any(note for note, _ in content_pairs if note and note.content.strip()) or
                any(pdf_summaries.get(pdf.id, "").strip() for _, pdf in content_pairs if pdf)
            )
            
            if not total_content_available:
                logger.warning("No usable content available for frame generation")
            
            result = {
                'success': True,
                'content_pairs': content_pairs,
                'pdf_summaries': pdf_summaries,
                'total_content_available': total_content_available
            }
            
            logger.info(f"Content preparation complete: {len(content_pairs)} content pairs")
            return result
            
        except Exception as e:
            logger.error(f"Error preparing content for user {user_id}: {e}")
            return {
                'success': False,
                'error': str(e),
                'content_pairs': [],
                'pdf_summaries': {},
                'total_content_available': False
            }
    
    def _create_content_pairs(self, notes: List[Note], pdfs: List[PDF]) -> List[Tuple[Optional[Note], Optional[PDF]]]:
        """
        Create content pairs respecting note-PDF links.
        
        Args:
            notes: List of Note objects
            pdfs: List of PDF objects
            
        Returns:
            List of (Note, PDF) tuples where either can be None
        """
        content_pairs = []
        used_pdf_ids = set()
        used_note_ids = set()
        
        # First pass: create pairs for linked content
        for note in notes:
            if note.linked_pdf_id:
                # Find the linked PDF
                linked_pdf = next((pdf for pdf in pdfs if pdf.id == note.linked_pdf_id), None)
                if linked_pdf:
                    content_pairs.append((note, linked_pdf))
                    used_note_ids.add(note.id)
                    used_pdf_ids.add(linked_pdf.id)
                    logger.debug(f"Created linked pair: note {note.id} <-> PDF {linked_pdf.id}")
                else:
                    # Note references a PDF that's not in selected PDFs - treat as standalone
                    content_pairs.append((note, None))
                    used_note_ids.add(note.id)
            
        # Second pass: add standalone notes
        for note in notes:
            if note.id not in used_note_ids:
                content_pairs.append((note, None))
        
        # Third pass: add standalone PDFs
        for pdf in pdfs:
            if pdf.id not in used_pdf_ids:
                content_pairs.append((None, pdf))
        
        logger.info(f"Created {len(content_pairs)} content pairs from {len(notes)} notes and {len(pdfs)} PDFs")
        return content_pairs
    
    def validate_content(self, content_pairs: List[Tuple[Optional[Note], Optional[PDF]]],
                        pdf_summaries: Dict[int, str]) -> bool:
        """
        Validate that we have sufficient content for frame generation.
        
        Args:
            content_pairs: List of (Note, PDF) pairs
            pdf_summaries: Dictionary of PDF ID to summary text
            
        Returns:
            True if sufficient content is available
        """
        for note, pdf in content_pairs:
            if note and note.content.strip():
                return True
            if pdf and pdf_summaries.get(pdf.id, "").strip():
                return True
        return False
    
    def get_content_summary(self, content_pairs: List[Tuple[Optional[Note], Optional[PDF]]], 
                           pdf_summaries: Dict[int, str]) -> Dict[str, Any]:
        """
        Get summary statistics about the content pairs.
        
        Args:
            content_pairs: List of (Note, PDF) pairs
            pdf_summaries: Dictionary of PDF ID to summary text
            
        Returns:
            Summary statistics
        """
        total_note_chars = 0
        total_pdf_chars = 0
        linked_pairs = 0
        standalone_notes = 0
        standalone_pdfs = 0
        
        for note, pdf in content_pairs:
            if note and pdf:
                linked_pairs += 1
                total_note_chars += len(note.content)
                total_pdf_chars += len(pdf_summaries.get(pdf.id, ""))
            elif note:
                standalone_notes += 1
                total_note_chars += len(note.content)
            elif pdf:
                standalone_pdfs += 1
                total_pdf_chars += len(pdf_summaries.get(pdf.id, ""))
        
        return {
            'content_pairs_count': len(content_pairs),
            'linked_pairs': linked_pairs,
            'standalone_notes': standalone_notes,
            'standalone_pdfs': standalone_pdfs,
            'total_note_characters': total_note_chars,
            'total_pdf_characters': total_pdf_chars,
            'total_characters': total_note_chars + total_pdf_chars,
            'has_sufficient_content': total_note_chars + total_pdf_chars > 0
        }