"""
Be My Eyes – Object detection tests (Python).
Uses a mock detector; replace with your YOLO+OpenCV module for real runs.
"""
import pytest

# Mock detector: maps frame id to list of labels (simulates YOLO output)
MOCK_DETECTOR = {
    "person_frame": ["person"],
    "empty_frame": [],
    "repeated_person_frame": ["person", "person", "person"],
    "unknown_frame": [],  # unknown objects ignored
}


def detect(frame_id: str) -> list:
    """Mock: return labels for frame. Replace with real YOLO inference."""
    raw = MOCK_DETECTOR.get(frame_id, [])
    # Dedupe: do not announce repeatedly
    seen = set()
    result = []
    for label in raw:
        if label not in seen:
            seen.add(label)
            result.append(label)
    return result


class TestObjectDetection:
    """Unit tests for object detection module."""

    def test_detect_person(self):
        """Input: camera frame containing a person. Expected: label 'person' returned."""
        labels = detect("person_frame")
        assert "person" in labels
        assert labels == ["person"]

    def test_unknown_object_ignored(self):
        """Input: frame with unknown object. Expected: object ignored."""
        labels = detect("unknown_frame")
        assert labels == []

    def test_repeated_object_not_announced_repeatedly(self):
        """Same object appearing repeatedly: do not announce repeatedly."""
        labels = detect("repeated_person_frame")
        assert labels == ["person"]
