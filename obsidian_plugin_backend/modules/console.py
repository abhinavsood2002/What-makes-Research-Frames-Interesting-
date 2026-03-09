"""
Console module for streaming debug output to frontend via WebSocket.
Used by extractors and strategies to show real-time progress to users.
"""
import asyncio
import logging
import os
from datetime import datetime
from typing import Optional, Any, Dict
import threading

class WebSocketLogHandler(logging.Handler):
    """Custom logging handler that captures debug output and sends via WebSocket."""
    
    def __init__(self, websocket_manager, user_id: int):
        super().__init__()
        self.websocket_manager = websocket_manager
        self.user_id = user_id
        self.setLevel(logging.DEBUG)
        self.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
    
    def emit(self, record):
        if self.websocket_manager and self.user_id:
            try:
                log_message = self.format(record)
                print(f"🔄 Console sending WebSocket message: {log_message}")
                
                # Send directly via WebSocket - simple and immediate
                asyncio.create_task(self._send_websocket_message(log_message, record))
                
            except Exception as e:
                print(f"❌ Error in console emit: {e}")
    
    async def _send_websocket_message(self, log_message: str, record):
        """Send WebSocket message directly - no queue needed"""
        try:
            # Check if this is an LLM generation message
            level_type = getattr(record, 'level_type', record.levelname)
            
            await self.websocket_manager.send_progress_message(
                self.user_id, 
                'debug_output',
                log_message,
                {'level': level_type, 'module': record.name}
            )
            print(f"✅ WebSocket message sent directly to user {self.user_id}")
        except Exception as e:
            print(f"❌ Error sending WebSocket message: {e}")


class Console:
    """
    Console manager for streaming debug output to frontend.
    Handles both file logging and WebSocket streaming for extractors and strategies.
    """
    
    def __init__(self, name: str, websocket_manager=None, user_id: Optional[int] = None):
        self.name = name
        self.websocket_manager = websocket_manager
        self.user_id = user_id
        self.websocket_handler = None
        
        # Create file logger
        log_dir = "logs/debug"
        os.makedirs(log_dir, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        log_filename = os.path.join(log_dir, f"{name}_debug_{timestamp}.log")
        
        self.file_logger = logging.getLogger(f"{name}_file_{timestamp}")
        if not self.file_logger.handlers:
            file_handler = logging.FileHandler(log_filename)
            file_handler.setLevel(logging.DEBUG)
            formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
            file_handler.setFormatter(formatter)
            self.file_logger.addHandler(file_handler)
            self.file_logger.setLevel(logging.DEBUG)
    
    def setup_websocket_streaming(self, user_id: int):
        """Set up WebSocket streaming for this console session."""
        if self.websocket_manager and user_id:
            self.user_id = user_id
            
            # Remove existing WebSocket handler if any
            if self.websocket_handler:
                self.file_logger.removeHandler(self.websocket_handler)
            
            # Create new WebSocket handler
            self.websocket_handler = WebSocketLogHandler(self.websocket_manager, user_id)
            self.file_logger.addHandler(self.websocket_handler)
    
    def cleanup_websocket_streaming(self):
        """Clean up WebSocket streaming after session."""
        if self.websocket_handler:
            self.file_logger.removeHandler(self.websocket_handler)
            self.websocket_handler = None
    
    def info(self, message: str, **kwargs):
        """Log info message."""
        self.file_logger.info(message, **kwargs)
    
    def debug(self, message: str, **kwargs):
        """Log debug message."""
        self.file_logger.debug(message, **kwargs)
    
    def warning(self, message: str, **kwargs):
        """Log warning message."""
        self.file_logger.warning(message, **kwargs)
    
    def error(self, message: str, **kwargs):
        """Log error message."""
        self.file_logger.error(message, **kwargs)
    
    def critical(self, message: str, **kwargs):
        """Log critical message."""
        self.file_logger.critical(message, **kwargs)


def create_console(name: str, websocket_manager=None, user_id: Optional[int] = None) -> Console:
    """
    Factory function to create a console instance.
    
    Args:
        name: Name for the console (e.g., 'extractor', 'strategy')
        websocket_manager: WebSocket manager for streaming output
        user_id: User ID for WebSocket streaming
    
    Returns:
        Console instance ready for logging
    """
    return Console(name, websocket_manager, user_id)