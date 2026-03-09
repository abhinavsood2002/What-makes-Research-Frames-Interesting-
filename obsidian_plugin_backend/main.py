import os
import secrets
import asyncio
import json
import re
import logging
from typing import Dict, List, Any, Optional
from fastapi import Depends, FastAPI, HTTPException, Security, status, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from contextlib import asynccontextmanager

# Load environment variables with override enabled
load_dotenv(override=True)

from db import db_connection, users_repo, context_repo, frames_repo, notes_repo, pdfs_repo, init_repositories, User, Frame, Note, PDF
from modules.strategic_background_worker import StrategicBackgroundWorker
from modules.frame_queue import frame_queue
from modules.pdf_manager import pdf_manager
from modules.batch_manager import BatchManager
# PDFFulltextExtractor removed - using summaries instead
from strategies import AVAILABLE_STRATEGIES

logger = logging.getLogger(__name__)

# Import the canonical get_repos function from db module
from db import get_repos

# Pydantic models for API
class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    username: str
    user_id: int
    is_new_user: bool
    session_token: str

class UpdateContextRequest(BaseModel):
    research_interest: str
    selected_note_ids: List[int] = []       # Array of note IDs
    selected_pdf_ids: List[int] = []        # Array of PDF IDs

class UserSettingsRequest(BaseModel):
    frame_generation_frequency: int

class FrameResponse(BaseModel):
    id: int
    title: str
    perspective: str  # 150-200 word exploratory perspective
    research_question: str  # The question this frame addresses
    created_at: str
    generation_time_minutes: float
    is_viewed: bool
    category: Optional[str] = None
    strategy_name: Optional[str] = None

class FrameListResponse(BaseModel):
    frames: List[FrameResponse]
    total_count: int
    new_frames_count: int

# New API models for notes and PDFs system
class NoteResponse(BaseModel):
    id: int
    file_path: str
    content: str  # May be truncated for list views
    linked_pdf_id: Optional[int] = None
    created_at: str
    updated_at: str

class NoteListResponse(BaseModel):
    notes: List[NoteResponse]
    total_count: int

class CreateNoteRequest(BaseModel):
    file_path: str
    content: str

class UpdateNoteRequest(BaseModel):
    content: str
    linked_pdf_id: Optional[int] = None

class PDFResponse(BaseModel):
    id: int
    original_filename: str
    file_size: int
    upload_date: str
    extraction_status: str
    vault_pdf_path: Optional[str] = None  # Original vault path for reconstruction

class PDFListResponse(BaseModel):
    pdfs: List[PDFResponse]
    total_count: int
    
class UploadPDFRequest(BaseModel):
    original_filename: str

class LinkPDFToNoteRequest(BaseModel):
    note_id: int
    pdf_id: int

class VaultPDFUploadRequest(BaseModel):
    vault_pdf_path: str  # Path to PDF in Obsidian vault (for reference)
    pdf_content: str     # Base64 encoded PDF content
    linked_note_id: Optional[int] = None  # ID of note to link this PDF to

# PDFFulltextRequest removed - using summaries instead

class GenerateFrameRequest(BaseModel):
    strategy: str = "direct_answer"  # Strategy to use for frame generation

# Ranking API models
class FrameCategorizationRequest(BaseModel):
    frame_categories: Dict[int, str]  # frame_id -> category mapping

class FrameRankingRequest(BaseModel):
    comparisons: List[Dict[str, int]]  # List of {"winner": frame_id, "loser": frame_id}

class RankingPairingsResponse(BaseModel):
    pairings: List[List[int]]  # List of [frame_id_1, frame_id_2] pairs
    total_comparisons: int



# Utility functions
async def detect_and_link_pdfs_from_note_content(user_id: int, note_content: str) -> Optional[int]:
    """
    Scan note content for [[filename.pdf]] links and return the ID of the first matching PDF.
    
    Args:
        user_id: User ID to search PDFs for
        note_content: Content of the note to scan
        
    Returns:
        PDF ID if a matching PDF is found, None otherwise
    """
    try:
        # Pattern to match [[filename.pdf]] or [[path/filename.pdf]]
        pdf_link_pattern = r'\[\[([^]]*\.pdf)\]\]'
        matches = re.findall(pdf_link_pattern, note_content, re.IGNORECASE)
        
        if not matches:
            return None
            
        # Get user's PDFs
        repos = get_repos()
        pdfs_repo = repos['pdfs_repo']
        user_pdfs = await pdfs_repo.get_user_pdfs(user_id)
        
        if not user_pdfs:
            return None
        
        # Try to match the first PDF link found
        for pdf_filename in matches:
            # Remove path if present, keep just filename
            just_filename = pdf_filename.split('/')[-1]
            
            # Find matching PDF
            for pdf in user_pdfs:
                if (pdf.original_filename.lower() == just_filename.lower() or 
                    pdf.original_filename.lower() == pdf_filename.lower()):
                    return pdf.id
        
        return None
        
    except Exception as e:
        logger.error(f"Error detecting PDF links in note content: {e}")
        return None

# Background worker instance
background_worker = None

# Batch manager instance
batch_manager = None

