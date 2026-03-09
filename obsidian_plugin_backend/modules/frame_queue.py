import asyncio
import pickle
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from datetime import datetime
from enum import Enum
import logging
import os

logger = logging.getLogger(__name__)

class TaskStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing" 
    COMPLETED = "completed"
    FAILED = "failed"

@dataclass
class FrameGenerationTask:
    """A frame generation task in the queue"""
    user_id: int
    task_id: str
    research_question: str  # The research question for this frame
    status: TaskStatus = TaskStatus.PENDING
    strategy: str = "all_content"     # Strategy to use for this task
    created_at: datetime = field(default_factory=datetime.now)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    estimated_duration: float = 3.0  # Default 3 minutes
    
    def start_processing(self):
        self.status = TaskStatus.PROCESSING
        self.started_at = datetime.now()
    
    def complete(self):
        self.status = TaskStatus.COMPLETED
        self.completed_at = datetime.now()
    
    def fail(self, error: str):
        self.status = TaskStatus.FAILED
        self.completed_at = datetime.now()
        self.error_message = error
    
    @property
    def elapsed_time(self) -> float:
        """Get elapsed time in minutes"""
        if not self.started_at:
            return 0.0
        end_time = self.completed_at or datetime.now()
        return (end_time - self.started_at).total_seconds() / 60.0

