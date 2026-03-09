"""
PDF Summary Extraction using LLM with context from user notes
"""
import os
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import EasyOcrOptions, PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption

from typing import Optional, Dict, Any, List
import logging
from handlers.llm_handler import LLMHandler, ModelType
from db.models import Note

logger = logging.getLogger(__name__)

class PDFSummaryExtractor:
    """Extracts context-aware summaries from PDFs using LLM"""

    def __init__(self, llm_handler: LLMHandler = None, storage_base_path: str = "pdf_summaries"):
        self.llm_handler = llm_handler or LLMHandler()
        self.storage_base_path = storage_base_path
        # Ensure base directory exists
        os.makedirs(storage_base_path, exist_ok=True)


    async def extract_and_store_summary(self, user_id: int, pdf_id: int,
                                      pdf_file_path: str, linked_note: Note = None,
                                      research_interest: str = None) -> Dict[str, Any]:
        """
        Extract context-aware summary from PDF and store in file system

        Args:
            user_id: User ID for directory organization
            pdf_id: PDF ID for filename
            pdf_file_path: Path to the PDF file
            linked_note: The specific note linked to this PDF for context
            research_interest: User's research interest for context

        Returns:
            Dict with extraction results
        """
        try:
            # Create user directory
            user_dir = os.path.join(self.storage_base_path, str(user_id))
            os.makedirs(user_dir, exist_ok=True)

            # Output file path
            output_file = os.path.join(user_dir, f"{pdf_id}_summary.txt")
            print(pdf_file_path)
            # Extract text from PDF first
            pdf_text_result = await self._extract_text_from_pdf(pdf_file_path)

            if not pdf_text_result["extracted_text"]:
                logger.warning(f"No text extracted from PDF {pdf_id}")
                return {
                    "pdf_id": pdf_id,
                    "user_id": user_id,
                    "file_path": None,
                    "summary": "",
                    "extraction_errors": ["No text could be extracted from PDF"]
                }

            # Generate context-aware summary using LLM
            summary_result = await self._generate_context_aware_summary(
                pdf_text_result["extracted_text"],
                linked_note,
                research_interest or "",
                pdf_file_path
            )

            # Store summary to file
            try:
                with open(output_file, 'w', encoding='utf-8') as f:
                    f.write(summary_result["summary"])

                logger.info(f"Stored summary for PDF {pdf_id} at {output_file}")

                return {
                    "pdf_id": pdf_id,
                    "user_id": user_id,
                    "file_path": output_file,
                    "summary": summary_result["summary"],
                    "extraction_errors": pdf_text_result.get("extraction_errors", [])
                }

            except Exception as e:
                logger.error(f"Error storing summary file: {e}")
                return {
                    "pdf_id": pdf_id,
                    "user_id": user_id,
                    "file_path": None,
                    "summary": summary_result["summary"],  # Return summary even if file storage fails
                    "extraction_errors": [f"Failed to store summary file: {str(e)}"]
                }

        except Exception as e:
            logger.error(f"Error in PDF summary extraction: {e}")
            return {
                "pdf_id": pdf_id,
                "user_id": user_id,
                "file_path": None,
                "summary": "",
                "extraction_errors": [f"Summary extraction failed: {str(e)}"]
            }

    async def _extract_text_from_pdf(self, pdf_path: str) -> Dict[str, Any]:
        """Extract text from PDF using Docling"""
        try:
            pipeline_options = PdfPipelineOptions(artifacts_path="/home/Anonymized/.cache/docling/models")
            converter = DocumentConverter(
                format_options={
                    InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
                }
            )            
            result = converter.convert(pdf_path)
            markdown_text = result.document.export_to_markdown()

            # Page processing is no longer tracked

            return {
                "extracted_text": markdown_text.strip(),
                "extraction_errors": []
            }

        except Exception as e:
            logger.error(f"Error processing PDF {pdf_path} with Docling: {e}")
            return {
                "extracted_text": "",
                "extraction_errors": [f"Failed to process PDF with Docling: {str(e)}"]
            }

    async def _generate_context_aware_summary(self, pdf_text: str, linked_note: Note,
                                            research_interest: str, pdf_filename: str) -> Dict[str, Any]:
        """Generate context-aware summary using LLM with linked note context"""
        try:
            # Prepare context from the linked note only
            note_context = ""
            if linked_note:
                note_content = linked_note.content
                note_context = f"Linked Note: {linked_note.file_path}\n{note_content}"

            # Create context-aware prompt
            prompt = self._create_summary_prompt(pdf_text, note_context, research_interest, pdf_filename)

            # Generate summary using LLM
            response = await self.llm_handler.generate(
                prompt=prompt,
                temperature=0.3  # Lower temperature for more focused summaries
            )

            return {
                "summary": response.text.strip(),
                "model": response.model
            }

        except Exception as e:
            error_msg = f"Error generating LLM summary for PDF: {e}"
            logger.error(error_msg)
            print(f"🚨 {error_msg}")
            # Return empty summary instead of error message
            return {
                "summary": "",
                "model": "error"
            }

    def _create_summary_prompt(self, pdf_text: str, note_context: str,
                             research_interest: str, pdf_filename: str) -> str:
        """Create a context-aware prompt for PDF summarization"""

        # Use full PDF text without truncation
        # Note: Large PDFs will use full content for better context

        prompt = f"""You are tasked with creating a comprehensive, context-aware summary of the given academic paper. I am a researcher and
my interests in the academic paper are documented through my personal notes. These notes are given below. My general research interest is also
provided. Follow the given instructions.

**Instructions:**
1. Create a comprehensive summary that captures the main ideas, findings, and contributions
2. Pay special attention to content that relates to my research interest and questions I have asked or observations I have made in the notes (if provided)
3. Keep the summary between 800-1000 words
4. If the document contains data, methods, findings, or conclusions highly relevant to my research interests in any way shape or form, make sure to document 
these in the summary 
**Research Interest:**
{research_interest}

**Notes:**
{note_context if note_context else "No linked note available - this PDF stands alone"}

**Document to Summarize:**
Filename: {pdf_filename}

{pdf_text}


**Summary:**"""

        return prompt

    
    def get_summary_path(self, user_id: int, pdf_id: int) -> str:
        """Get the file path for a PDF summary"""
        return os.path.join(self.storage_base_path, str(user_id), f"{pdf_id}_summary.txt")

    def load_summary(self, user_id: int, pdf_id: int) -> Optional[str]:
        """Load summary from file system"""
        summary_path = self.get_summary_path(user_id, pdf_id)

        # Check if file exists first
        if not os.path.exists(summary_path):
            return None  # File doesn't exist - normal case

        try:
            with open(summary_path, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception as e:
            error_msg = f"Error reading summary file for PDF {pdf_id}: {e}"
            logger.error(error_msg)
            print(f"🚨 {error_msg}")
            return None  # Read error - return None but log clearly

    def delete_summary(self, user_id: int, pdf_id: int) -> bool:
        """Delete summary file"""
        summary_path = self.get_summary_path(user_id, pdf_id)

        if not os.path.exists(summary_path):
            return True  # Already deleted or never existed

        try:
            os.remove(summary_path)
            return True
        except Exception as e:
            error_msg = f"Error deleting summary file for PDF {pdf_id}: {e}"
            logger.error(error_msg)
            print(f"🚨 {error_msg}")
            return False