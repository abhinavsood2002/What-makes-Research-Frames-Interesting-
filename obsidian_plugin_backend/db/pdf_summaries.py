from typing import Optional
from .models import PDFSummary
import logging

logger = logging.getLogger(__name__)

class PDFSummaryRepository:
    """Repository for PDF summary storage and retrieval operations."""

    def __init__(self, db_connection):
        self.db = db_connection

    async def create_pdf_summary(self, pdf_id: int, summary: str, file_path: str,
                               model_used: str) -> Optional[PDFSummary]:
        """Store PDF summary and metadata."""
        async with self.db.pool.acquire() as conn:
            row = await conn.fetchrow('''
                INSERT INTO pdf_summaries (pdf_id, summary, file_path, model_used)
                VALUES ($1, $2, $3, $4)
                RETURNING id, pdf_id, summary, file_path, model_used, created_at
            ''', pdf_id, summary, file_path, model_used)

            return PDFSummary(**dict(row))

    async def get_pdf_summary(self, pdf_id: int) -> Optional[PDFSummary]:
        """Get PDF summary by PDF ID."""
        async with self.db.pool.acquire() as conn:
            row = await conn.fetchrow('''
                SELECT id, pdf_id, summary, file_path, model_used, created_at
                FROM pdf_summaries
                WHERE pdf_id = $1
            ''', pdf_id)

            return PDFSummary(**dict(row)) if row else None

    async def update_pdf_summary(self, pdf_id: int, summary: str, file_path: str,
                               model_used: str) -> Optional[PDFSummary]:
        """Update existing PDF summary."""
        async with self.db.pool.acquire() as conn:
            row = await conn.fetchrow('''
                UPDATE pdf_summaries
                SET summary = $2, file_path = $3, model_used = $4
                WHERE pdf_id = $1
                RETURNING id, pdf_id, summary, file_path, model_used, created_at
            ''', pdf_id, summary, file_path, model_used)

            return PDFSummary(**dict(row)) if row else None

    async def delete_pdf_summary(self, pdf_id: int) -> bool:
        """Delete PDF summary by PDF ID."""
        try:
            async with self.db.pool.acquire() as conn:
                result = await conn.execute('''
                    DELETE FROM pdf_summaries WHERE pdf_id = $1
                ''', pdf_id)

                return result == 'DELETE 1'
        except Exception as e:
            logger.error(f"Error deleting PDF summary for PDF {pdf_id}: {e}")
            return False

    async def get_summaries_by_pdf_ids(self, pdf_ids: list) -> dict:
        """Get summaries for multiple PDF IDs, returns dict[pdf_id] = summary_text"""
        if not pdf_ids:
            return {}

        async with self.db.pool.acquire() as conn:
            rows = await conn.fetch('''
                SELECT pdf_id, summary
                FROM pdf_summaries
                WHERE pdf_id = ANY($1)
            ''', pdf_ids)

            return {row['pdf_id']: row['summary'] for row in rows}