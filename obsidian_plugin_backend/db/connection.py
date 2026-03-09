import os
import asyncpg
from typing import Optional

class DatabaseConnection:
    """Manages PostgreSQL connection pool and basic database operations."""
    
    def __init__(self):
        self.db_url = os.getenv("DATABASE_URL", "postgresql://localhost/research_frames")
        self.pool: Optional[asyncpg.Pool] = None
    
    async def init_db(self):
        """Initialize database connection pool and create tables."""
        self.pool = await asyncpg.create_pool(self.db_url)
        await self._create_all_tables()
    
    async def _create_all_tables(self):
        """Create all database tables with clean schema."""
        async with self.pool.acquire() as conn:
            # Users table
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(50) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW(),
                    is_active BOOLEAN DEFAULT TRUE
                )
            ''')
            
            # Notes table - stores user's Obsidian notes
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS notes (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    file_path TEXT NOT NULL,
                    content TEXT NOT NULL,
                    linked_pdf_id INTEGER DEFAULT NULL,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(user_id, file_path)
                )
            ''')
            
            # PDFs table - stores user's PDF files
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS pdfs (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    original_filename VARCHAR(255) NOT NULL,
                    stored_filename VARCHAR(255) NOT NULL,
                    file_path TEXT NOT NULL,
                    file_size INTEGER NOT NULL,
                    linked_note_id INTEGER DEFAULT NULL,
                    upload_date TIMESTAMP DEFAULT NOW(),
                    extraction_status VARCHAR(20) DEFAULT 'pending' CHECK (extraction_status IN ('pending', 'processing', 'completed', 'failed')),
                    vault_pdf_path TEXT DEFAULT NULL
                )
            ''')

            # Add vault_pdf_path column if it doesn't exist (for existing databases)
            column_exists = await conn.fetchval('''
                SELECT EXISTS(
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'pdfs' AND column_name = 'vault_pdf_path'
                )
            ''')
            if not column_exists:
                await conn.execute('ALTER TABLE pdfs ADD COLUMN vault_pdf_path TEXT DEFAULT NULL')
            
            # Add foreign key constraints after both tables exist (check if they exist first)
            # Check and add notes->pdfs constraint
            constraint_exists = await conn.fetchval('''
                SELECT EXISTS(
                    SELECT 1 FROM information_schema.table_constraints 
                    WHERE constraint_name = 'fk_notes_linked_pdf' 
                    AND table_name = 'notes'
                )
            ''')
            if not constraint_exists:
                await conn.execute('''
                    ALTER TABLE notes ADD CONSTRAINT fk_notes_linked_pdf 
                    FOREIGN KEY (linked_pdf_id) REFERENCES pdfs(id) ON DELETE SET NULL
                ''')
                
            # Remove linked_note_id column from PDFs table if it exists (one-to-one relationship cleanup)
            column_exists = await conn.fetchval('''
                SELECT EXISTS(
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'pdfs' AND column_name = 'linked_note_id'
                )
            ''')
            if column_exists:
                # Drop constraint first if it exists
                constraint_exists = await conn.fetchval('''
                    SELECT EXISTS(
                        SELECT 1 FROM information_schema.table_constraints 
                        WHERE constraint_name = 'fk_pdfs_linked_note' 
                        AND table_name = 'pdfs'
                    )
                ''')
                if constraint_exists:
                    await conn.execute('ALTER TABLE pdfs DROP CONSTRAINT fk_pdfs_linked_note')
                    
                # Then drop the column
                await conn.execute('ALTER TABLE pdfs DROP COLUMN linked_note_id')

            # Enforce one-to-one relationship: each note links to exactly one unique PDF
            # Add unique constraint on linked_pdf_id to ensure each PDF links to only one note
            constraint_exists = await conn.fetchval('''
                SELECT EXISTS(
                    SELECT 1 FROM information_schema.table_constraints 
                    WHERE constraint_name = 'unique_note_pdf_link' 
                    AND table_name = 'notes'
                )
            ''')
            if not constraint_exists:
                await conn.execute('''
                    ALTER TABLE notes ADD CONSTRAINT unique_note_pdf_link 
                    UNIQUE(linked_pdf_id)
                ''')
            
            # Remove the linked_note_id from PDFs table since we have one-to-one relationship
            # The relationship is managed solely through notes.linked_pdf_id

            # User contexts table - now references notes and PDFs by ID arrays
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS user_contexts (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                    research_interest TEXT NOT NULL,
                    selected_note_ids INTEGER[] DEFAULT '{}',
                    selected_pdf_ids INTEGER[] DEFAULT '{}',
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            ''')
            
            # Frames table
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS frames (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    title VARCHAR(500) NOT NULL,
                    perspective TEXT NOT NULL,
                    research_question TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW(),
                    generation_time_minutes FLOAT DEFAULT 0,
                    is_viewed BOOLEAN DEFAULT FALSE,
                    notes_used INTEGER[] DEFAULT '{}',
                    pdfs_used INTEGER[] DEFAULT '{}',
                    category VARCHAR(20) CHECK (category IN ('useless', 'slightly_interesting', 'interesting')),
                    strategy_name VARCHAR(100)
                )
            ''')

            # Add strategy_name column if it doesn't exist (for existing databases)
            strategy_column_exists = await conn.fetchval('''
                SELECT EXISTS(
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'frames' AND column_name = 'strategy_name'
                )
            ''')
            if not strategy_column_exists:
                await conn.execute('ALTER TABLE frames ADD COLUMN strategy_name VARCHAR(100)')

            # Update category constraint to use only two categories: useless, interesting
            await conn.execute('''
                ALTER TABLE frames DROP CONSTRAINT IF EXISTS frames_category_check
            ''')
            await conn.execute('''
                ALTER TABLE frames ADD CONSTRAINT frames_category_check
                CHECK (category IN ('useless', 'interesting'))
            ''')

            # Frame comparisons table - stores 1v1 comparison results
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS frame_comparisons (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    frame_1_id INTEGER REFERENCES frames(id) ON DELETE CASCADE,
                    frame_2_id INTEGER REFERENCES frames(id) ON DELETE CASCADE,
                    winner_frame_id INTEGER REFERENCES frames(id) ON DELETE CASCADE,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            ''')

            # Frame ranking sessions table - stores ranking session metadata
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS frame_ranking_sessions (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    session_uuid UUID DEFAULT gen_random_uuid(),
                    total_frames_ranked INTEGER NOT NULL,
                    total_comparisons_made INTEGER NOT NULL,
                    ranking_algorithm_used VARCHAR(50) DEFAULT 'swiss_tournament',
                    session_metadata JSONB DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT NOW()
                )
            ''')

            # Frame rankings table - stores final ranking positions with session reference
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS frame_rankings (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    session_id INTEGER REFERENCES frame_ranking_sessions(id) ON DELETE CASCADE,
                    frame_id INTEGER REFERENCES frames(id) ON DELETE CASCADE,
                    rank_position INTEGER NOT NULL,
                    wins INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(session_id, frame_id)
                )
            ''')

            # Add session_id column to existing frame_rankings if it doesn't exist
            session_column_exists = await conn.fetchval('''
                SELECT EXISTS(
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'frame_rankings' AND column_name = 'session_id'
                )
            ''')
            if not session_column_exists:
                await conn.execute('ALTER TABLE frame_rankings ADD COLUMN session_id INTEGER REFERENCES frame_ranking_sessions(id) ON DELETE CASCADE')
                await conn.execute('ALTER TABLE frame_rankings ADD COLUMN wins INTEGER DEFAULT 0')
                # Update unique constraint to include session_id
                await conn.execute('ALTER TABLE frame_rankings DROP CONSTRAINT IF EXISTS frame_rankings_user_id_frame_id_key')
                await conn.execute('ALTER TABLE frame_rankings ADD CONSTRAINT unique_session_frame UNIQUE(session_id, frame_id)')

            # Update frame_comparisons to also track session_id
            comparison_session_column_exists = await conn.fetchval('''
                SELECT EXISTS(
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'frame_comparisons' AND column_name = 'session_id'
                )
            ''')
            if not comparison_session_column_exists:
                await conn.execute('ALTER TABLE frame_comparisons ADD COLUMN session_id INTEGER REFERENCES frame_ranking_sessions(id) ON DELETE CASCADE')
            
            
            # User tokens table
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS user_tokens (
                    token VARCHAR(64) PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    created_at TIMESTAMP DEFAULT NOW(),
                    expires_at TIMESTAMP NOT NULL
                )
            ''')
            
            
            # PDF fulltext table removed - using summaries instead

            # PDF summaries table - stores AI-generated summaries from PDFs
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS pdf_summaries (
                    id SERIAL PRIMARY KEY,
                    pdf_id INTEGER REFERENCES pdfs(id) ON DELETE CASCADE,
                    summary TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    model_used VARCHAR(100) NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            ''')
            
            # Create indexes for optimal performance
            await conn.execute('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)')
            await conn.execute('CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id)')
            await conn.execute('CREATE INDEX IF NOT EXISTS idx_notes_file_path ON notes(file_path)')
            await conn.execute('CREATE INDEX IF NOT EXISTS idx_notes_linked_pdf ON notes(linked_pdf_id)')
            await conn.execute('CREATE INDEX IF NOT EXISTS idx_pdfs_user_id ON pdfs(user_id)')
            # Note: removed idx_pdfs_linked_note - using one-to-one relationship via notes.linked_pdf_id
            await conn.execute('CREATE INDEX IF NOT EXISTS idx_frames_user_id ON frames(user_id)')
            await conn.execute('CREATE INDEX IF NOT EXISTS idx_frames_created_at ON frames(created_at DESC)')
            await conn.execute('CREATE INDEX IF NOT EXISTS idx_frames_category ON frames(category)')
            await conn.execute('CREATE INDEX IF NOT EXISTS idx_frame_comparisons_user_id ON frame_comparisons(user_id)')
            await conn.execute('CREATE INDEX IF NOT EXISTS idx_frame_comparisons_session_id ON frame_comparisons(session_id)')
            await conn.execute('CREATE INDEX IF NOT EXISTS idx_frame_rankings_user_id ON frame_rankings(user_id)')
            await conn.execute('CREATE INDEX IF NOT EXISTS idx_frame_rankings_session_id ON frame_rankings(session_id)')
            await conn.execute('CREATE INDEX IF NOT EXISTS idx_frame_rankings_rank ON frame_rankings(rank_position)')
            await conn.execute('CREATE INDEX IF NOT EXISTS idx_frame_ranking_sessions_user_id ON frame_ranking_sessions(user_id)')
            await conn.execute('CREATE INDEX IF NOT EXISTS idx_frame_ranking_sessions_uuid ON frame_ranking_sessions(session_uuid)')
            await conn.execute('CREATE INDEX IF NOT EXISTS idx_frames_strategy_name ON frames(strategy_name)')
            # PDF fulltext index removed - using summaries instead
            await conn.execute('CREATE INDEX IF NOT EXISTS idx_pdf_summaries_pdf_id ON pdf_summaries(pdf_id)')
    
    async def close(self):
        """Close database connection pool."""
        if self.pool:
            await self.pool.close()