class FrameGenerationQueue:
    """In-memory queue for frame generation tasks with pickle persistence"""
    
    def __init__(self, pickle_file: str = "frame_queue.pkl", max_concurrent: int = 2):
        self.pickle_file = pickle_file
        self.max_concurrent = max_concurrent
        
        # Core queue data
        self.pending_tasks: List[FrameGenerationTask] = []
        self.processing_tasks: Dict[str, FrameGenerationTask] = {}  # task_id -> task
        self.completed_tasks: Dict[str, FrameGenerationTask] = {}  # task_id -> task
        self.failed_tasks: Dict[str, FrameGenerationTask] = {}     # task_id -> task
        
        # Task counter for unique IDs
        self.task_counter = 0
        
        # WebSocket notification callback
        self.notify_callback = None
        
        # Load persisted state
        self.load_from_pickle()
        
        # Queue processing
        self._processing_lock = asyncio.Lock()
    
    def set_notification_callback(self, callback):
        """Set callback function for WebSocket notifications"""
        self.notify_callback = callback
    
    def _generate_task_id(self) -> str:
        """Generate unique task ID"""
        self.task_counter += 1
        return f"task_{int(time.time())}_{self.task_counter}"
    
    def add_task(self, user_id: int, strategy: str = "all_content", research_question: str = "") -> str:
        """Add a new frame generation task to the queue"""
        task_id = self._generate_task_id()
        task = FrameGenerationTask(user_id=user_id, task_id=task_id, research_question=research_question, strategy=strategy)
        
        self.pending_tasks.append(task)
        self.save_to_pickle()
        
        # Notify user via WebSocket
        if self.notify_callback:
            asyncio.create_task(self.notify_callback(
                user_id, 
                "task_added", 
                {
                    "task_id": task_id,
                    "position": len(self.pending_tasks) + len(self.processing_tasks),
                    "queue_status": self.get_user_queue_status(user_id),
                    "background_worker_status": "running"  # Worker is running if adding tasks
                }
            ))
        
        logger.info(f"Added task {task_id} for user {user_id} to queue")
        return task_id
    
    def get_next_task(self) -> Optional[FrameGenerationTask]:
        """Get the next pending task (FIFO)"""
        if not self.pending_tasks:
            return None
        
        # Check if we can process more tasks
        if len(self.processing_tasks) >= self.max_concurrent:
            return None
        
        task = self.pending_tasks.pop(0)  # FIFO
        task.start_processing()
        self.processing_tasks[task.task_id] = task
        self.save_to_pickle()
        
        # Notify user via WebSocket
        if self.notify_callback:
            asyncio.create_task(self.notify_callback(
                task.user_id, 
                "task_processing", 
                {
                    "task_id": task.task_id,
                    "queue_status": self.get_user_queue_status(task.user_id),
                    "background_worker_status": "running"
                }
            ))
        
        logger.info(f"Started processing task {task.task_id}")
        return task
    
    def complete_task(self, task_id: str):
        """Mark a task as completed"""
        if task_id in self.processing_tasks:
            task = self.processing_tasks.pop(task_id)
            task.complete()
            self.completed_tasks[task_id] = task
            self.save_to_pickle()
            
            # Notify user via WebSocket
            if self.notify_callback:
                asyncio.create_task(self.notify_callback(
                    task.user_id, 
                    "task_completed", 
                    {
                        "task_id": task_id,
                        "generation_time": task.elapsed_time,
                        "queue_status": self.get_user_queue_status(task.user_id)
                    }
                ))
            
            logger.info(f"Completed task {task_id} in {task.elapsed_time:.1f}m")
    
    def fail_task(self, task_id: str, error: str):
        """Mark a task as failed"""
        if task_id in self.processing_tasks:
            task = self.processing_tasks.pop(task_id)
            task.fail(error)
            self.failed_tasks[task_id] = task
            self.save_to_pickle()
            
            # Notify user via WebSocket
            if self.notify_callback:
                asyncio.create_task(self.notify_callback(
                    task.user_id, 
                    "task_failed", 
                    {
                        "task_id": task_id,
                        "error": error,
                        "queue_status": self.get_user_queue_status(task.user_id)
                    }
                ))
            
            logger.error(f"Failed task {task_id}: {error}")
    
    def get_user_queue_status(self, user_id: int) -> Dict[str, Any]:
        """Get detailed queue status for a specific user"""
        user_pending = [t for t in self.pending_tasks if t.user_id == user_id]
        user_processing = [t for t in self.processing_tasks.values() if t.user_id == user_id]
        
        # Calculate positions in queue
        pending_positions = []
        for task in user_pending:
            position = self.pending_tasks.index(task) + len(self.processing_tasks) + 1
            pending_positions.append(position)
        
        return {
            'pending': len(user_pending),
            'processing': len(user_processing),
            'pending_positions': pending_positions,
            'total_queue_length': len(self.pending_tasks) + len(self.processing_tasks),
            'estimated_wait_time': self._calculate_estimated_wait_time(user_id)
        }
    
    def get_overall_status(self) -> Dict[str, Any]:
        """Get overall queue status"""
        return {
            'pending_count': len(self.pending_tasks),
            'processing_count': len(self.processing_tasks),
            'completed_count': len(self.completed_tasks),
            'failed_count': len(self.failed_tasks),
            'total_queue_length': len(self.pending_tasks) + len(self.processing_tasks)
        }
    
    def _calculate_estimated_wait_time(self, user_id: int) -> float:
        """Calculate estimated wait time in minutes for user's first pending task"""
        user_pending = [t for t in self.pending_tasks if t.user_id == user_id]
        if not user_pending:
            return 0.0
        
        # Find position of user's first task
        first_task = user_pending[0]
        position = self.pending_tasks.index(first_task)
        
        # Estimate based on: (tasks ahead / concurrent slots) * avg duration
        tasks_ahead = position
        concurrent_slots = self.max_concurrent
        avg_duration = 3.0  # Default 3 minutes per task
        
        # Add time for currently processing tasks
        processing_remaining_time = 0.0
        for task in self.processing_tasks.values():
            elapsed = task.elapsed_time
            remaining = max(0, task.estimated_duration - elapsed)
            processing_remaining_time = max(processing_remaining_time, remaining)
        
        queue_time = (tasks_ahead / concurrent_slots) * avg_duration
        return processing_remaining_time + queue_time
    
    def cleanup_completed_tasks(self, max_age_hours: int = 24):
        """Remove old completed/failed tasks to prevent memory growth"""
        cutoff_time = datetime.now().timestamp() - (max_age_hours * 3600)
        
        # Clean completed tasks
        to_remove = []
        for task_id, task in self.completed_tasks.items():
            if task.completed_at and task.completed_at.timestamp() < cutoff_time:
                to_remove.append(task_id)
        
        for task_id in to_remove:
            del self.completed_tasks[task_id]
        
        # Clean failed tasks
        to_remove = []
        for task_id, task in self.failed_tasks.items():
            if task.completed_at and task.completed_at.timestamp() < cutoff_time:
                to_remove.append(task_id)
        
        for task_id in to_remove:
            del self.failed_tasks[task_id]
        
        if to_remove:
            self.save_to_pickle()
            logger.info(f"Cleaned up {len(to_remove)} old tasks")
    
    def save_to_pickle(self):
        """Save queue state to pickle file"""
        try:
            data = {
                'pending_tasks': self.pending_tasks,
                'processing_tasks': self.processing_tasks,
                'completed_tasks': self.completed_tasks,
                'failed_tasks': self.failed_tasks,
                'task_counter': self.task_counter
            }
            
            # Atomic write using temporary file
            temp_file = f"{self.pickle_file}.tmp"
            with open(temp_file, 'wb') as f:
                pickle.dump(data, f)
            
            # Replace original file
            if os.path.exists(self.pickle_file):
                os.remove(self.pickle_file)
            os.rename(temp_file, self.pickle_file)
            
        except Exception as e:
            logger.error(f"Failed to save queue state: {e}")
    
    def load_from_pickle(self):
        """Load queue state from pickle file"""
        if not os.path.exists(self.pickle_file):
            logger.info("No existing queue state found, starting fresh")
            return
        
        try:
            with open(self.pickle_file, 'rb') as f:
                data = pickle.load(f)
            
            self.pending_tasks = data.get('pending_tasks', [])
            self.processing_tasks = data.get('processing_tasks', {})
            self.completed_tasks = data.get('completed_tasks', {})
            self.failed_tasks = data.get('failed_tasks', {})
            self.task_counter = data.get('task_counter', 0)
            
            # Reset any processing tasks to pending on startup (they failed due to restart)
            for task in self.processing_tasks.values():
                task.status = TaskStatus.PENDING
                task.started_at = None
                self.pending_tasks.append(task)
            
            self.processing_tasks.clear()
            
            logger.info(f"Loaded queue state: {len(self.pending_tasks)} pending, "
                       f"{len(self.completed_tasks)} completed, {len(self.failed_tasks)} failed")
            
        except Exception as e:
            logger.error(f"Failed to load queue state: {e}, starting fresh")
            self.pending_tasks = []
            self.processing_tasks = {}
            self.completed_tasks = {}
            self.failed_tasks = {}
            self.task_counter = 0

# Global queue instance
frame_queue = FrameGenerationQueue()