# WebSocket manager for real-time notifications
class WebSocketManager:
    def __init__(self):
        self.active_connections: Dict[int, WebSocket] = {}  # user_id -> websocket
    
    def disconnect(self, user_id: int):
        """Remove user connection"""
        if user_id in self.active_connections:
            del self.active_connections[user_id]
    
    async def send_personal_message(self, message: dict, user_id: int):
        if user_id in self.active_connections:
            try:
                await self.active_connections[user_id].send_text(json.dumps(message))
            except Exception as e:
                print(f"Error sending message to user {user_id}: {e}")
                # Remove disconnected connection
                self.disconnect(user_id)
    
    async def notify_queue_update(self, user_id: int, event_type: str, data: dict = None):
        """Notify user about queue status changes"""
        message = {
            "type": "queue_update",
            "event": event_type,  # "added", "processing", "completed", "failed"
            "data": data or {}
        }
        await self.send_personal_message(message, user_id)
    
    async def send_progress_message(self, user_id: int, step: str, message: str, metadata: dict = None):
        """Send progress update to user for console display"""
        progress_message = {
            "type": "progress",
            "step": step,  # e.g., "pdf_extraction", "llm_generation", "strategy_execution"
            "message": message,
            "timestamp": asyncio.get_event_loop().time(),
            "metadata": metadata or {}
        }
        await self.send_personal_message(progress_message, user_id)

websocket_manager = WebSocketManager()

