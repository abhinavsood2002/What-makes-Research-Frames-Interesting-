"""
Context Repository - handles database operations for user contexts
"""
import asyncpg
from typing import Optional, List
from .models import UserContext
import logging

logger = logging.getLogger(__name__)

class ContextRepository:
    """Repository for managing user research contexts."""
    
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool
    
    async def update_user_context(self, user_id: int, research_interest: str, 
                                 selected_note_ids: List[int] = None, 
                                 selected_pdf_ids: List[int] = None) -> bool:
        """Update or create user context with note and PDF IDs."""
        if selected_note_ids is None:
            selected_note_ids = []
        if selected_pdf_ids is None:
            selected_pdf_ids = []
            
        try:
            async with self.pool.acquire() as conn:
                # Use UPSERT to handle existing contexts
                await conn.execute('''
                    INSERT INTO user_contexts (user_id, research_interest, selected_note_ids, selected_pdf_ids, updated_at)
                    VALUES ($1, $2, $3, $4, NOW())
                    ON CONFLICT (user_id) 
                    DO UPDATE SET 
                        research_interest = EXCLUDED.research_interest,
                        selected_note_ids = EXCLUDED.selected_note_ids,
                        selected_pdf_ids = EXCLUDED.selected_pdf_ids,
                        updated_at = NOW()
                ''', user_id, research_interest, selected_note_ids, selected_pdf_ids)
                
                return True
        except Exception as e:
            logger.error(f"Error updating user context: {e}")
            return False
    
    async def get_user_context(self, user_id: int) -> Optional[UserContext]:
        """Get user context."""
        try:
            async with self.pool.acquire() as conn:
                result = await conn.fetchrow('''
                    SELECT id, user_id, research_interest, selected_note_ids, selected_pdf_ids, updated_at
                    FROM user_contexts WHERE user_id = $1
                ''', user_id)
                
                if result:
                    return UserContext(
                        id=result['id'],
                        user_id=result['user_id'],
                        research_interest=result['research_interest'],
                        selected_note_ids=result['selected_note_ids'] or [],
                        selected_pdf_ids=result['selected_pdf_ids'] or [],
                        updated_at=result['updated_at']
                    )
                return None
        except Exception as e:
            logger.error(f"Error getting user context: {e}")
            return None
    
    async def add_note_to_context(self, user_id: int, note_id: int) -> bool:
        """Add a note to user's context selection."""
        try:
            async with self.pool.acquire() as conn:
                # Get current context
                context = await self.get_user_context(user_id)
                if not context:
                    # Create new context with just this note
                    return await self.update_user_context(user_id, "", [note_id], [])
                
                # Add note if not already present
                if note_id not in context.selected_note_ids:
                    new_note_ids = context.selected_note_ids + [note_id]
                    return await self.update_user_context(
                        user_id, 
                        context.research_interest, 
                        new_note_ids, 
                        context.selected_pdf_ids
                    )
                return True
        except Exception as e:
            logger.error(f"Error adding note to context: {e}")
            return False
    
    async def remove_note_from_context(self, user_id: int, note_id: int) -> bool:
        """Remove a note from user's context selection."""
        try:
            context = await self.get_user_context(user_id)
            if context and note_id in context.selected_note_ids:
                new_note_ids = [nid for nid in context.selected_note_ids if nid != note_id]
                return await self.update_user_context(
                    user_id, 
                    context.research_interest, 
                    new_note_ids, 
                    context.selected_pdf_ids
                )
            return True
        except Exception as e:
            logger.error(f"Error removing note from context: {e}")
            return False
    
    async def add_pdf_to_context(self, user_id: int, pdf_id: int) -> bool:
        """Add a PDF to user's context selection."""
        try:
            async with self.pool.acquire() as conn:
                # Get current context
                context = await self.get_user_context(user_id)
                if not context:
                    # Create new context with just this PDF
                    return await self.update_user_context(user_id, "", [], [pdf_id])
                
                # Add PDF if not already present
                if pdf_id not in context.selected_pdf_ids:
                    new_pdf_ids = context.selected_pdf_ids + [pdf_id]
                    return await self.update_user_context(
                        user_id, 
                        context.research_interest, 
                        context.selected_note_ids, 
                        new_pdf_ids
                    )
                return True
        except Exception as e:
            logger.error(f"Error adding PDF to context: {e}")
            return False
    
    async def remove_pdf_from_context(self, user_id: int, pdf_id: int) -> bool:
        """Remove a PDF from user's context selection."""
        try:
            context = await self.get_user_context(user_id)
            if context and pdf_id in context.selected_pdf_ids:
                new_pdf_ids = [pid for pid in context.selected_pdf_ids if pid != pdf_id]
                return await self.update_user_context(
                    user_id, 
                    context.research_interest, 
                    context.selected_note_ids, 
                    new_pdf_ids
                )
            return True
        except Exception as e:
            logger.error(f"Error removing PDF from context: {e}")
            return False
    
    async def clear_user_context(self, user_id: int) -> bool:
        """Clear all selections from user context but keep research interest."""
        try:
            context = await self.get_user_context(user_id)
            if context:
                return await self.update_user_context(
                    user_id, 
                    context.research_interest, 
                    [], 
                    []
                )
            return True
        except Exception as e:
            logger.error(f"Error clearing user context: {e}")
            return False
    
    async def delete_user_context(self, user_id: int) -> bool:
        """Delete user context completely."""
        try:
            async with self.pool.acquire() as conn:
                result = await conn.execute('''
                    DELETE FROM user_contexts WHERE user_id = $1
                ''', user_id)
                
                return result == 'DELETE 1'
        except Exception as e:
            logger.error(f"Error deleting user context: {e}")
            return False