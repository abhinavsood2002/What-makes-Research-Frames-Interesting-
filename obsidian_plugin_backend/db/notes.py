"""
Notes Repository - handles database operations for notes
"""
import asyncpg
from typing import List, Optional
from .models import Note
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class NotesRepository:
    """Repository for managing user notes in the database."""
    
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool
    
    async def create_note(self, user_id: int, file_path: str, content: str, 
                         linked_pdf_id: Optional[int] = None) -> Optional[Note]:
        """Create a new note or update existing one."""
        try:
            async with self.pool.acquire() as conn:
                # Use UPSERT to handle duplicate file paths
                result = await conn.fetchrow('''
                    INSERT INTO notes (user_id, file_path, content, linked_pdf_id, updated_at)
                    VALUES ($1, $2, $3, $4, NOW())
                    ON CONFLICT (user_id, file_path) 
                    DO UPDATE SET 
                        content = EXCLUDED.content,
                        linked_pdf_id = EXCLUDED.linked_pdf_id,
                        updated_at = NOW()
                    RETURNING *
                ''', user_id, file_path, content, linked_pdf_id)
                
                if result:
                    return Note(
                        id=result['id'],
                        user_id=result['user_id'],
                        file_path=result['file_path'],
                        content=result['content'],
                        linked_pdf_id=result['linked_pdf_id'],
                        created_at=result['created_at'],
                        updated_at=result['updated_at']
                    )
                return None
        except Exception as e:
            logger.error(f"Error creating note: {e}")
            return None
    
    async def get_note_by_id(self, user_id: int, note_id: int) -> Optional[Note]:
        """Get a note by ID."""
        try:
            async with self.pool.acquire() as conn:
                result = await conn.fetchrow('''
                    SELECT * FROM notes 
                    WHERE id = $1 AND user_id = $2
                ''', note_id, user_id)
                
                if result:
                    return Note(
                        id=result['id'],
                        user_id=result['user_id'],
                        file_path=result['file_path'],
                        content=result['content'],
                        linked_pdf_id=result['linked_pdf_id'],
                        created_at=result['created_at'],
                        updated_at=result['updated_at']
                    )
                return None
        except Exception as e:
            logger.error(f"Error getting note {note_id}: {e}")
            return None
    
    async def get_note_by_path(self, user_id: int, file_path: str) -> Optional[Note]:
        """Get a note by file path."""
        try:
            async with self.pool.acquire() as conn:
                result = await conn.fetchrow('''
                    SELECT * FROM notes 
                    WHERE user_id = $1 AND file_path = $2
                ''', user_id, file_path)
                
                if result:
                    return Note(
                        id=result['id'],
                        user_id=result['user_id'],
                        file_path=result['file_path'],
                        content=result['content'],
                        linked_pdf_id=result['linked_pdf_id'],
                        created_at=result['created_at'],
                        updated_at=result['updated_at']
                    )
                return None
        except Exception as e:
            logger.error(f"Error getting note by path {file_path}: {e}")
            return None
    
    async def get_user_notes(self, user_id: int, limit: int = 100, offset: int = 0) -> List[Note]:
        """Get all notes for a user."""
        try:
            async with self.pool.acquire() as conn:
                results = await conn.fetch('''
                    SELECT * FROM notes 
                    WHERE user_id = $1
                    ORDER BY updated_at DESC
                    LIMIT $2 OFFSET $3
                ''', user_id, limit, offset)
                
                return [Note(
                    id=row['id'],
                    user_id=row['user_id'],
                    file_path=row['file_path'],
                    content=row['content'],
                    linked_pdf_id=row['linked_pdf_id'],
                    created_at=row['created_at'],
                    updated_at=row['updated_at']
                ) for row in results]
        except Exception as e:
            logger.error(f"Error getting user notes: {e}")
            return []
    
    async def get_notes_by_ids(self, user_id: int, note_ids: List[int]) -> List[Note]:
        """Get multiple notes by their IDs."""
        if not note_ids:
            return []
            
        try:
            async with self.pool.acquire() as conn:
                results = await conn.fetch('''
                    SELECT * FROM notes 
                    WHERE user_id = $1 AND id = ANY($2)
                    ORDER BY updated_at DESC
                ''', user_id, note_ids)
                
                return [Note(
                    id=row['id'],
                    user_id=row['user_id'],
                    file_path=row['file_path'],
                    content=row['content'],
                    linked_pdf_id=row['linked_pdf_id'],
                    created_at=row['created_at'],
                    updated_at=row['updated_at']
                ) for row in results]
        except Exception as e:
            logger.error(f"Error getting notes by IDs: {e}")
            return []
    
    async def link_note_to_pdf(self, user_id: int, note_id: int, pdf_id: int) -> bool:
        """Link a note to a PDF."""
        try:
            async with self.pool.acquire() as conn:
                result = await conn.execute('''
                    UPDATE notes 
                    SET linked_pdf_id = $1, updated_at = NOW()
                    WHERE id = $2 AND user_id = $3
                ''', pdf_id, note_id, user_id)
                
                return result == 'UPDATE 1'
        except Exception as e:
            logger.error(f"Error linking note {note_id} to PDF {pdf_id}: {e}")
            return False
    
    async def unlink_note_from_pdf(self, user_id: int, note_id: int) -> bool:
        """Unlink a note from its PDF."""
        try:
            async with self.pool.acquire() as conn:
                result = await conn.execute('''
                    UPDATE notes 
                    SET linked_pdf_id = NULL, updated_at = NOW()
                    WHERE id = $1 AND user_id = $2
                ''', note_id, user_id)
                
                return result == 'UPDATE 1'
        except Exception as e:
            logger.error(f"Error unlinking note {note_id} from PDF: {e}")
            return False
    
    async def delete_note(self, user_id: int, note_id: int) -> bool:
        """Delete a note."""
        try:
            async with self.pool.acquire() as conn:
                result = await conn.execute('''
                    DELETE FROM notes 
                    WHERE id = $1 AND user_id = $2
                ''', note_id, user_id)
                
                return result == 'DELETE 1'
        except Exception as e:
            logger.error(f"Error deleting note {note_id}: {e}")
            return False
    
    async def delete_all_user_notes(self, user_id: int) -> int:
        """Delete all notes for a user and return count of deleted notes."""
        try:
            async with self.pool.acquire() as conn:
                result = await conn.execute('''
                    DELETE FROM notes WHERE user_id = $1
                ''', user_id)
                
                # Extract number from result string like "DELETE 5"
                if result.startswith('DELETE '):
                    return int(result.split(' ')[1])
                return 0
        except Exception as e:
            logger.error(f"Error deleting all notes for user {user_id}: {e}")
            return 0
    
    async def search_notes_content(self, user_id: int, search_query: str, limit: int = 50) -> List[Note]:
        """Search notes by content."""
        try:
            async with self.pool.acquire() as conn:
                # Simple text search - can be improved with full-text search later
                results = await conn.fetch('''
                    SELECT * FROM notes 
                    WHERE user_id = $1 AND (
                        content ILIKE $2 OR 
                        file_path ILIKE $2
                    )
                    ORDER BY updated_at DESC
                    LIMIT $3
                ''', user_id, f'%{search_query}%', limit)
                
                return [Note(
                    id=row['id'],
                    user_id=row['user_id'],
                    file_path=row['file_path'],
                    content=row['content'],
                    linked_pdf_id=row['linked_pdf_id'],
                    created_at=row['created_at'],
                    updated_at=row['updated_at']
                ) for row in results]
        except Exception as e:
            logger.error(f"Error searching notes: {e}")
            return []
    
    async def get_notes_count(self, user_id: int) -> int:
        """Get total count of notes for user."""
        try:
            async with self.pool.acquire() as conn:
                result = await conn.fetchval('''
                    SELECT COUNT(*) FROM notes WHERE user_id = $1
                ''', user_id)
                return result or 0
        except Exception as e:
            logger.error(f"Error getting notes count: {e}")
            return 0