# Simple WebSocket console streaming - no complex queue needed

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan manager for FastAPI app"""
    # Startup
    await db_connection.init_db()
    
    # Initialize repositories now that database pool is ready
    init_repositories()
    print("✅ Database and repositories initialized")
    
    # Load queue from persistent storage
    frame_queue.load_from_pickle()
    print(f"Loaded queue: {len(frame_queue.pending_tasks)} pending, {len(frame_queue.processing_tasks)} processing")
    
    # Connect WebSocket manager to frame queue for notifications
    frame_queue.set_notification_callback(websocket_manager.notify_queue_update)
    
    # Initialize batch manager
    global batch_manager
    batch_manager = BatchManager(frame_queue)
    print("✅ Batch manager initialized")

    # Start background worker
    global background_worker
    print(f"🚀 main.py: Creating StrategicBackgroundWorker with websocket_manager: {websocket_manager}")
    background_worker = StrategicBackgroundWorker(db_connection, websocket_manager)
    print(f"🚀 main.py: StrategicBackgroundWorker created: {background_worker}")
    asyncio.create_task(background_worker.run())
    
    yield
    
    # Shutdown
    if background_worker:
        background_worker.stop()
    
    # Save queue to persistent storage
    frame_queue.save_to_pickle()
    print("Queue state saved to disk")
    
    await db_connection.close()

# Initialize FastAPI app with lifespan
app = FastAPI(
    title="Research Frames Backend - Async Edition",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*", "app://obsidian.md"],  # Explicitly allow Obsidian origin
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

# Security
security = HTTPBearer()

# Simple in-memory session storage for prototyping
active_sessions: Dict[str, int] = {}  # session_id -> user_id

def generate_session_id() -> str:
    """Generate a simple session ID"""
    return secrets.token_hex(16)

async def get_authenticated_user(
    credentials: HTTPAuthorizationCredentials = Security(security)
) -> User:
    """Authenticate the current user via session token."""
    session_id = credentials.credentials
    user_id = active_sessions.get(session_id)
    
    if not user_id:
        print(f"❌ API auth failed - session {session_id[:8]}... not found")
        print(f"🔑 Available sessions: {[f'{s[:8]}...' for s in active_sessions.keys()]}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Get repositories using helper function
    repos = get_repos()
    users_repo = repos['users_repo']
    
    user = await users_repo.get_user_by_id(user_id)
    if not user:
        # Clean up invalid session
        print(f"🗑️ Removing session {session_id[:8]}... - user {user_id} not found in database")
        active_sessions.pop(session_id, None)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return user

# ============================================================================
# PUBLIC ENDPOINTS
# ============================================================================

@app.post("/signup", response_model=LoginResponse)
async def signup(request: LoginRequest):
    """Create a new user account."""
    
    print(f"🆕 SIGNUP REQUEST: username={request.username}")
    
    repos = get_repos()
    users_repo = repos['users_repo']
    
    # Try to create new user
    user = await users_repo.create_user(request.username, request.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already exists",
        )
    
    # Generate session for new user
    session_id = generate_session_id()
    active_sessions[session_id] = user.id
    
    print(f"🆕 New user created: {user.username} (ID: {user.id})")
    print(f"🔑 Signup successful - Generated session_id: {session_id[:8]}... for user {user.id}")
    
    return LoginResponse(
        username=user.username,
        user_id=user.id,
        is_new_user=True,
        session_token=session_id
    )

@app.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """Authenticate existing user."""
    
    print(f"🔑 LOGIN REQUEST: username={request.username}")
    
    repos = get_repos()
    users_repo = repos['users_repo']
    
    # Authenticate user
    user = await users_repo.authenticate_user(request.username, request.password)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    
    # Clean up any existing sessions for this user (prevent multiple sessions)
    sessions_to_remove = [sid for sid, uid in active_sessions.items() if uid == user.id]
    for old_session in sessions_to_remove:
        print(f"🗑️ Removing old session {old_session[:8]}... for user {user.id}")
        active_sessions.pop(old_session, None)
    
    # Generate session ID
    session_id = generate_session_id()
    active_sessions[session_id] = user.id
    
    print(f"🔑 Login successful - Generated session_id: {session_id[:8]}... for user {user.id}")
    print(f"📊 Total active sessions: {len(active_sessions)}")
    print(f"📊 All active sessions: {[f'{s[:8]}...' for s in active_sessions.keys()]}")
    
    return LoginResponse(
        username=user.username,
        user_id=user.id,
        is_new_user=False,
        session_token=session_id
    )

@app.get("/health")
async def health_check():
    """Check if the service is healthy."""
    try:
        # Check model server
        import requests
        vllm_url = os.getenv("VLLM_API_URL", "http://localhost:8001")
        model_response = requests.get(f"{vllm_url.replace('/v1/completions', '')}/health", timeout=5)
        model_healthy = model_response.status_code == 200
        
        # Check database
        db_healthy = db_connection.pool is not None
        
        return {
            "status": "healthy", 
            "model_server": "connected" if model_healthy else "disconnected",
            "database": "connected" if db_healthy else "disconnected",
            "features": "async_frame_generation",
            "model_path": os.getenv("MODEL_PATH", "meta-llama/Llama-3.3-70B-Instruct"),
            "background_worker": "running" if background_worker and background_worker.is_running else "stopped"
        }
    except Exception as e:
        return {
            "status": "unhealthy", 
            "error": str(e)
        }

# ============================================================================
# AUTHENTICATED ENDPOINTS
# ============================================================================

@app.post("/update-context")
async def update_user_context(
    request: UpdateContextRequest,
    user: User = Depends(get_authenticated_user)
):
    """Update user research context with note and PDF IDs"""
    try:
        repos = get_repos()
        context_repo = repos['context_repo']
        notes_repo = repos['notes_repo']
        
        # Get linked PDF IDs from selected notes
        linked_pdf_ids = []
        if request.selected_note_ids:
            selected_notes = await notes_repo.get_notes_by_ids(user.id, request.selected_note_ids)
            linked_pdf_ids = [note.linked_pdf_id for note in selected_notes if note.linked_pdf_id]
        
        # Combine explicitly selected PDFs with linked PDFs
        all_pdf_ids = list(set(request.selected_pdf_ids + linked_pdf_ids))
        
        # Update user context in database
        success = await context_repo.update_user_context(
            user.id, 
            request.research_interest, 
            request.selected_note_ids,
            all_pdf_ids
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update context"
            )
        
        return {
            "message": f"Context updated: {len(request.selected_note_ids)} notes, {len(all_pdf_ids)} PDFs (including linked)",
            "status": "Context saved - use Generate button to create frames",
            "note_count": len(request.selected_note_ids),
            "pdf_count": len(all_pdf_ids),
            "linked_pdf_count": len(linked_pdf_ids)
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating context: {str(e)}"
        )

@app.post("/cleanup-privacy-data")
async def cleanup_user_privacy_data(
    user: User = Depends(get_authenticated_user)
):
    """Clean up privacy-sensitive user data (notes, PDFs, summaries)"""
    try:
        repos = get_repos()
        from modules.privacy_cleanup import PrivacyCleanupService
        from modules.pdf_manager import PDFManager
        # PDFFulltextExtractor removed - using summaries instead
        
        # Initialize services
        pdf_manager = PDFManager()
        # pdf_fulltext_extractor removed - using summaries instead
        
        # Create cleanup service
        from modules.pdf_summary_extractor import PDFSummaryExtractor
        pdf_summary_extractor = PDFSummaryExtractor()

        cleanup_service = PrivacyCleanupService(
            notes_repo=repos['notes_repo'],
            pdfs_repo=repos['pdfs_repo'],
            pdf_summaries_repo=repos['pdf_summaries_repo'],
            pdf_manager=pdf_manager,
            pdf_summary_extractor=pdf_summary_extractor
        )
        
        # Perform cleanup
        results = await cleanup_service.cleanup_user_privacy_data(user.id)
        
        return {
            "message": f"Privacy data cleaned: {results['notes_deleted']} notes, {results['pdfs_deleted']} PDFs, {results['pdf_summaries_deleted']} summaries removed",
            "cleanup_results": results
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error during privacy cleanup: {str(e)}"
        )


class FrameGenerationRequest(BaseModel):
    strategy: str = "all_content"
    research_question: str

class ExperimentBatchRequest(BaseModel):
    questions: List[str]  # List of research questions
    repetitions_per_strategy: int = 1  # Number of times to generate each strategy per question
    strategies: List[str] = None  # List of strategies to use (default: all available)

@app.post("/generate-frame")
async def trigger_frame_generation(
    request: FrameGenerationRequest,
    user: User = Depends(get_authenticated_user)
):
    """Trigger frame generation using direct content processing"""
    try:
        repos = get_repos()
        context_repo = repos['context_repo']
        
        # Check if user has context
        context = await context_repo.get_user_context(user.id)
        if not context:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Please set up your research context first"
            )
        
        # Validate strategy
        if request.strategy not in AVAILABLE_STRATEGIES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid strategy. Available: {list(AVAILABLE_STRATEGIES.keys())}"
            )

        # Validate research question
        if not request.research_question or len(request.research_question.strip()) < 5:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Research question must be at least 5 characters long"
            )

        # Add task to queue with research question
        task_id = frame_queue.add_task(user.id, request.strategy, request.research_question)
        
        return {
            "message": f"Frame generation started with {request.strategy} strategy",
            "task_id": task_id,
            "strategy": request.strategy,
            "research_question": request.research_question
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error triggering frame generation: {str(e)}"
        )

@app.post("/generate-experiment-batch")
async def trigger_experiment_batch_generation(
    request: ExperimentBatchRequest,
    user: User = Depends(get_authenticated_user)
):
    """Trigger batch frame generation for experiment setup (m questions × n repetitions × strategies)"""
    try:
        repos = get_repos()
        context_repo = repos['context_repo']

        # Check if user has context
        context = await context_repo.get_user_context(user.id)
        if not context:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Please set up your research context first"
            )

        # Validate inputs
        if not request.questions or len(request.questions) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one research question is required"
            )

        if request.repetitions_per_strategy < 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Repetitions per strategy must be at least 1"
            )

        # Use provided strategies or default to all available
        strategies = request.strategies if request.strategies else list(AVAILABLE_STRATEGIES.keys())

        # Validate strategies
        invalid_strategies = [s for s in strategies if s not in AVAILABLE_STRATEGIES]
        if invalid_strategies:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid strategies: {invalid_strategies}. Available: {list(AVAILABLE_STRATEGIES.keys())}"
            )

        # Use batch manager for sequential processing to ensure proper diversity
        task_ids = await batch_manager.create_experiment_batch(
            user.id, request.questions, strategies, request.repetitions_per_strategy
        )
        total_tasks = len(task_ids)

        return {
            "message": f"Experiment batch generation started",
            "total_tasks": total_tasks,
            "task_ids": task_ids,
            "questions": request.questions,
            "strategies": strategies,
            "repetitions_per_strategy": request.repetitions_per_strategy,
            "breakdown": {
                "questions_count": len(request.questions),
                "strategies_count": len(strategies),
                "repetitions_per_strategy": request.repetitions_per_strategy
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error triggering experiment batch generation: {str(e)}"
        )

@app.get("/frames", response_model=FrameListResponse)
async def get_user_frames(
    limit: int = 20,
    offset: int = 0,
    strategy_filter: str = None,
    user: User = Depends(get_authenticated_user)
):
    """Get user's generated frames with optional strategy filtering"""
    try:
        repos = get_repos()
        frames_repo = repos['frames_repo']

        frames = await frames_repo.get_user_frames(user.id, limit, offset, strategy_filter)
        new_frames_count = await frames_repo.get_new_frames_count(user.id)

        frame_responses = []
        for frame in frames:
            frame_responses.append(FrameResponse(
                id=frame.id,
                title=frame.title,
                perspective=frame.perspective,
                research_question=frame.research_question,
                created_at=frame.created_at.isoformat(),
                generation_time_minutes=frame.generation_time_minutes,
                is_viewed=frame.is_viewed,
                category=frame.category,
                strategy_name=frame.strategy_name,
            ))

        # Get total count of all user's frames (filtered if specified)
        total_count = await frames_repo.get_user_frames_count(user.id, strategy_filter)
        
        return FrameListResponse(
            frames=frame_responses,
            total_count=total_count,
            new_frames_count=new_frames_count
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching frames: {str(e)}"
        )

