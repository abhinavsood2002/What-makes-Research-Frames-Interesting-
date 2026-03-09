"""
Full pairwise comparison ranking module for exactly 9 frames.
Generates all 36 possible pairwise comparisons.
"""
from typing import List, Dict, Tuple


class PairwiseRankingSystem:
    """Full pairwise comparison system for exactly 9 frames."""

    def __init__(self, frame_ids: List[int]):
        if len(frame_ids) != 9:
            raise ValueError(f"PairwiseRankingSystem requires exactly 9 frames, got {len(frame_ids)}")

        self.frame_ids = frame_ids
        self.wins = {frame_id: 0 for frame_id in frame_ids}
        self.comparisons: List[Dict[str, int]] = []

    def generate_all_pairings(self) -> List[Tuple[int, int]]:
        """Generate all possible pairwise comparisons for 9 frames (36 total)."""
        all_pairings = []

        # Generate all unique pairs
        for i in range(len(self.frame_ids)):
            for j in range(i + 1, len(self.frame_ids)):
                frame1 = self.frame_ids[i]
                frame2 = self.frame_ids[j]
                all_pairings.append((frame1, frame2))

        return all_pairings

    def record_comparison_result(self, winner_id: int, loser_id: int):
        """Record the result of a comparison."""
        self.wins[winner_id] += 1
        self.comparisons.append({
            "winner": winner_id,
            "loser": loser_id
        })

    def calculate_final_rankings(self) -> List[Dict[str, int]]:
        """Calculate final rankings based on wins."""
        # Sort frames by wins (descending), then by frame_id for consistent tie-breaking
        sorted_frames = sorted(
            self.frame_ids,
            key=lambda x: (self.wins[x], -x),  # More wins first, then lower ID for ties
            reverse=True
        )

        rankings = []
        for rank, frame_id in enumerate(sorted_frames, 1):
            rankings.append({
                "frame_id": frame_id,
                "rank_position": rank,
                "wins": self.wins[frame_id]
            })

        return rankings


def get_frames_for_ranking(frames: List[Dict], categories: Dict[int, str]) -> List[int]:
    """
    Get exactly 9 frames for pairwise ranking.
    Only accepts exactly 9 frames categorized as 'interesting'.
    """
    interesting_frames = []

    for frame in frames:
        frame_id = frame['id']
        category = categories.get(frame_id)

        if category == 'interesting':
            interesting_frames.append(frame_id)

    # Must have exactly 9 frames
    total_frames = len(interesting_frames)
    if total_frames != 9:
        raise ValueError(f"Pairwise ranking requires exactly 9 interesting frames, found {total_frames}.")

    return interesting_frames


# Legacy function for backward compatibility - now requires exactly 9 frames
def get_top_10_frames_for_ranking(frames: List[Dict], categories: Dict[int, str]) -> List[int]:
    """Legacy function - now requires exactly 9 frames for pairwise comparison."""
    return get_frames_for_ranking(frames, categories)