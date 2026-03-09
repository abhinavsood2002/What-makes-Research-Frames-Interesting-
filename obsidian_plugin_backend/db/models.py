from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel

class User(BaseModel):
    id: int
    username: str
    password_hash: str
    created_at: datetime
    is_active: bool = True

class Note(BaseModel):
    """Note model for Obsidian notes."""
    id: int
    user_id: int
    file_path: str  # Path within Obsidian vault
    content: str    # Full note content
    linked_pdf_id: Optional[int] = None  # ID of linked PDF if any
    created_at: datetime
    updated_at: datetime

class PDF(BaseModel):
    """PDF model for user's PDF files - one-to-one relationship with notes."""
    id: int
    user_id: int
    original_filename: str      # Original filename from user
    stored_filename: str        # Filename in backend storage
    file_path: str             # Path in backend storage
    file_size: int             # Size in bytes
    upload_date: datetime
    extraction_status: str = 'pending'   # 'pending', 'processing', 'completed', 'failed'
    vault_pdf_path: Optional[str] = None  # Original vault path for reconstruction
    # Note: Relationship to notes managed via notes.linked_pdf_id (one-to-one)

class UserContext(BaseModel):
    """User's research context - now uses arrays of IDs instead of JSON."""
    id: int
    user_id: int
    research_interest: str
    selected_note_ids: List[int] = []  # Array of note IDs
    selected_pdf_ids: List[int] = []   # Array of PDF IDs
    updated_at: datetime

class Frame(BaseModel):
    """Frame model for question-focused research perspectives."""
    id: int
    user_id: int
    title: str
    perspective: str  # 150-200 word exploratory perspective
    research_question: str  # The specific question this frame addresses
    created_at: datetime
    generation_time_minutes: float
    is_viewed: bool = False
    notes_used: List[int] = []  # Array of note IDs used in generation
    pdfs_used: List[int] = []   # Array of PDF IDs used in generation
    category: Optional[str] = None  # 'useless', 'interesting'
    strategy_name: Optional[str] = None  # Strategy used to generate this frame

# PDFFulltext model removed - using summaries instead

class PDFSummary(BaseModel):
    """Stores AI-generated summaries from PDFs."""
    id: int
    pdf_id: int
    summary: str  # The generated summary text
    file_path: str  # Path to summary file (for backup storage)
    model_used: str  # LLM model used for generation
    created_at: datetime

class FrameComparison(BaseModel):
    """Stores 1v1 frame comparison results."""
    id: int
    user_id: int
    frame_1_id: int
    frame_2_id: int
    winner_frame_id: int
    session_id: Optional[int] = None
    created_at: datetime

class FrameRankingSession(BaseModel):
    """Stores ranking session metadata."""
    id: int
    user_id: int
    session_uuid: str
    total_frames_ranked: int
    total_comparisons_made: int
    ranking_algorithm_used: str = 'full_pairwise'
    session_metadata: dict = {}
    created_at: datetime

class FrameRanking(BaseModel):
    """Stores final frame ranking positions."""
    id: int
    user_id: int
    session_id: Optional[int] = None
    frame_id: int
    rank_position: int
    wins: int = 0
    created_at: datetime