@app.post("/frames/mark-viewed")
async def mark_frames_viewed(
    frame_ids: List[int],
    user: User = Depends(get_authenticated_user)
):
    """Mark frames as viewed"""
    try:
        repos = get_repos()
        frames_repo = repos['frames_repo']
        
        await frames_repo.mark_frames_viewed(user.id, frame_ids)
        return {"message": f"Marked {len(frame_ids)} frames as viewed"}
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error marking frames as viewed: {str(e)}"
        )

@app.delete("/frames/{frame_id}")
async def delete_frame(
    frame_id: int,
    user: User = Depends(get_authenticated_user)
):
    """Delete a specific frame"""
    try:
        repos = get_repos()
        frames_repo = repos['frames_repo']
        
        deleted = await frames_repo.delete_frame(user.id, frame_id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Frame not found or not owned by user"
            )
        
        return {"message": f"Frame {frame_id} deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting frame: {str(e)}"
        )

@app.get("/frames/all", response_model=FrameListResponse)
async def get_all_user_frames(user: User = Depends(get_authenticated_user)):
    """Get all user's frames for ranking (no pagination)"""
    try:
        repos = get_repos()
        frames_repo = repos['frames_repo']

        # Get all frames using the existing method
        frames = await frames_repo.get_all_user_frames(user.id)
        new_frames_count = await frames_repo.get_new_frames_count(user.id)

        frame_responses = []
        for frame in frames:
            frame_responses.append(FrameResponse(
                id=frame.id,
                title=frame.title,
                perspective=frame.perspective,
                research_question=frame.research_question,
                created_at=frame.created_at.isoformat(),
                generation_time_minutes=frame.generation_time_minutes,
                is_viewed=frame.is_viewed,
                category=frame.category,
            ))

        return FrameListResponse(
            frames=frame_responses,
            total_count=len(frame_responses),
            new_frames_count=new_frames_count
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching all frames: {str(e)}"
        )


# Frame Ranking Endpoints

@app.post("/frames/categorize")
async def categorize_frames(
    request: FrameCategorizationRequest,
    user: User = Depends(get_authenticated_user)
):
    """Save frame categories for ranking."""
    try:
        repos = get_repos()
        frames_repo = repos['frames_repo']

        # Update frame categories
        success = await frames_repo.update_frame_categories(user.id, request.frame_categories)

        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update frame categories"
            )

        return {"message": f"Successfully categorized {len(request.frame_categories)} frames"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error categorizing frames: {str(e)}"
        )


