"""
PDFs Repository - handles database operations for PDFs
"""
import asyncpg
from typing import List, Optional
from .models import PDF
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class PDFRepository:
    """Repository for managing user PDFs in the database."""
    
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool
    
    async def create_pdf(self, user_id: int, original_filename: str, stored_filename: str,
                        file_path: str, file_size: int, vault_pdf_path: str = None) -> Optional[PDF]:
        """Create a new PDF record."""
        try:
            async with self.pool.acquire() as conn:
                result = await conn.fetchrow('''
                    INSERT INTO pdfs (user_id, original_filename, stored_filename, file_path, file_size, vault_pdf_path)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING *
                ''', user_id, original_filename, stored_filename, file_path, file_size, vault_pdf_path)

                if result:
                    return PDF(
                        id=result['id'],
                        user_id=result['user_id'],
                        original_filename=result['original_filename'],
                        stored_filename=result['stored_filename'],
                        file_path=result['file_path'],
                        file_size=result['file_size'],
                        upload_date=result['upload_date'],
                        extraction_status=result['extraction_status'],
                        vault_pdf_path=result['vault_pdf_path']
                    )
                return None
        except Exception as e:
            logger.error(f"Error creating PDF: {e}")
            return None
    
    async def get_pdf_by_id(self, user_id: int, pdf_id: int) -> Optional[PDF]:
        """Get a PDF by ID."""
        try:
            async with self.pool.acquire() as conn:
                result = await conn.fetchrow('''
                    SELECT * FROM pdfs 
                    WHERE id = $1 AND user_id = $2
                ''', pdf_id, user_id)
                
                if result:
                    return PDF(
                        id=result['id'],
                        user_id=result['user_id'],
                        original_filename=result['original_filename'],
                        stored_filename=result['stored_filename'],
                        file_path=result['file_path'],
                        file_size=result['file_size'],
                        upload_date=result['upload_date'],
                        extraction_status=result['extraction_status'],
                        vault_pdf_path=result['vault_pdf_path']
                    )
                return None
        except Exception as e:
            logger.error(f"Error getting PDF {pdf_id}: {e}")
            return None
    
    async def get_user_pdfs(self, user_id: int, limit: int = 100, offset: int = 0) -> List[PDF]:
        """Get all PDFs for a user."""
        try:
            async with self.pool.acquire() as conn:
                results = await conn.fetch('''
                    SELECT * FROM pdfs 
                    WHERE user_id = $1
                    ORDER BY upload_date DESC
                    LIMIT $2 OFFSET $3
                ''', user_id, limit, offset)
                
                return [PDF(
                    id=row['id'],
                    user_id=row['user_id'],
                    original_filename=row['original_filename'],
                    stored_filename=row['stored_filename'],
                    file_path=row['file_path'],
                    file_size=row['file_size'],
                    upload_date=row['upload_date'],
                    extraction_status=row['extraction_status'],
                    vault_pdf_path=row['vault_pdf_path']
                ) for row in results]
        except Exception as e:
            logger.error(f"Error getting user PDFs: {e}")
            return []
    
    async def get_pdfs_by_ids(self, user_id: int, pdf_ids: List[int]) -> List[PDF]:
        """Get multiple PDFs by their IDs."""
        if not pdf_ids:
            return []
            
        try:
            async with self.pool.acquire() as conn:
                results = await conn.fetch('''
                    SELECT * FROM pdfs 
                    WHERE user_id = $1 AND id = ANY($2)
                    ORDER BY upload_date DESC
                ''', user_id, pdf_ids)
                
                return [PDF(
                    id=row['id'],
                    user_id=row['user_id'],
                    original_filename=row['original_filename'],
                    stored_filename=row['stored_filename'],
                    file_path=row['file_path'],
                    file_size=row['file_size'],
                    upload_date=row['upload_date'],
                    extraction_status=row['extraction_status'],
                    vault_pdf_path=row['vault_pdf_path']
                ) for row in results]
        except Exception as e:
            logger.error(f"Error getting PDFs by IDs: {e}")
            return []
    
    # Note: PDF-Note linking is now managed through notes.linked_pdf_id (one-to-one relationship)
    # No need for separate link/unlink methods in PDFs repository
    
    async def update_extraction_status(self, user_id: int, pdf_id: int, status: str) -> bool:
        """Update PDF extraction status and stats."""
        try:
            async with self.pool.acquire() as conn:
                result = await conn.execute('''
                    UPDATE pdfs 
                    SET extraction_status = $1
                    WHERE id = $2 AND user_id = $3
                ''', status, pdf_id, user_id)
                
                return result == 'UPDATE 1'
        except Exception as e:
            logger.error(f"Error updating PDF {pdf_id} extraction status: {e}")
            return False
    
    async def delete_pdf(self, user_id: int, pdf_id: int) -> Optional[str]:
        """Delete a PDF and return the file path for cleanup."""
        try:
            async with self.pool.acquire() as conn:
                # Get file path before deletion for cleanup
                result = await conn.fetchrow('''
                    SELECT file_path FROM pdfs 
                    WHERE id = $1 AND user_id = $2
                ''', pdf_id, user_id)
                
                if result:
                    file_path = result['file_path']
                    
                    # Delete the PDF record
                    delete_result = await conn.execute('''
                        DELETE FROM pdfs WHERE id = $1 AND user_id = $2
                    ''', pdf_id, user_id)
                    
                    if delete_result == 'DELETE 1':
                        return file_path
                
                return None
        except Exception as e:
            logger.error(f"Error deleting PDF {pdf_id}: {e}")
            return None
    
    async def search_pdfs_by_filename(self, user_id: int, search_query: str, limit: int = 50) -> List[PDF]:
        """Search PDFs by filename."""
        try:
            async with self.pool.acquire() as conn:
                results = await conn.fetch('''
                    SELECT * FROM pdfs 
                    WHERE user_id = $1 AND original_filename ILIKE $2
                    ORDER BY upload_date DESC
                    LIMIT $3
                ''', user_id, f'%{search_query}%', limit)
                
                return [PDF(
                    id=row['id'],
                    user_id=row['user_id'],
                    original_filename=row['original_filename'],
                    stored_filename=row['stored_filename'],
                    file_path=row['file_path'],
                    file_size=row['file_size'],
                    upload_date=row['upload_date'],
                    extraction_status=row['extraction_status'],
                    vault_pdf_path=row['vault_pdf_path']
                ) for row in results]
        except Exception as e:
            logger.error(f"Error searching PDFs: {e}")
            return []
    
    async def get_pdfs_by_status(self, user_id: int, status: str) -> List[PDF]:
        """Get PDFs by extraction status."""
        try:
            async with self.pool.acquire() as conn:
                results = await conn.fetch('''
                    SELECT * FROM pdfs 
                    WHERE user_id = $1 AND extraction_status = $2
                    ORDER BY upload_date DESC
                ''', user_id, status)
                
                return [PDF(
                    id=row['id'],
                    user_id=row['user_id'],
                    original_filename=row['original_filename'],
                    stored_filename=row['stored_filename'],
                    file_path=row['file_path'],
                    file_size=row['file_size'],
                    upload_date=row['upload_date'],
                    extraction_status=row['extraction_status'],
                    vault_pdf_path=row['vault_pdf_path']
                ) for row in results]
        except Exception as e:
            logger.error(f"Error getting PDFs by status: {e}")
            return []
    
    async def get_pdfs_count(self, user_id: int) -> int:
        """Get total count of PDFs for user."""
        try:
            async with self.pool.acquire() as conn:
                result = await conn.fetchval('''
                    SELECT COUNT(*) FROM pdfs WHERE user_id = $1
                ''', user_id)
                return result or 0
        except Exception as e:
            logger.error(f"Error getting PDFs count: {e}")
            return 0
    
    async def get_pdf_by_filename(self, user_id: int, filename: str) -> Optional[PDF]:
        """Get a PDF by original filename."""
        try:
            async with self.pool.acquire() as conn:
                result = await conn.fetchrow('''
                    SELECT * FROM pdfs 
                    WHERE user_id = $1 AND original_filename = $2
                ''', user_id, filename)
                
                if result:
                    return PDF(
                        id=result['id'],
                        user_id=result['user_id'],
                        original_filename=result['original_filename'],
                        stored_filename=result['stored_filename'],
                        file_path=result['file_path'],
                        file_size=result['file_size'],
                        upload_date=result['upload_date'],
                        extraction_status=result['extraction_status'],
                        vault_pdf_path=result['vault_pdf_path']
                    )
                return None
        except Exception as e:
            logger.error(f"Error getting PDF by filename: {e}")
            return None
    
