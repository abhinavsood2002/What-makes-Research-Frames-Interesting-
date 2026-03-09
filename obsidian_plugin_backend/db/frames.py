from typing import List, Optional
from .models import Frame

class FrameRepository:
    """Repository for frame storage and retrieval operations."""
    
    def __init__(self, db_connection):
        self.db = db_connection
    
    async def store_frame(self, user_id: int, title: str, perspective: str,
                         research_question: str, generation_time_minutes: float,
                         notes_used: List[int] = None, pdfs_used: List[int] = None,
                         strategy_name: str = None) -> Optional[Frame]:
        """Store a generated frame."""
        if notes_used is None:
            notes_used = []
        if pdfs_used is None:
            pdfs_used = []
            
        async with self.db.pool.acquire() as conn:
            row = await conn.fetchrow('''
                INSERT INTO frames (user_id, title, perspective, research_question, generation_time_minutes, notes_used, pdfs_used, strategy_name)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id, user_id, title, perspective, research_question, created_at, generation_time_minutes, is_viewed, notes_used, pdfs_used, strategy_name
            ''', user_id, title, perspective, research_question, generation_time_minutes, notes_used, pdfs_used, strategy_name)
            
            frame_data = dict(row)
            # Ensure notes_used and pdfs_used are never None
            if frame_data.get('notes_used') is None:
                frame_data['notes_used'] = []
            if frame_data.get('pdfs_used') is None:
                frame_data['pdfs_used'] = []
            return Frame(**frame_data)
    
    async def get_user_frames(self, user_id: int, limit: int = 20, offset: int = 0, strategy_filter: str = None) -> List[Frame]:
        """Get frames for a user with pagination and optional strategy filtering."""
        async with self.db.pool.acquire() as conn:
            if strategy_filter and strategy_filter != 'all':
                rows = await conn.fetch('''
                    SELECT id, user_id, title, perspective, research_question, created_at, generation_time_minutes, is_viewed, notes_used, pdfs_used, category, strategy_name
                    FROM frames
                    WHERE user_id = $1 AND strategy_name = $2
                    ORDER BY created_at DESC
                    LIMIT $3 OFFSET $4
                ''', user_id, strategy_filter, limit, offset)
            else:
                rows = await conn.fetch('''
                    SELECT id, user_id, title, perspective, research_question, created_at, generation_time_minutes, is_viewed, notes_used, pdfs_used, category, strategy_name
                    FROM frames
                    WHERE user_id = $1
                    ORDER BY created_at DESC
                    LIMIT $2 OFFSET $3
                ''', user_id, limit, offset)

            frames = []
            for row in rows:
                frame_data = dict(row)
                # Ensure notes_used and pdfs_used are never None
                if frame_data.get('notes_used') is None:
                    frame_data['notes_used'] = []
                if frame_data.get('pdfs_used') is None:
                    frame_data['pdfs_used'] = []
                frames.append(Frame(**frame_data))
            return frames
    
    async def get_user_frames_count(self, user_id: int, strategy_filter: str = None) -> int:
        """Get total count of all frames for a user with optional strategy filtering."""
        async with self.db.pool.acquire() as conn:
            if strategy_filter and strategy_filter != 'all':
                count = await conn.fetchval('''
                    SELECT COUNT(*) FROM frames WHERE user_id = $1 AND strategy_name = $2
                ''', user_id, strategy_filter)
            else:
                count = await conn.fetchval('''
                    SELECT COUNT(*) FROM frames WHERE user_id = $1
                ''', user_id)
            return count
    
    async def get_new_frames_count(self, user_id: int) -> int:
        """Get count of unviewed frames."""
        async with self.db.pool.acquire() as conn:
            count = await conn.fetchval('''
                SELECT COUNT(*) FROM frames WHERE user_id = $1 AND is_viewed = FALSE
            ''', user_id)
            return count
    
    async def mark_frames_viewed(self, user_id: int, frame_ids: List[int]):
        """Mark frames as viewed."""
        async with self.db.pool.acquire() as conn:
            await conn.execute('''
                UPDATE frames SET is_viewed = TRUE 
                WHERE user_id = $1 AND id = ANY($2)
            ''', user_id, frame_ids)
    
    async def delete_frame(self, user_id: int, frame_id: int) -> bool:
        """Delete a frame by ID for a specific user."""
        async with self.db.pool.acquire() as conn:
            result = await conn.execute('''
                DELETE FROM frames
                WHERE user_id = $1 AND id = $2
            ''', user_id, frame_id)

            # Check if any row was deleted
            return result.split()[-1] == '1'

    async def update_frame_categories(self, user_id: int, frame_categories: dict) -> bool:
        """Update categories for multiple frames."""
        async with self.db.pool.acquire() as conn:
            for frame_id, category in frame_categories.items():
                await conn.execute('''
                    UPDATE frames
                    SET category = $3
                    WHERE user_id = $1 AND id = $2
                ''', user_id, int(frame_id), category)
            return True

    async def get_all_user_frames(self, user_id: int) -> List[Frame]:
        """Get all frames for a user (no pagination) for ranking."""
        async with self.db.pool.acquire() as conn:
            rows = await conn.fetch('''
                SELECT id, user_id, title, perspective, research_question, created_at, generation_time_minutes, is_viewed, notes_used, pdfs_used, category, strategy_name
                FROM frames
                WHERE user_id = $1
                ORDER BY created_at DESC
            ''', user_id)

            frames = []
            for row in rows:
                frame_data = dict(row)
                # Ensure notes_used and pdfs_used are never None
                if frame_data.get('notes_used') is None:
                    frame_data['notes_used'] = []
                if frame_data.get('pdfs_used') is None:
                    frame_data['pdfs_used'] = []
                frames.append(Frame(**frame_data))
            return frames

    async def save_frame_comparisons(self, user_id: int, comparisons: List[dict]) -> bool:
        """Save frame comparison results."""
        async with self.db.pool.acquire() as conn:
            for comparison in comparisons:
                await conn.execute('''
                    INSERT INTO frame_comparisons (user_id, frame_1_id, frame_2_id, winner_frame_id)
                    VALUES ($1, $2, $3, $4)
                ''', user_id, comparison['frame_1_id'], comparison['frame_2_id'], comparison['winner'])
            return True

    async def save_frame_rankings(self, user_id: int, rankings: List[dict]) -> bool:
        """Save final frame rankings."""
        async with self.db.pool.acquire() as conn:
            # First, delete existing rankings for this user
            await conn.execute('''
                DELETE FROM frame_rankings WHERE user_id = $1
            ''', user_id)

            # Then insert new rankings
            for ranking in rankings:
                await conn.execute('''
                    INSERT INTO frame_rankings (user_id, frame_id, rank_position)
                    VALUES ($1, $2, $3)
                ''', user_id, ranking['frame_id'], ranking['rank_position'])
            return True

    async def get_frames_by_strategy_and_question(self, user_id: int, strategy_name: str, research_question: str) -> List[Frame]:
        """Get existing frames for the same strategy and research question to encourage diversity."""
        async with self.db.pool.acquire() as conn:
            rows = await conn.fetch('''
                SELECT id, user_id, title, perspective, research_question, created_at, generation_time_minutes, is_viewed, notes_used, pdfs_used, category, strategy_name
                FROM frames
                WHERE user_id = $1 AND strategy_name = $2 AND research_question = $3
                ORDER BY created_at DESC
            ''', user_id, strategy_name, research_question)

            frames = []
            for row in rows:
                frame_data = dict(row)
                # Ensure notes_used and pdfs_used are never None
                if frame_data.get('notes_used') is None:
                    frame_data['notes_used'] = []
                if frame_data.get('pdfs_used') is None:
                    frame_data['pdfs_used'] = []
                frames.append(Frame(**frame_data))
            return frames

    async def get_past_ranking_results(self, user_id: int) -> dict:
        """Get past ranking results including rankings and comparisons."""
        async with self.db.pool.acquire() as conn:
            # Get rankings with frame details
            rankings_rows = await conn.fetch('''
                SELECT
                    fr.frame_id,
                    fr.rank_position,
                    fr.wins,
                    f.title,
                    f.perspective,
                    f.research_question,
                    f.created_at,
                    f.generation_time_minutes,
                    f.strategy_name,
                    f.category
                FROM frame_rankings fr
                JOIN frames f ON fr.frame_id = f.id
                WHERE fr.user_id = $1
                ORDER BY fr.rank_position ASC
            ''', user_id)

            # Get comparison history
            comparisons_rows = await conn.fetch('''
                SELECT
                    fc.frame_1_id,
                    fc.frame_2_id,
                    fc.winner_frame_id,
                    fc.created_at,
                    f1.title as frame_1_title,
                    f2.title as frame_2_title,
                    fw.title as winner_title
                FROM frame_comparisons fc
                JOIN frames f1 ON fc.frame_1_id = f1.id
                JOIN frames f2 ON fc.frame_2_id = f2.id
                JOIN frames fw ON fc.winner_frame_id = fw.id
                WHERE fc.user_id = $1
                ORDER BY fc.created_at ASC
            ''', user_id)

            # Process rankings
            rankings = []
            for row in rankings_rows:
                ranking_data = dict(row)
                rankings.append({
                    'frame_id': ranking_data['frame_id'],
                    'rank_position': ranking_data['rank_position'],
                    'wins': ranking_data['wins'] or 0,
                    'frame': {
                        'id': ranking_data['frame_id'],
                        'title': ranking_data['title'],
                        'perspective': ranking_data['perspective'],
                        'research_question': ranking_data['research_question'],
                        'created_at': ranking_data['created_at'].isoformat() if ranking_data['created_at'] else None,
                        'generation_time_minutes': ranking_data['generation_time_minutes'],
                        'strategy_name': ranking_data['strategy_name'],
                        'category': ranking_data['category']
                    }
                })

            # Process comparisons
            comparisons = []
            for row in comparisons_rows:
                comparison_data = dict(row)
                comparisons.append({
                    'frame_1_id': comparison_data['frame_1_id'],
                    'frame_2_id': comparison_data['frame_2_id'],
                    'winner_frame_id': comparison_data['winner_frame_id'],
                    'created_at': comparison_data['created_at'].isoformat() if comparison_data['created_at'] else None,
                    'frame_1_title': comparison_data['frame_1_title'],
                    'frame_2_title': comparison_data['frame_2_title'],
                    'winner_title': comparison_data['winner_title']
                })

            return {
                'rankings': rankings,
                'comparisons': comparisons,
                'total_frames': len(rankings),
                'total_comparisons': len(comparisons)
            }