@app.get("/frames/ranking/pairings")
async def get_ranking_pairings(user: User = Depends(get_authenticated_user)):
    """Get all pairwise combinations for ranking exactly 9 frames."""
    try:
        repos = get_repos()
        frames_repo = repos['frames_repo']

        # Get all user frames to determine which are eligible for ranking
        all_frames = await frames_repo.get_all_user_frames(user.id)

        # Convert frames to dict format for ranking logic
        frames_dict = []
        categories = {}
        for frame in all_frames:
            frames_dict.append({
                'id': frame.id,
                'title': frame.title,
                'category': frame.category
            })
            if frame.category:
                categories[frame.id] = frame.category

        # Import and use ranking logic
        from modules.simple_ranking import get_frames_for_ranking, PairwiseRankingSystem

        # Get exactly 9 frames for pairwise ranking
        top_frame_ids = get_frames_for_ranking(frames_dict, categories)

        if len(top_frame_ids) != 9:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Need exactly 9 frames categorized as 'interesting' for pairwise ranking."
            )

        # Generate all pairwise combinations
        ranking_system = PairwiseRankingSystem(top_frame_ids)
        pairings = ranking_system.generate_all_pairings()

        return RankingPairingsResponse(
            pairings=[[pair[0], pair[1]] for pair in pairings],
            total_comparisons=len(pairings)
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating ranking pairings: {str(e)}"
        )


@app.post("/frames/rank")
async def finalize_frame_rankings(
    request: FrameRankingRequest,
    user: User = Depends(get_authenticated_user)
):
    """Process comparison results and save final rankings."""
    try:
        repos = get_repos()
        frames_repo = repos['frames_repo']

        # Get all user frames to work with
        all_frames = await frames_repo.get_all_user_frames(user.id)
        frames_dict = []
        categories = {}
        for frame in all_frames:
            frames_dict.append({
                'id': frame.id,
                'title': frame.title,
                'category': frame.category
            })
            if frame.category:
                categories[frame.id] = frame.category

        from modules.simple_ranking import get_frames_for_ranking, PairwiseRankingSystem

        # Get the same 9 frames that were used for ranking
        top_frame_ids = get_frames_for_ranking(frames_dict, categories)

        # Create ranking system and process comparisons
        ranking_system = PairwiseRankingSystem(top_frame_ids)

        # Process all comparison results
        comparisons_for_db = []
        for comparison in request.comparisons:
            winner_id = comparison['winner']
            loser_id = comparison['loser']

            # Record result in ranking system
            ranking_system.record_comparison_result(winner_id, loser_id)

            # Prepare for database storage - store the actual pairing
            # Use consistent ordering: lower ID as frame_1, higher as frame_2
            frame_1_id = min(winner_id, loser_id)
            frame_2_id = max(winner_id, loser_id)

            comparisons_for_db.append({
                'frame_1_id': frame_1_id,
                'frame_2_id': frame_2_id,
                'winner': winner_id
            })

        # Calculate final rankings
        final_rankings = ranking_system.calculate_final_rankings()

        # Save comparisons to database
        await frames_repo.save_frame_comparisons(user.id, comparisons_for_db)

        # Save rankings to database
        await frames_repo.save_frame_rankings(user.id, final_rankings)

        return {
            "message": f"Successfully processed {len(request.comparisons)} comparisons and saved rankings for {len(final_rankings)} frames",
            "rankings": final_rankings
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing frame rankings: {str(e)}"
        )


@app.get("/frames/past-rankings")
async def get_past_ranking_results(user: User = Depends(get_authenticated_user)):
    """Get past ranking results for the user."""
    try:
        repos = get_repos()
        frames_repo = repos['frames_repo']

        results = await frames_repo.get_past_ranking_results(user.id)

        if not results['rankings']:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No past rankings found for this user"
            )

        return {
            "rankings": results['rankings'],
            "comparisons": results['comparisons'],
            "total_frames": results['total_frames'],
            "total_comparisons": results['total_comparisons'],
            "message": f"Found {results['total_frames']} ranked frames with {results['total_comparisons']} comparisons"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching past ranking results: {str(e)}"
        )


@app.post("/logout")
async def logout_user(user: User = Depends(get_authenticated_user)):
    """Logout user and clean up session"""
    try:
        # Find and remove user's session
        sessions_to_remove = []
        for session_id, user_id in active_sessions.items():
            if user_id == user.id:
                sessions_to_remove.append(session_id)
        
        for session_id in sessions_to_remove:
            print(f"🚪 Logging out - Removing session {session_id[:8]}... for user {user.id}")
            active_sessions.pop(session_id, None)
        
        print(f"📊 Sessions after logout: {len(active_sessions)} total")
        return {"message": "Logged out successfully"}
        
    except Exception as e:
        print(f"❌ Error during logout: {str(e)}")
        return {"message": "Logout completed"}

@app.get("/user-context")
async def get_user_context(
    user: User = Depends(get_authenticated_user)
):
    """Get user's current research context"""
    try:
        repos = get_repos()
        context_repo = repos['context_repo']
        
        context = await context_repo.get_user_context(user.id)
        if not context:
            return {
                "research_interest": "",
                "selected_note_ids": [],
                "selected_pdf_ids": [],
                "updated_at": None
            }
        
        return {
            "research_interest": context.research_interest,
            "selected_note_ids": context.selected_note_ids,
            "selected_pdf_ids": context.selected_pdf_ids,
            "updated_at": context.updated_at.isoformat()
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching user context: {str(e)}"
        )

@app.get("/generation-status")
async def get_generation_status(
    user: User = Depends(get_authenticated_user)
):
    """Get status of frame generation for user"""
    try:
        repos = get_repos()
        frames_repo = repos['frames_repo']
        
        new_frames_count = await frames_repo.get_new_frames_count(user.id)
        queue_status = frame_queue.get_user_queue_status(user.id)
        
        return {
            "new_frames_available": new_frames_count,
            "background_worker_status": "running" if background_worker and background_worker.is_running else "stopped",
            "queue_status": queue_status
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error getting generation status: {str(e)}"
        )

