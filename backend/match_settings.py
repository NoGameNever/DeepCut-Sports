"""Authoritative match-setting rules shared by quick play and private lobbies.

This module keeps the user-facing controls honest: filters are applied to the approved
question bank, quick-play score multipliers are calculated server-side, and lobby modes
normalize to concrete gameplay rules instead of acting as labels only.
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import HTTPException
from pydantic import BaseModel, Field

import question_bank


BASE_QUIZ_POINTS = 100

QUICK_TIMER_CONFIG: dict[str, dict[str, float | int]] = {
    "blitz": {"seconds": 10, "multiplier": 1.5},
    "standard": {"seconds": 15, "multiplier": 1.0},
    "chill": {"seconds": 20, "multiplier": 0.75},
}

QUICK_ERA_CONFIG: dict[str, dict[str, float | str]] = {
    "modern": {"filter": "recent", "multiplier": 1.0},
    "2000s": {"filter": "since_2000", "multiplier": 1.25},
    "alltime": {"filter": "all", "multiplier": 1.5},
}

ERA_VALUE_FILTERS: dict[str, list[str]] = {
    "recent": ["2010s", "2020s", "current", "modern"],
    "since_2000": ["2000s", "2010s", "2020s", "current", "modern"],
    "current": ["current", "2020s"],
    "2020s": ["2020s", "current"],
    "2010s": ["2010s"],
    "2000s": ["2000s"],
    "1990s": ["1990s"],
}

LOBBY_GAME_TYPES = {"classic", "lightning", "streak", "deepcut"}
LOBBY_DIFFICULTIES = {"casual", "normal", "hard", "expert", "deepcut", "mixed"}
LOBBY_ERAS = {"all", "current", "2020s", "2010s", "2000s", "1990s", "pre1990"}
LOBBY_SUBCATEGORIES = {
    "player_stats",
    "awards",
    "championships",
    "drafts",
    "trades",
    "jersey_numbers",
    "stadiums",
    "teams_played_for",
    "role_players",
    "current_season",
    "historical_eras",
}
LOBBY_CATEGORY_ALIASES = {
    "nba": "nba",
    "basketball": "nba",
    "nfl": "nfl",
    "football": "nfl",
    "mlb": "mlb",
    "baseball": "mlb",
    "nhl": "nhl",
    "hockey": "nhl",
    "soccer": "soccer",
    "football/soccer": "soccer",
    "golf": "golf",
    "pga": "golf",
    "videogames": "videogames",
    "video games": "videogames",
    "sports video games": "videogames",
    "general": "general",
}
LOBBY_CATEGORIES = set(LOBBY_CATEGORY_ALIASES.values())

DEFAULT_LOBBY_SETTINGS: dict[str, Any] = {
    "game_type": "classic",
    "question_count": 10,
    "difficulty": "normal",
    "selected_categories": ["general"],
    "selected_subcategories": [],
    "era_filter": "all",
    "answer_format": "multiple_choice",
    "timer_seconds": 15,
    "speed_bonus_enabled": True,
    "streak_bonus_enabled": True,
    "wrong_answer_penalty_enabled": False,
    "final_question_multiplier_enabled": False,
    "max_players": 4,
    "friends_only": False,
    "invite_only": True,
    "allow_rematch": True,
    "allow_spectators": False,
    "settings_locked": False,
}


class MatchQuestionQuery(BaseModel):
    sports: list[str]
    difficulty: str
    count: int = Field(default=7, ge=3, le=50)
    subcategories: list[str] = Field(default_factory=list)
    era_filter: Optional[str] = None
    answer_format: str = "multiple_choice"


def quick_score_config(timer: str, era: str) -> dict[str, Any]:
    timer_key = str(timer or "").strip().lower()
    era_key = str(era or "").strip().lower()
    if timer_key not in QUICK_TIMER_CONFIG:
        raise HTTPException(status_code=400, detail="Invalid timer setting")
    if era_key not in QUICK_ERA_CONFIG:
        raise HTTPException(status_code=400, detail="Invalid era setting")

    timer_config = QUICK_TIMER_CONFIG[timer_key]
    era_config = QUICK_ERA_CONFIG[era_key]
    multiplier = float(timer_config["multiplier"]) * float(era_config["multiplier"])
    return {
        "timer": timer_key,
        "timer_seconds": int(timer_config["seconds"]),
        "era": era_key,
        "era_filter": str(era_config["filter"]),
        "score_multiplier": round(multiplier, 3),
        "points_per_correct": int(round(BASE_QUIZ_POINTS * multiplier)),
    }


def quick_era_filter(era: str) -> str:
    return str(quick_score_config("standard", era)["era_filter"])


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "on"}:
            return True
        if normalized in {"false", "0", "no", "off", ""}:
            return False
    return bool(value)


def validate_lobby_settings(raw: Optional[dict], base: Optional[dict] = None) -> dict[str, Any]:
    """Validate and normalize private-lobby settings.

    Lightning always means a 10-second round with speed scoring. Streak always enables
    combo scoring. Deep Cut always locks the effective difficulty to DeepCut. Unsupported
    legacy answer formats are safely normalized to multiple choice rather than silently
    producing a different format.
    """
    incoming = dict(raw or {})
    settings = dict(DEFAULT_LOBBY_SETTINGS)
    if base:
        for key, value in base.items():
            if key in settings:
                settings[key] = value
    for key, value in incoming.items():
        if key in settings and key != "settings_locked":
            settings[key] = value

    game_type = str(settings.get("game_type") or "").strip().lower()
    if game_type not in LOBBY_GAME_TYPES:
        raise HTTPException(status_code=400, detail="Invalid game type")
    settings["game_type"] = game_type

    try:
        settings["question_count"] = int(settings["question_count"])
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid question count")
    if not 5 <= settings["question_count"] <= 50:
        raise HTTPException(status_code=400, detail="Question count must be between 5 and 50")

    difficulty = str(settings.get("difficulty") or "").strip().lower()
    if difficulty not in LOBBY_DIFFICULTIES:
        raise HTTPException(status_code=400, detail="Invalid difficulty")
    settings["difficulty"] = difficulty

    raw_categories = settings.get("selected_categories")
    if not isinstance(raw_categories, list) or not raw_categories:
        raise HTTPException(status_code=400, detail="Select at least one category")
    normalized_categories: list[str] = []
    invalid_categories: list[str] = []
    for value in raw_categories:
        key = str(value or "").strip().lower()
        normalized = LOBBY_CATEGORY_ALIASES.get(key)
        if not normalized:
            invalid_categories.append(key or "blank")
        elif normalized not in normalized_categories:
            normalized_categories.append(normalized)
    if invalid_categories:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported categories: {', '.join(invalid_categories)}",
        )
    settings["selected_categories"] = normalized_categories

    subcategories = settings.get("selected_subcategories") or []
    if not isinstance(subcategories, list):
        raise HTTPException(status_code=400, detail="Invalid subcategory selection")
    normalized_subcategories = [str(value).strip().lower() for value in subcategories if str(value).strip()]
    if any(value not in LOBBY_SUBCATEGORIES for value in normalized_subcategories):
        raise HTTPException(status_code=400, detail="Invalid subcategory selected")
    settings["selected_subcategories"] = list(dict.fromkeys(normalized_subcategories))

    era_filter = str(settings.get("era_filter") or "").strip().lower()
    if era_filter not in LOBBY_ERAS:
        raise HTTPException(status_code=400, detail="Invalid era filter")
    settings["era_filter"] = era_filter

    answer_format = str(settings.get("answer_format") or "multiple_choice").strip().lower()
    if answer_format != "multiple_choice":
        answer_format = "multiple_choice"
    settings["answer_format"] = answer_format

    try:
        settings["timer_seconds"] = int(settings["timer_seconds"])
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid timer")
    if settings["timer_seconds"] != 0 and not 5 <= settings["timer_seconds"] <= 120:
        raise HTTPException(status_code=400, detail="Timer must be 0 or between 5 and 120 seconds")

    try:
        settings["max_players"] = int(settings["max_players"])
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid max players")
    if not 2 <= settings["max_players"] <= 4:
        raise HTTPException(status_code=400, detail="Max players must be between 2 and 4")

    for key in (
        "speed_bonus_enabled",
        "streak_bonus_enabled",
        "wrong_answer_penalty_enabled",
        "final_question_multiplier_enabled",
        "friends_only",
        "invite_only",
        "allow_rematch",
        "allow_spectators",
    ):
        settings[key] = _as_bool(settings[key])

    if game_type == "lightning":
        settings["timer_seconds"] = 10
        settings["speed_bonus_enabled"] = True
    elif game_type == "streak":
        settings["streak_bonus_enabled"] = True
    elif game_type == "deepcut":
        settings["difficulty"] = "deepcut"

    settings["settings_locked"] = bool(base.get("settings_locked")) if base else False
    return settings


def _era_clause(era_filter: Optional[str]) -> Optional[dict[str, Any]]:
    normalized = str(era_filter or "all").strip().lower()
    if normalized in {"", "all", "alltime"}:
        return None
    if normalized == "pre1990":
        return {
            "$or": [
                {"era": {"$in": ["pre1990", "pre-1990", "pre 1990"]}},
                {"era": {"$regex": r"^(18\d0s|19[0-8]0s)$", "$options": "i"}},
            ]
        }
    values = ERA_VALUE_FILTERS.get(normalized)
    if not values:
        raise HTTPException(status_code=400, detail="Invalid era filter")
    return {"era": {"$in": values}}


def build_match_filter(
    query: MatchQuestionQuery,
    *,
    recent_ids: Optional[set[str]] = None,
) -> dict[str, Any]:
    valid_sports = set(question_bank.CATEGORY_ALIASES.values())
    sports: list[str] = []
    for value in query.sports:
        canonical = question_bank.canonical_sport(value)
        if canonical and canonical in valid_sports and canonical not in sports:
            sports.append(canonical)
    if not sports:
        raise HTTPException(status_code=400, detail="At least one valid sport is required")

    match: dict[str, Any] = {
        "status": "approved",
        "$or": [{"sport": {"$in": sports}}, {"category": {"$in": sports}}],
    }

    raw_difficulty = str(query.difficulty or "").strip().lower()
    if raw_difficulty != "mixed":
        difficulty = question_bank.canonical_difficulty(raw_difficulty)
        if difficulty not in {"easy", "medium", "hard", "deepcut"}:
            raise HTTPException(status_code=400, detail="Invalid difficulty")
        match["difficulty"] = difficulty

    if query.subcategories:
        match["subcategory"] = {
            "$in": [str(value).strip().lower() for value in query.subcategories if str(value).strip()]
        }

    era_clause = _era_clause(query.era_filter)
    if era_clause:
        if "$or" in era_clause:
            match.setdefault("$and", []).append(era_clause)
        else:
            match.update(era_clause)

    if recent_ids:
        match["id"] = {"$nin": list(recent_ids)}
    return match


async def fetch_match_questions(db, query: MatchQuestionQuery, *, user_id: str) -> list[dict[str, Any]]:
    """Return exactly the requested number of approved questions or fail clearly."""
    count = max(3, min(int(query.count), 50))
    recent = await question_bank.recent_question_ids(db, user_id)
    sample_size = max(count * 8, 80)

    pool = await db.question_bank.aggregate(
        [
            {"$match": build_match_filter(query, recent_ids=recent)},
            {"$sample": {"size": sample_size}},
        ]
    ).to_list(sample_size)

    if len(pool) < count:
        fallback_size = max(count * 4, 40)
        fallback = await db.question_bank.aggregate(
            [
                {"$match": build_match_filter(query)},
                {"$sample": {"size": fallback_size}},
            ]
        ).to_list(fallback_size)
        seen = {str(item.get("id")) for item in pool}
        for item in fallback:
            item_id = str(item.get("id"))
            if item_id and item_id not in seen:
                pool.append(item)
                seen.add(item_id)
            if len(pool) >= count:
                break

    selected = pool[:count]
    if len(selected) < count:
        raise HTTPException(
            status_code=503,
            detail=(
                f"Only {len(selected)} approved questions match these settings; "
                f"{count} are required. Broaden the sport, era, or difficulty."
            ),
        )

    await question_bank.record_serves(db, user_id, selected)
    return [question_bank.question_to_game_payload(item) for item in selected]
