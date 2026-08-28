from pathlib import Path
import sys

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import match_settings


def test_quick_score_config_matches_visible_multiplier():
    config = match_settings.quick_score_config("blitz", "alltime")
    assert config["timer_seconds"] == 10
    assert config["era_filter"] == "all"
    assert config["score_multiplier"] == 2.25
    assert config["points_per_correct"] == 225


def test_quick_since_2000_maps_to_real_bank_filter():
    config = match_settings.quick_score_config("standard", "2000s")
    assert config["era_filter"] == "since_2000"
    assert config["points_per_correct"] == 125


def test_quick_score_config_rejects_unknown_timer():
    with pytest.raises(HTTPException) as exc:
        match_settings.quick_score_config("coffee-break", "modern")
    assert exc.value.status_code == 400


def test_match_filter_applies_alias_difficulty_and_era():
    query = match_settings.MatchQuestionQuery(
        sports=["NBA", "nfl"],
        difficulty="normal",
        count=10,
        era_filter="2010s",
    )
    match = match_settings.build_match_filter(query, recent_ids={"q1"})
    assert match["status"] == "approved"
    assert match["$or"] == [
        {"$or": [{"sport": "basketball"}, {"category": "basketball"}]},
        {"$or": [{"sport": "nfl"}, {"category": "nfl"}]},
    ]
    assert match["difficulty"] == "medium"
    assert match["era"] == {"$in": ["2010s"]}
    assert match["id"] == {"$nin": ["q1"]}


def test_mixed_filter_does_not_pin_difficulty():
    query = match_settings.MatchQuestionQuery(
        sports=["mlb"],
        difficulty="mixed",
        count=5,
        era_filter="all",
    )
    match = match_settings.build_match_filter(query)
    assert "difficulty" not in match
    assert match["$or"] == [
        {"$or": [{"sport": "baseball"}, {"category": "baseball"}]}
    ]


def test_pre1990_filter_uses_historical_clause():
    query = match_settings.MatchQuestionQuery(
        sports=["golf"],
        difficulty="deepcut",
        count=5,
        era_filter="pre1990",
    )
    match = match_settings.build_match_filter(query)
    assert "$and" in match
    assert "$or" in match["$and"][0]


def test_lightning_mode_locks_timer_and_speed_scoring():
    settings = match_settings.validate_lobby_settings({
        "game_type": "lightning",
        "timer_seconds": 45,
        "speed_bonus_enabled": False,
        "selected_categories": ["nba"],
    })
    assert settings["timer_seconds"] == 10
    assert settings["speed_bonus_enabled"] is True


def test_streak_and_deepcut_modes_lock_their_core_rules():
    streak = match_settings.validate_lobby_settings({
        "game_type": "streak",
        "streak_bonus_enabled": False,
        "selected_categories": ["nfl"],
    })
    assert streak["streak_bonus_enabled"] is True

    deepcut = match_settings.validate_lobby_settings({
        "game_type": "deepcut",
        "difficulty": "casual",
        "selected_categories": ["golf"],
    })
    assert deepcut["difficulty"] == "deepcut"


def test_lobby_categories_match_question_bank_and_normalize_aliases():
    settings = match_settings.validate_lobby_settings({
        "selected_categories": ["basketball", "baseball", "hockey", "golf", "sports video games"],
    })
    assert settings["selected_categories"] == ["nba", "mlb", "nhl", "golf", "videogames"]


def test_unsupported_lobby_category_is_rejected():
    with pytest.raises(HTTPException) as exc:
        match_settings.validate_lobby_settings({"selected_categories": ["combat"]})
    assert exc.value.status_code == 400


def test_inactive_answer_formats_normalize_to_multiple_choice():
    settings = match_settings.validate_lobby_settings({
        "selected_categories": ["soccer"],
        "answer_format": "true_false",
    })
    assert settings["answer_format"] == "multiple_choice"
