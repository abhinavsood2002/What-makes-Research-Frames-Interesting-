"""
Strategic Background Worker - Direct frame generation from notes and PDFs
"""
import asyncio
import time
from typing import Dict, Any, List
import logging

from handlers.llm_handler import LLMHandler, ModelType
from .frame_queue import frame_queue, FrameGenerationTask
from .content_processor import ContentProcessor
from .pdf_summary_extractor import PDFSummaryExtractor
from strategies import get_strategy

logger = logging.getLogger(__name__)

class StrategicBackgroundWorker:
    """Enhanced background worker for direct frame generation from notes and PDFs."""
    
    def __init__(self, database_connection, websocket_manager=None):
        self.db_connection = database_connection
        self.websocket_manager = websocket_manager
        print(f"🚀 StrategicBackgroundWorker init: websocket_manager = {websocket_manager}")
        
        # Repositories will be accessed via get_repos() to ensure they're initialized
        self.frames_repo = None
        self.context_repo = None
        self.notes_repo = None
        self.pdfs_repo = None
        self.queue = frame_queue
        self.llm = LLMHandler(model=ModelType.get_default())
        
        # Initialize processors
        self.pdf_summary_extractor = PDFSummaryExtractor(self.llm)
        self.content_processor = ContentProcessor()
        
        self.is_running = False
        self._stop_event = asyncio.Event()
        
        # Configuration
        self.check_interval = 5  # Check for new tasks every 5 seconds
        self.cleanup_interval = 3600  # Cleanup old tasks every hour
        
    def _get_repos(self):
        """Get repositories using get_repos() to ensure they're initialized"""
        from db import get_repos
        repos = get_repos()
        self.frames_repo = repos['frames_repo']
        self.context_repo = repos['context_repo']
        self.notes_repo = repos['notes_repo']
        self.pdfs_repo = repos['pdfs_repo']
        
        return repos
        
    async def run(self):
        """Main worker loop."""
        self.is_running = True
        logger.info("Strategic background frame generator started")
        
        last_cleanup = time.time()
        
        while not self._stop_event.is_set():
            try:
                # Process pending tasks from queue
                await self._process_queue_tasks()
                
                # Periodic cleanup of old completed tasks
                if time.time() - last_cleanup > self.cleanup_interval:
                    self.queue.cleanup_completed_tasks()
                    last_cleanup = time.time()
                
                # Wait before next check
                await asyncio.sleep(self.check_interval)
                
            except Exception as e:
                logger.error(f"Error in main worker loop: {e}")
                await asyncio.sleep(self.check_interval)
        
        self.is_running = False
        logger.info("Strategic background frame generator stopped")
    
    def stop(self):
        """Stop the background worker."""
        self._stop_event.set()
    
    async def _process_queue_tasks(self):
        """Process pending tasks from the queue."""
        try:
            # Get next task from queue
            task = self.queue.get_next_task()
            
            if task:
                logger.info(f"Processing task {task.task_id} for user {task.user_id}")
                # Process task in background (don't await to allow concurrent processing)
                asyncio.create_task(
                    self._generate_strategic_frame(task)
                )
                
        except Exception as e:
            logger.error(f"Error processing queue tasks: {e}")
    
    async def _generate_strategic_frame(self, task: FrameGenerationTask):
        """Generate a frame directly from notes and PDFs."""
        start_time = time.time()
        
        try:
            # Get repositories first to ensure they're initialized
            self._get_repos()
            
            logger.info(f"Starting direct frame generation for user {task.user_id}, task {task.task_id}")
            
            # Step 1: Get user context and content
            context = await self.context_repo.get_user_context(task.user_id)
            if not context:
                raise Exception("No user context found")
            
            # Step 2: Get user's selected notes and PDFs
            selected_notes = await self.notes_repo.get_notes_by_ids(task.user_id, context.selected_note_ids)
            selected_pdfs = await self.pdfs_repo.get_pdfs_by_ids(task.user_id, context.selected_pdf_ids)
            
            if not selected_notes and not selected_pdfs:
                raise Exception("No notes or PDFs available for frame generation")
            
            # Step 3: Generate PDF summaries if needed
            await self._ensure_pdf_summaries(task.user_id, selected_pdfs, selected_notes, context.research_interest)

            # Step 4: Prepare content for frame generation
            content_result = await self.content_processor.prepare_content(
                user_id=task.user_id,
                research_interest=context.research_interest,
                selected_notes=selected_notes,
                selected_pdfs=selected_pdfs
            )
            
            if not content_result['success'] or not content_result['total_content_available']:
                raise Exception("Failed to prepare content for frame generation")

            # Step 5: Use strategy from task
            strategy_name = task.strategy
            strategy = get_strategy(strategy_name)
            
            # Set up websocket manager for console output if strategy supports it
            if hasattr(strategy, 'set_websocket_manager'):
                strategy.set_websocket_manager(self.websocket_manager)
            
            logger.info(f"Using strategy '{strategy_name}' with {len(selected_notes)} notes and {len(selected_pdfs)} PDFs")

            # Step 6: Query for existing frames to encourage diversity
            existing_frames = await self.frames_repo.get_frames_by_strategy_and_question(
                user_id=task.user_id,
                strategy_name=strategy_name,
                research_question=task.research_question
            )

            if existing_frames:
                logger.info(f"Found {len(existing_frames)} existing frames for strategy '{strategy_name}' and question '{task.research_question}' - will encourage diversity")

            # Step 7: Generate frame using strategy
            from strategies.base_strategy import FrameGenerationContext

            generation_context = FrameGenerationContext(
                user_id=task.user_id,
                research_interest=context.research_interest,
                research_question=task.research_question,
                content_pairs=content_result['content_pairs'],
                pdf_summaries=content_result['pdf_summaries'],
                strategy_params={},  # Use default parameters
                existing_frames=existing_frames
            )
            
            frame_result = await strategy.generate_frame(generation_context, self.llm)
            
            # Calculate generation time
            generation_time = (time.time() - start_time) / 60  # Convert to minutes

            # Step 8: Store the frame with associated content IDs
            frame = await self.frames_repo.store_frame(
                user_id=task.user_id,
                title=frame_result.title,
                perspective=frame_result.perspective,
                research_question=task.research_question,
                generation_time_minutes=generation_time,
                notes_used=frame_result.notes_used,
                pdfs_used=frame_result.pdfs_used,
                strategy_name=strategy_name
            )
            
            # Mark task as completed in queue
            self.queue.complete_task(task.task_id)
            
            logger.info(
                f"Generated frame {frame.id} using '{strategy_name}' "
                f"for user {task.user_id} in {generation_time:.1f} minutes"
            )
            
        except Exception as e:
            # Mark task as failed in queue
            self.queue.fail_task(task.task_id, str(e))
            logger.error(f"Failed to generate frame for task {task.task_id}: {e}")

    async def _ensure_pdf_summaries(self, user_id: int, selected_pdfs: List, selected_notes: List, research_interest: str):
        """Ensure all selected PDFs have summaries generated."""
        if not selected_pdfs:
            return

        # Get repositories
        repos = self._get_repos()
        pdf_summaries_repo = repos['pdf_summaries_repo']

        for pdf in selected_pdfs:
            try:
                # Check if summary already exists
                existing_summary = await pdf_summaries_repo.get_pdf_summary(pdf.id)

                if not existing_summary:
                    logger.info(f"Generating summary for PDF {pdf.id}: {pdf.original_filename}")

                    # Find linked note for context
                    linked_note = None
                    for note in selected_notes:
                        if note.linked_pdf_id == pdf.id:
                            linked_note = note
                            break

                    # Extract and store summary
                    summary_result = await self.pdf_summary_extractor.extract_and_store_summary(
                        user_id=user_id,
                        pdf_id=pdf.id,
                        pdf_file_path=pdf.file_path,
                        linked_note=linked_note,
                        research_interest=research_interest
                    )

                    if summary_result.get('summary'):
                        # Store in database
                        await pdf_summaries_repo.create_pdf_summary(
                            pdf_id=pdf.id,
                            summary=summary_result['summary'],
                            file_path=summary_result.get('file_path', ''),
                            model_used=self.llm.model.value
                        )
                        logger.info(f"Successfully stored summary for PDF {pdf.id}")
                    else:
                        logger.warning(f"Failed to generate summary for PDF {pdf.id}")

            except Exception as e:
                logger.error(f"Error ensuring summary for PDF {pdf.id}: {e}")
                # Continue with other PDFs even if one fails
                continue

    def get_status(self) -> Dict[str, Any]:
        """Get current worker status."""
        return {
            'is_running': self.is_running,
            'queue_status': self.queue.get_queue_status()
        }