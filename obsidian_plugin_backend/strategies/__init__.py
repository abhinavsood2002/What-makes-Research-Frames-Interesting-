"""
Strategy framework for frame generation.

This package contains different strategies for generating research frames
from notes and PDFs using various approaches.
"""

from .base_strategy import BaseFrameStrategy, FrameGenerationContext
from .all_objects_strategy import AllObjectsStrategy
from .direct_answer_strategy import DirectAnswerStrategy
from .dorsts_frame_strategy import DorstsFrameStrategy

# Available strategies
AVAILABLE_STRATEGIES = {
    'direct_answer': DirectAnswerStrategy,
    'all_content': AllObjectsStrategy,
    'dorsts_frame': DorstsFrameStrategy,
}

def get_strategy(strategy_name: str = 'all_content') -> BaseFrameStrategy:
    """Get a strategy instance by name."""
    if strategy_name not in AVAILABLE_STRATEGIES:
        raise ValueError(f"Unknown strategy: {strategy_name}. Available: {list(AVAILABLE_STRATEGIES.keys())}")
    
    return AVAILABLE_STRATEGIES[strategy_name]()

def get_default_strategy() -> BaseFrameStrategy:
    """Get the default strategy."""
    return AllObjectsStrategy()

__all__ = [
    'BaseFrameStrategy',
    'FrameGenerationContext',
    'AllObjectsStrategy',
    'DirectAnswerStrategy',
    'DorstsFrameStrategy',
    'AVAILABLE_STRATEGIES',
    'get_strategy',
    'get_default_strategy'
]