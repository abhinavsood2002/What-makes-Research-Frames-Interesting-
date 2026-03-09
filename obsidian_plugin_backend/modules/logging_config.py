"""
Logging configuration for user-specific Python logging.
Sets up file handlers for strategies to log LLM prompts and responses.
"""
import os
import logging
from datetime import datetime
from typing import Optional


def setup_user_logger(logger_name: str, user_id: int, strategy_name: str) -> logging.Logger:
    """
    Setup a user-specific file logger for strategy LLM interactions.

    Args:
        logger_name: Name of the logger (typically __name__ from strategy)
        user_id: User ID for directory organization
        strategy_name: Strategy name for log filename

    Returns:
        Configured logger with user-specific file handler
    """
    # Create user-specific log directory
    log_dir = os.path.join("logs", f"user_{user_id}")
    os.makedirs(log_dir, exist_ok=True)

    # Create log filename with date
    date_str = datetime.now().strftime("%Y%m%d")
    log_filename = os.path.join(log_dir, f"{strategy_name}_{date_str}.log")

    # Get or create logger
    logger = logging.getLogger(logger_name)

    # Check if this logger already has a file handler for this user
    user_handler_exists = any(
        isinstance(handler, logging.FileHandler) and
        f"user_{user_id}" in handler.baseFilename
        for handler in logger.handlers
    )

    if not user_handler_exists:
        # Create file handler
        file_handler = logging.FileHandler(log_filename, mode='a', encoding='utf-8')
        file_handler.setLevel(logging.INFO)

        # Create detailed formatter for LLM analysis
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        file_handler.setFormatter(formatter)

        # Add handler to logger
        logger.addHandler(file_handler)
        logger.setLevel(logging.INFO)

    return logger


def log_llm_interaction(logger: logging.Logger, step_name: str, prompt: str,
                       response_text: str, model: str = "", temperature: float = 0.7):
    """
    Log complete LLM interaction with formatted output for analysis.

    Args:
        logger: Logger instance to use
        step_name: Name/description of the LLM step
        prompt: Complete prompt sent to LLM
        response_text: Complete response from LLM
        model: Model name used
        temperature: Temperature setting used
    """
    separator = "=" * 80

    logger.info(f"\n{separator}")
    logger.info(f"LLM CALL: {step_name}")
    logger.info(f"Model: {model}")
    logger.info(f"Temperature: {temperature}")
    logger.info(f"Prompt Length: {len(prompt)} characters")
    logger.info(f"Response Length: {len(response_text)} characters")
    logger.info(f"{separator}")

    logger.info("PROMPT:")
    logger.info(f"---\n{prompt}\n---")

    logger.info("RESPONSE:")
    logger.info(f"---\n{response_text}\n---")

    logger.info(f"{separator}\n")


def cleanup_user_logger(logger: logging.Logger, user_id: int):
    """
    Clean up user-specific file handlers from logger.

    Args:
        logger: Logger instance to clean up
        user_id: User ID to identify handlers to remove
    """
    handlers_to_remove = [
        handler for handler in logger.handlers
        if isinstance(handler, logging.FileHandler) and
        f"user_{user_id}" in handler.baseFilename
    ]

    for handler in handlers_to_remove:
        handler.close()
        logger.removeHandler(handler)