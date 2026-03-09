"""
Database modules for Research Frames backend.

This package contains modular database implementations:
- connection: Database connection management
- models: Pydantic models and database schemas  
- users: User management operations
- context: User research context operations
- frames: Frame storage and retrieval
- notes: Note management operations
- pdfs: PDF file management
"""

from .connection import DatabaseConnection
from .models import *
from .users import UserRepository
from .context import ContextRepository
from .frames import FrameRepository
from .notes import NotesRepository
from .pdfs import PDFRepository
# PDFFulltextRepository removed - using summaries instead
from .pdf_summaries import PDFSummaryRepository

# Global database instance
db_connection = DatabaseConnection()

# Repository instances - will be initialized after database connection
users_repo = None
context_repo = None
frames_repo = None
notes_repo = None
pdfs_repo = None
# pdf_fulltext_repo removed - using summaries instead
pdf_summaries_repo = None

# Function to initialize all repositories after DB pool is ready
def init_repositories():
    global users_repo, context_repo, frames_repo, notes_repo, pdfs_repo, pdf_summaries_repo
    
    # Check if database pool is available
    if not hasattr(db_connection, 'pool') or db_connection.pool is None:
        raise RuntimeError("Database pool not initialized. Call db_connection.init_db() first.")
    
    # Initialize repositories with consistent constructors
    users_repo = UserRepository(db_connection)
    context_repo = ContextRepository(db_connection.pool)
    frames_repo = FrameRepository(db_connection)
    notes_repo = NotesRepository(db_connection.pool)
    pdfs_repo = PDFRepository(db_connection.pool)
    # pdf_fulltext_repo removed - using summaries instead
    pdf_summaries_repo = PDFSummaryRepository(db_connection)
    
    print(f"✅ Repositories initialized: users_repo={users_repo is not None}, context_repo={context_repo is not None}")
    print(f"   All repos: users={users_repo}, context={context_repo}, frames={frames_repo}")
    print(f"   notes={notes_repo}, pdfs={pdfs_repo}")

def get_repos():
    """Get repository instances with proper error handling and re-initialization if needed."""
    global users_repo, context_repo, frames_repo, notes_repo, pdfs_repo, pdf_summaries_repo
    
    # Check if repositories are initialized
    if users_repo is None or context_repo is None or frames_repo is None:
        print("⚠️ Repositories not initialized, attempting to initialize...")
        init_repositories()
    
    # Verify they're still valid
    if users_repo is None:
        raise RuntimeError("Failed to initialize repositories. Database connection may not be ready.")
    
    return {
        'users_repo': users_repo,
        'context_repo': context_repo,
        'frames_repo': frames_repo,
        'notes_repo': notes_repo,
        'pdfs_repo': pdfs_repo,
        # 'pdf_fulltext_repo': removed - using summaries instead
        'pdf_summaries_repo': pdf_summaries_repo
    }

__all__ = [
    'db_connection',
    'users_repo',
    'context_repo',
    'frames_repo',
    'notes_repo',
    'pdfs_repo',
    # 'pdf_fulltext_repo', - removed
    'pdf_summaries_repo',
    'init_repositories',
    'get_repos',
    # Models
    'User',
    'UserContext',
    'Frame',
    'Note',
    'PDF',
    # 'PDFFulltext', - removed
    'PDFSummary'
]