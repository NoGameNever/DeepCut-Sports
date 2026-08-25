import pytest
from fastapi import HTTPException

import question_bank_v2 as qb2


def test_campaign_slices_build_default_target():
    body = qb2.CampaignCreate(
        name="NBA Deep Cuts",
        sport="basketball",
        target_count=500,
        difficulty="deepcut",
        subcategory="bench legends",
        tags=["nba"],
    )
    slices = qb2._campaign_slices(body)
    assert len(slices) == 1
    assert slices[0]["count"] == 500
    assert slices[0]["difficulty"] == "deepcut"
    assert slices[0]["generated_count"] == 0


def test_campaign_slices_support_breakdown():
    body = qb2.CampaignCreate(
        name="NBA 1995-2005",
        sport="basketball",
        slices=[
            qb2.CampaignSlice(name="role players", count=100, difficulty="hard"),
            qb2.CampaignSlice(name="playoffs", count=75, difficulty="deepcut"),
        ],
    )
    slices = qb2._campaign_slices(body)
    assert sum(item["count"] for item in slices) == 175
    assert [item["name"] for item in slices] == ["role players", "playoffs"]


def test_campaign_requires_target_or_slices():
    body = qb2.CampaignCreate(name="Empty campaign", sport="basketball")
    with pytest.raises(HTTPException):
        qb2._campaign_slices(body)


def test_enhanced_doc_has_review_and_quality_defaults():
    doc = qb2._enhanced_doc({
        "sport": "nba",
        "subcategory": "bench legends",
        "difficulty": "deepcut",
        "question": "Which reserve guard appeared in the 2001 Finals for Team X?",
        "correct_answer": "Player A",
        "incorrect_answers": ["Player B", "Player C", "Player D"],
        "explanation": "Player A was on the roster.",
        "tags": ["Playoffs", "NBA"],
        "source": "Official 2001 Finals gamebook",
        "source_url": "",
        "era": "2000s",
        "league": "NBA",
        "season": "2000-01",
        "teams": ["Team X"],
        "players": ["Player A"],
        "factual_confidence": 0.91,
    }, campaign_id="qcamp_test")
    assert doc["sport"] == "basketball"
    assert doc["verification_status"] == "needs_review"
    assert doc["answer_count"] == 0
    assert doc["correct_count"] == 0
    assert doc["report_count"] == 0
    assert doc["campaign_id"] == "qcamp_test"
    assert doc["factual_confidence"] == 0.91


def test_question_patch_rejects_bad_verification_status():
    with pytest.raises(ValueError):
        qb2.QuestionPatch(verification_status="probably")


def test_review_body_accepts_flagged_and_verified():
    body = qb2.ReviewBody(status="flagged", verification_status="verified", review_note="Recheck wording")
    assert body.status == "flagged"
    assert body.verification_status == "verified"


def test_clean_list_dedupes_and_removes_blanks():
    assert qb2._clean_list([" Celtics ", "", "Celtics", "Lakers"]) == ["Celtics", "Lakers"]
