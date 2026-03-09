"""
Batch Manager - Sequential processing of batch frame generation to prevent race conditions
"""
import asyncio
import logging
from typing import List

logger = logging.getLogger(__name__)

class BatchManager:
    """Manages sequential processing of batch frame generation tasks to ensure proper diversity."""

    def __init__(self, frame_queue):
        self.queue = frame_queue

    async def create_experiment_batch(self, user_id: int, questions: List[str],
                                    strategies: List[str], repetitions_per_strategy: int) -> List[str]:
        """
        Create batch of frame generation tasks with sequential processing per strategy+question group.

        This ensures that for each strategy+question combination, repetitions are processed
        sequentially so that diversity prompts work correctly (0→1→2 existing frames).

        Args:
            user_id: User ID for the batch
            questions: List of research questions
            strategies: List of strategy names to use
            repetitions_per_strategy: Number of repetitions per strategy+question combination

        Returns:
            List of all created task IDs
        """
        all_task_ids = []
        total_groups = len(questions) * len(strategies)
        current_group = 0

        logger.info(f"Starting batch generation for user {user_id}: {len(questions)} questions × {len(strategies)} strategies × {repetitions_per_strategy} reps = {len(questions) * len(strategies) * repetitions_per_strategy} total tasks")

        for question in questions:
            for strategy in strategies:
                current_group += 1
                logger.info(f"Processing group {current_group}/{total_groups}: strategy '{strategy}' with question '{question[:50]}...'")

                # Process repetitions sequentially to ensure proper diversity progression (0→1→2 existing frames)
                group_task_ids = []
                for repetition in range(repetitions_per_strategy):
                    task_id = self.queue.add_task(user_id, strategy, question)
                    group_task_ids.append(task_id)
                    logger.debug(f"Created task {task_id} (repetition {repetition + 1}/{repetitions_per_strategy})")

                    # Wait for THIS specific repetition to complete before adding next
                    logger.debug(f"Waiting for repetition {repetition + 1} (task {task_id}) to complete...")
                    await self._wait_for_completion([task_id])
                    logger.debug(f"Repetition {repetition + 1} completed - next repetition will see {repetition + 1} existing frame(s)")

                all_task_ids.extend(group_task_ids)
                logger.info(f"Group {current_group}/{total_groups} completed successfully")

        logger.info(f"Batch generation completed: {len(all_task_ids)} total tasks created")
        return all_task_ids

    async def _wait_for_completion(self, task_ids: List[str]):
        """
        Wait for all tasks in the given list to complete (successfully or with failure).

        Args:
            task_ids: List of task IDs to wait for
        """
        while True:
            # Check if all tasks are done (either completed or failed)
            all_done = all(
                task_id in self.queue.completed_tasks or
                task_id in self.queue.failed_tasks
                for task_id in task_ids
            )

            if all_done:
                # Log completion status
                completed_count = sum(1 for task_id in task_ids if task_id in self.queue.completed_tasks)
                failed_count = sum(1 for task_id in task_ids if task_id in self.queue.failed_tasks)
                logger.debug(f"Group completion: {completed_count} succeeded, {failed_count} failed")
                break

            # Wait a bit before checking again
            await asyncio.sleep(1)