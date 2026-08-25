from pathlib import Path
import sys

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import beta_release


def test_mixed_filter_accepts_aliases_and_does_not_pin_difficulty():
    match = beta_release.build_mixed_filter(["nba", "NFL"], recent_ids={"q1", "q2"})
    assert match["status"] == "approved"
    assert "difficulty" not in match
    assert match["$or"][0]["sport"]["$in"] == ["basketball", "nfl"]
    assert set(match["id"]["$nin"]) == {"q1", "q2"}


def test_mixed_filter_rejects_empty_or_unknown_sports():
    with pytest.raises(HTTPException) as exc:
        beta_release.build_mixed_filter(["underwater basket weaving"])
    assert exc.value.status_code == 400


def test_feedback_body_normalizes_type():
    body = beta_release.BetaFeedbackBody(feedback_type=" BUG ", message="Timer stopped on question three")
    assert body.feedback_type == "bug"


def test_feedback_body_rejects_unknown_type():
    with pytest.raises(ValueError):
        beta_release.BetaFeedbackBody(feedback_type="compliment", message="Nice")


def test_feedback_patch_accepts_supported_status():
    patch = beta_release.BetaFeedbackPatch(status="RESOLVED", admin_note="Fixed in next deploy")
    assert patch.status == "resolved"