# ============================================================================
# PDF MANAGEMENT ENDPOINTS
# ============================================================================



# Upload PDF from vault and link to note
@app.post("/pdfs/upload-from-vault", response_model=PDFResponse)
async def upload_pdf_from_vault(
    request: VaultPDFUploadRequest,
    user: User = Depends(get_authenticated_user)
):
    """Upload PDF from Obsidian vault, optionally link to a note, and generate AI summary"""
    try:
        repos = get_repos()
        pdfs_repo = repos['pdfs_repo']
        notes_repo = repos['notes_repo']
        context_repo = repos['context_repo']
        pdf_summaries_repo = repos['pdf_summaries_repo']
        
        # Decode base64 PDF content
        import base64
        try:
            pdf_content = base64.b64decode(request.pdf_content)
            print(f"🔍 DEBUG: Decoded PDF content size: {len(pdf_content)} bytes")
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid base64 PDF content: {str(e)}"
            )
        
        # Save PDF content to user storage
        file_info = await pdf_manager.save_vault_pdf(user.id, request.vault_pdf_path, pdf_content)
        
        # Check if PDF already exists for this user with same filename
        existing_pdf = await pdfs_repo.get_pdf_by_filename(user.id, file_info['original_filename'])
        
        if existing_pdf:
            # PDF already exists, just use the existing one
            pdf_record = existing_pdf
        else:
            # Create new PDF record in database
            pdf_record = await pdfs_repo.create_pdf(
                user_id=user.id,
                original_filename=file_info['original_filename'],
                stored_filename=file_info['filename'],
                file_path=file_info['file_path'],
                file_size=file_info['file_size'],
                vault_pdf_path=request.vault_pdf_path
            )
            
            if not pdf_record:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to create PDF record"
                )
        
        # Link the note to this PDF (one-to-one relationship)
        if request.linked_note_id:
            success = await notes_repo.link_note_to_pdf(user.id, request.linked_note_id, pdf_record.id)
            if not success:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Failed to link note to PDF. Note may already be linked to another PDF."
                )

        # Generate AI summary for new PDFs
        if not existing_pdf:  # Only generate summary for newly uploaded PDFs
            try:
                from modules.pdf_summary_extractor import PDFSummaryExtractor
                from handlers.llm_handler import LLMHandler

                # Get user's context for better summaries
                user_context = await context_repo.get_user_context(user.id)
                research_interest = user_context.research_interest if user_context else ""

                # Get the linked note for this PDF (if any)
                linked_note = None
                if request.linked_note_id:
                    linked_note = await notes_repo.get_note_by_id(user.id, request.linked_note_id)

                # Initialize summary extractor with LLM handler
                llm_handler = LLMHandler()
                summary_extractor = PDFSummaryExtractor(llm_handler=llm_handler)

                # Generate summary using linked note context
                summary_result = await summary_extractor.extract_and_store_summary(
                    user_id=user.id,
                    pdf_id=pdf_record.id,
                    pdf_file_path=pdf_record.file_path,
                    linked_note=linked_note,
                    research_interest=research_interest
                )

                # Store summary in database if successful
                if summary_result["summary"]:
                    await pdf_summaries_repo.create_pdf_summary(
                        pdf_id=pdf_record.id,
                        summary=summary_result["summary"],
                        file_path=summary_result["file_path"] or "",
                        model_used=llm_handler.model.value
                    )
                    print(f"✅ Generated and stored summary for PDF {pdf_record.id}")
                else:
                    print(f"⚠️ Failed to generate summary for PDF {pdf_record.id}: {summary_result.get('extraction_errors', [])}")

            except Exception as e:
                # Don't fail the upload if summary generation fails
                print(f"⚠️ Summary generation failed for PDF {pdf_record.id}: {str(e)}")
                # Continue with the upload process
        
        return PDFResponse(
            id=pdf_record.id,
            original_filename=pdf_record.original_filename,
            file_size=pdf_record.file_size,
            upload_date=pdf_record.upload_date.isoformat(),
            extraction_status=pdf_record.extraction_status,
            vault_pdf_path=pdf_record.vault_pdf_path
        )
        
    except (FileNotFoundError, ValueError) as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error uploading PDF from vault: {str(e)}"
        )

# Fulltext extraction endpoint removed - using summaries instead



# ============================================================================
# NOTES ENDPOINTS
# ============================================================================

@app.get("/notes", response_model=NoteListResponse)
async def get_user_notes(
    limit: int = 100,
    offset: int = 0,
    user: User = Depends(get_authenticated_user)
):
    """Get all notes for authenticated user"""
    try:
        repos = get_repos()
        notes_repo = repos['notes_repo']
        
        notes = await notes_repo.get_user_notes(user.id, limit, offset)
        total_count = await notes_repo.get_notes_count(user.id)
        
        note_responses = []
        for note in notes:
            note_responses.append(NoteResponse(
                id=note.id,
                file_path=note.file_path,
                content=note.content,  # Full content - no truncation
                linked_pdf_id=note.linked_pdf_id,
                created_at=note.created_at.isoformat(),
                updated_at=note.updated_at.isoformat()
            ))
        
        return NoteListResponse(
            notes=note_responses,
            total_count=total_count
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching notes: {str(e)}"
        )

