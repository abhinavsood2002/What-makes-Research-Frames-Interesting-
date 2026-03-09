"""
Privacy Data Cleanup Service
Handles removal of privacy-sensitive user data while preserving research insights.
"""
import logging
import shutil
from pathlib import Path
from typing import Dict, Any
from db.notes import NotesRepository
from db.pdfs import PDFRepository
from db.pdf_summaries import PDFSummaryRepository
from modules.pdf_summary_extractor import PDFSummaryExtractor
from modules.pdf_manager import PDFManager

logger = logging.getLogger(__name__)

class PrivacyCleanupService:
    """
    Service for cleaning up privacy-sensitive user data.

    Removes:
    - User notes (raw content)
    - User PDFs (files and metadata)
    - PDF summaries (AI-generated summaries)

    Preserves:
    - Frames (generated content)
    - User context (will be updated)
    """
    
    def __init__(self, notes_repo: NotesRepository, pdfs_repo: PDFRepository,
                 pdf_summaries_repo: PDFSummaryRepository, pdf_manager: PDFManager,
                 pdf_summary_extractor: PDFSummaryExtractor):
        self.notes_repo = notes_repo
        self.pdfs_repo = pdfs_repo
        self.pdf_summaries_repo = pdf_summaries_repo
        self.pdf_manager = pdf_manager
        self.pdf_summary_extractor = pdf_summary_extractor
    
    async def cleanup_user_privacy_data(self, user_id: int) -> Dict[str, Any]:
        """
        Clean up all privacy-sensitive data for a user.
        
        Args:
            user_id: The user ID to clean up data for
            
        Returns:
            Dict with cleanup results and statistics
        """
        results = {
            "user_id": user_id,
            "notes_deleted": 0,
            "pdfs_deleted": 0,
            "pdf_summaries_deleted": 0,
            "files_removed": 0,
            "directories_cleaned": 0,
            "errors": []
        }
        
        logger.info(f"Starting privacy data cleanup for user {user_id}")
        
        try:
            # Phase 1: Get data counts before cleanup
            user_notes = await self.notes_repo.get_user_notes(user_id)
            user_pdfs = await self.pdfs_repo.get_user_pdfs(user_id)
            
            logger.info(f"Found {len(user_notes)} notes and {len(user_pdfs)} PDFs for user {user_id}")
            
            # Phase 2: Clean PDF summaries (depends on PDFs)
            summary_results = await self._cleanup_pdf_summaries(user_id, user_pdfs)
            results.update(summary_results)
            
            # Phase 3: Clean PDFs (files and database)
            pdf_results = await self._cleanup_pdfs(user_id, user_pdfs)
            results.update(pdf_results)
            
            # Phase 4: Clean notes (database only)
            notes_results = await self._cleanup_notes(user_id, user_notes)
            results.update(notes_results)
            
            # Phase 5: Clean empty directories
            dir_results = await self._cleanup_empty_directories(user_id)
            results.update(dir_results)
            
            logger.info(f"Privacy cleanup completed for user {user_id}: "
                       f"{results['notes_deleted']} notes, {results['pdfs_deleted']} PDFs, "
                       f"{results['pdf_summaries_deleted']} summaries removed")
                       
        except Exception as e:
            error_msg = f"Error during privacy cleanup for user {user_id}: {str(e)}"
            logger.error(error_msg)
            results["errors"].append(error_msg)
        
        return results
    
    async def _cleanup_pdf_summaries(self, user_id: int, user_pdfs) -> Dict[str, int]:
        """Clean up PDF summary data (database + files)"""
        results = {"pdf_summaries_deleted": 0, "files_removed": 0}
        
        try:
            for pdf in user_pdfs:
                # Delete database record
                deleted = await self.pdf_summaries_repo.delete_pdf_summary(pdf.id)
                if deleted:
                    results["pdf_summaries_deleted"] += 1
                
                # Delete file system file
                file_deleted = self.pdf_summary_extractor.delete_summary(user_id, pdf.id)
                if file_deleted:
                    results["files_removed"] += 1
            
            logger.info(f"Cleaned {results['pdf_summaries_deleted']} PDF summaries for user {user_id}")
            
        except Exception as e:
            logger.error(f"Error cleaning PDF summaries for user {user_id}: {e}")
            raise
        
        return results
    
    async def _cleanup_pdfs(self, user_id: int, user_pdfs) -> Dict[str, int]:
        """Clean up PDF data (database + files)"""
        results = {"pdfs_deleted": 0, "files_removed": 0}
        
        try:
            for pdf in user_pdfs:
                # Delete physical file
                try:
                    file_path = Path(pdf.file_path)
                    if file_path.exists():
                        file_path.unlink()
                        results["files_removed"] += 1
                        logger.debug(f"Deleted PDF file: {pdf.file_path}")
                except Exception as e:
                    logger.warning(f"Could not delete PDF file {pdf.file_path}: {e}")
                
                # Delete database record
                deleted = await self.pdfs_repo.delete_pdf(user_id, pdf.id)
                if deleted:
                    results["pdfs_deleted"] += 1
            
            logger.info(f"Cleaned {results['pdfs_deleted']} PDFs for user {user_id}")
            
        except Exception as e:
            logger.error(f"Error cleaning PDFs for user {user_id}: {e}")
            raise
        
        return results
    
    async def _cleanup_notes(self, user_id: int, user_notes) -> Dict[str, int]:
        """Clean up notes data (database only)"""
        results = {"notes_deleted": 0}
        
        try:
            # Delete all user notes
            deleted_count = await self.notes_repo.delete_all_user_notes(user_id)
            results["notes_deleted"] = deleted_count
            
            logger.info(f"Cleaned {results['notes_deleted']} notes for user {user_id}")
            
        except Exception as e:
            logger.error(f"Error cleaning notes for user {user_id}: {e}")
            raise
        
        return results
    
    async def _cleanup_empty_directories(self, user_id: int) -> Dict[str, int]:
        """Clean up empty user directories"""
        results = {"directories_cleaned": 0}
        
        try:
            # Clean PDF storage directory
            pdf_user_dir = Path("pdf_storage") / "users" / str(user_id)
            if pdf_user_dir.exists() and not any(pdf_user_dir.iterdir()):
                shutil.rmtree(pdf_user_dir)
                results["directories_cleaned"] += 1
                logger.debug(f"Removed empty PDF directory: {pdf_user_dir}")
            
            # Clean PDF summaries directory  
            summary_user_dir = Path("pdf_summaries") / str(user_id)
            if summary_user_dir.exists() and not any(summary_user_dir.iterdir()):
                shutil.rmtree(summary_user_dir)
                results["directories_cleaned"] += 1
                logger.debug(f"Removed empty summary directory: {summary_user_dir}")
            
        except Exception as e:
            logger.warning(f"Error cleaning directories for user {user_id}: {e}")
            # Don't raise - directory cleanup is non-critical
        
        return results