@app.post("/notes", response_model=NoteResponse)
async def create_or_update_note(
    request: CreateNoteRequest,
    user: User = Depends(get_authenticated_user)
):
    """Create or update a note with automatic PDF link detection"""
    try:
        repos = get_repos()
        notes_repo = repos['notes_repo']
        
        # Check if note already exists and has a PDF link
        existing_note = await notes_repo.get_note_by_path(user.id, request.file_path)
        existing_pdf_id = existing_note.linked_pdf_id if existing_note else None
        
        # Only auto-detect PDFs if there's no existing PDF link
        pdf_id = existing_pdf_id
        if pdf_id is None:
            pdf_id = await detect_and_link_pdfs_from_note_content(user.id, request.content)
            if pdf_id:
                logger.info(f"Auto-detected PDF {pdf_id} for new note {request.file_path}")
        else:
            logger.info(f"Preserving existing PDF link {pdf_id} for note {request.file_path}")
        
        note = await notes_repo.create_note(
            user.id,
            request.file_path,
            request.content,
            pdf_id  # Use existing PDF link or auto-detected one
        )
        
        if not note:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create note"
            )
        
        return NoteResponse(
            id=note.id,
            file_path=note.file_path,
            content=note.content,
            linked_pdf_id=note.linked_pdf_id,
            created_at=note.created_at.isoformat(),
            updated_at=note.updated_at.isoformat()
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating note: {str(e)}"
        )

@app.get("/notes/{note_id}", response_model=NoteResponse)
async def get_note_by_id(
    note_id: int,
    user: User = Depends(get_authenticated_user)
):
    """Get a specific note by ID"""
    try:
        repos = get_repos()
        notes_repo = repos['notes_repo']
        
        note = await notes_repo.get_note_by_id(user.id, note_id)
        
        if not note:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Note not found"
            )
        
        return NoteResponse(
            id=note.id,
            file_path=note.file_path,
            content=note.content,
            linked_pdf_id=note.linked_pdf_id,
            created_at=note.created_at.isoformat(),
            updated_at=note.updated_at.isoformat()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching note: {str(e)}"
        )

@app.put("/notes/{note_id}", response_model=NoteResponse)
async def update_note(
    note_id: int,
    request: UpdateNoteRequest,
    user: User = Depends(get_authenticated_user)
):
    """Update a note's content with automatic PDF link detection"""
    try:
        repos = get_repos()
        notes_repo = repos['notes_repo']
        
        # Get existing note
        note = await notes_repo.get_note_by_id(user.id, note_id)
        if not note:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Note not found"
            )
        
        # Use provided PDF link or auto-detect from content
        pdf_id = request.linked_pdf_id
        if pdf_id is None:  # Only auto-detect if not explicitly provided
            pdf_id = await detect_and_link_pdfs_from_note_content(user.id, request.content)
            if pdf_id:
                logger.info(f"Auto-detected PDF {pdf_id} for note {note_id} during update")
        
        # Update note
        updated_note = await notes_repo.create_note(
            user.id,
            note.file_path,
            request.content,
            pdf_id
        )
        
        if not updated_note:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update note"
            )
        
        return NoteResponse(
            id=updated_note.id,
            file_path=updated_note.file_path,
            content=updated_note.content,
            linked_pdf_id=updated_note.linked_pdf_id,
            created_at=updated_note.created_at.isoformat(),
            updated_at=updated_note.updated_at.isoformat()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating note: {str(e)}"
        )

@app.delete("/notes/{note_id}")
async def delete_note(
    note_id: int,
    user: User = Depends(get_authenticated_user)
):
    """Delete a note"""
    try:
        repos = get_repos()
        notes_repo = repos['notes_repo']
        
        success = await notes_repo.delete_note(user.id, note_id)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Note not found or already deleted"
            )
        
        return {"message": "Note deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting note: {str(e)}"
        )

@app.post("/notes/{note_id}/unlink-pdf")
async def unlink_note_from_pdf(
    note_id: int,
    user: User = Depends(get_authenticated_user)
):
    """Unlink a note from its PDF"""
    try:
        repos = get_repos()
        notes_repo = repos['notes_repo']
        
        success = await notes_repo.unlink_note_from_pdf(user.id, note_id)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Note not found or no PDF to unlink"
            )
        
        return {"message": "Note unlinked from PDF successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error unlinking note from PDF: {str(e)}"
        )

# ============================================================================
# PDFS ENDPOINTS
# ============================================================================

@app.get("/pdfs", response_model=PDFListResponse)
async def get_user_pdfs(
    limit: int = 100,
    offset: int = 0,
    user: User = Depends(get_authenticated_user)
):
    """Get all PDFs for authenticated user"""
    try:
        repos = get_repos()
        pdfs_repo = repos['pdfs_repo']
        
        pdfs = await pdfs_repo.get_user_pdfs(user.id, limit, offset)
        total_count = await pdfs_repo.get_pdfs_count(user.id)
        
        pdf_responses = []
        for pdf in pdfs:
            pdf_responses.append(PDFResponse(
                id=pdf.id,
                original_filename=pdf.original_filename,
                file_size=pdf.file_size,
                    upload_date=pdf.upload_date.isoformat(),
                extraction_status=pdf.extraction_status,
                vault_pdf_path=pdf.vault_pdf_path
            ))
        
        return PDFListResponse(
            pdfs=pdf_responses,
            total_count=total_count
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching PDFs: {str(e)}"
        )

@app.get("/pdfs/{pdf_id}", response_model=PDFResponse)
async def get_pdf_by_id(
    pdf_id: int,
    user: User = Depends(get_authenticated_user)
):
    """Get a specific PDF by ID"""
    try:
        repos = get_repos()
        pdfs_repo = repos['pdfs_repo']
        
        pdf = await pdfs_repo.get_pdf_by_id(user.id, pdf_id)
        
        if not pdf:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="PDF not found"
            )
        
        return PDFResponse(
            id=pdf.id,
            original_filename=pdf.original_filename,
            file_size=pdf.file_size,
            upload_date=pdf.upload_date.isoformat(),
            extraction_status=pdf.extraction_status,
            vault_pdf_path=pdf.vault_pdf_path
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching PDF: {str(e)}"
        )

@app.delete("/pdfs/{pdf_id}")
async def delete_pdf(
    pdf_id: int,
    user: User = Depends(get_authenticated_user)
):
    """Delete a PDF"""
    try:
        repos = get_repos()
        pdfs_repo = repos['pdfs_repo']
        
        file_path = await pdfs_repo.delete_pdf(user.id, pdf_id)
        
        if not file_path:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="PDF not found or already deleted"
            )
        
        # TODO: Clean up actual PDF file from storage
        # os.remove(file_path) if os.path.exists(file_path) else None
        
        return {"message": "PDF deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting PDF: {str(e)}"
        )

@app.post("/pdfs/{pdf_id}/link-to-note")
async def link_pdf_to_note(
    pdf_id: int,
    request: LinkPDFToNoteRequest,
    user: User = Depends(get_authenticated_user)
):
    """Link a PDF to a note (one-to-one relationship)"""
    try:
        repos = get_repos()
        notes_repo = repos['notes_repo']
        
        # Link note to PDF (one-to-one relationship managed through notes table)
        success = await notes_repo.link_note_to_pdf(user.id, request.note_id, pdf_id)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to link note to PDF. Note may already be linked to another PDF."
            )
        
        return {"message": "Note linked to PDF successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error linking PDF to note: {str(e)}"
        )

@app.get("/available-strategies")
async def get_available_strategies():
    """Get list of available frame generation strategies"""
    try:
        strategies_info = {}
        for name, strategy_class in AVAILABLE_STRATEGIES.items():
            strategy = strategy_class()
            strategies_info[name] = {
                "name": name,
                "display_name": name.replace('_', ' ').title(),
                "default_params": strategy.get_default_params(),
                "required_params": strategy.get_required_params()
            }
        
        return {
            "strategies": strategies_info,
            "default_strategy": "direct_answer"
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error getting strategies: {str(e)}"
        )



# ============================================================================
# WEBSOCKET ENDPOINTS
# ============================================================================

@app.websocket("/ws/{session_token}")
async def websocket_endpoint(websocket: WebSocket, session_token: str):
    """WebSocket endpoint for real-time queue notifications"""
    # MUST accept connection first before we can authenticate
    await websocket.accept()
    
    print(f"🔌 WebSocket connection attempt with session_token: '{session_token[:8]}...'")
    print(f"🔑 Active sessions: {[f'{s[:8]}...' for s in active_sessions.keys()]}")
    print(f"🔍 Full session comparison:")
    for active_token in active_sessions.keys():
        print(f"   Active: {active_token[:8]}... | Incoming: {session_token[:8]}... | Match: {active_token == session_token}")
    
    # Authenticate user via session token
    user_id = active_sessions.get(session_token)
    if not user_id:
        print(f"❌ Session token '{session_token[:8]}...' not found in active sessions")
        print(f"❌ Available sessions: {len(active_sessions)} total")
        await websocket.close(code=1008, reason="Invalid session")
        return
    
    print(f"✅ Found user_id {user_id} for session token")
    
    try:
        repos = get_repos()
        users_repo = repos['users_repo']
        user = await users_repo.get_user_by_id(user_id)
    except HTTPException:
        await websocket.close(code=1011, reason="Server error: Database not initialized")
        return
    if not user:
        await websocket.close(code=1008, reason="Invalid session")
        return
    
    # Add to WebSocket manager
    websocket_manager.active_connections[user.id] = websocket
    print(f"WebSocket connected for user {user.id}")
    
    try:
        # Send initial queue status
        queue_status = frame_queue.get_user_queue_status(user.id)
        await websocket_manager.send_personal_message({
            "type": "queue_update",
            "event": "connected",
            "data": {"queue_status": queue_status}
        }, user.id)
        
        # Keep connection alive and handle incoming messages
        while True:
            try:
                data = await websocket.receive_text()
                # Handle any client messages if needed (like ping/pong)
                message = json.loads(data)
                if message.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except WebSocketDisconnect:
                break
            except Exception as e:
                print(f"WebSocket error for user {user.id}: {e}")
                break
                
    except WebSocketDisconnect:
        pass
    finally:
        # Clean up connection
        if user.id in websocket_manager.active_connections:
            del websocket_manager.active_connections[user.id]
            print(f"WebSocket disconnected for user {user.id}")

if __name__ == "__main__":
    import uvicorn
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8000))
    print(f"Starting Async Research Frames backend on {host}:{port}...")
    print(f"Model: {os.getenv('MODEL_PATH', 'meta-llama/Llama-3.3-70B-Instruct')}")
    print(f"Database: {os.getenv('DATABASE_URL', 'postgresql://localhost/research_frames')}")
    uvicorn.run(app, host=host, port=port)