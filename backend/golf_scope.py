"""Men's-PGA-only policy for DeepCut golf content.

The public Golf category is intentionally narrow: men's PGA Tour events, men's major
championships, Ryder Cup and Presidents Cup, plus directly connected players, courses,
caddies, equipment, records, qualifying and tour history. Women's golf, LIV-only content,
amateur/college golf and unrelated international tours are excluded.

This module is installed by ``match_settings`` so the policy covers question selection,
AI campaign generation and a one-time cleanup of legacy golf records.
"""

from __future__ import annotations

from datetime import datetime, timezone
from functools import wraps
from typing import Any, Iterable

import question_bank
import question_bank_v2


SCOPE_VERSION = 1
MENS_PGA_SCOPE = "mens_pga"
MENS_PGA_TAG = "mens_pga"
MENS_PGA_SUBCATEGORY = "mens_pga"
MENS_PGA_LEAGUE = "men's pga"
MENS_PGA_PROMPT_SCOPE = (
    "men's PGA golf only: PGA Tour events, the men's Masters, U.S. Open, Open Championship, "
    "PGA Championship, Players Championship, FedEx Cup, Ryder Cup and Presidents Cup, plus "
    "directly connected players, courses, caddies, equipment, records, qualifying and tour history; "
    "exclude LPGA and all women's events, LIV-only material, amateur golf, college golf and unrelated "
    "international tours"
)
MENS_PGA_TAGS = {MENS_PGA_TAG, "pga_tour", "mens_golf", "golf_scope_v1"}

# Women's markers take precedence over general strings such as "PGA Championship".
WOMENS_GOLF_MARKERS = (
    "lpga",
    "women's golf",
    "womens golf",
    "women golfer",
    "women golfers",
    "women's pga",
    "womens pga",
    "u.s. women's open",
    "us women's open",
    "us womens open",
    "women's open",
    "womens open",
    "solheim cup",
    "chevron championship",
    "ana inspiration",
    "evian championship",
    "du maurier classic",
)

MENS_PGA_MARKERS = (
    "pga tour",
    "fedex cup",
    "fedexcup",
    "tour championship",
    "players championship",
    "the players",
    "tpc sawgrass",
    "the masters",
    "masters tournament",
    "augusta national",
    "u.s. open",
    "us open",
    "united states open",
    "open championship",
    "british open",
    "pga championship",
    "ryder cup",
    "presidents cup",
    "arnold palmer invitational",
    "the memorial tournament",
    "memorial tournament",
    "pebble beach pro-am",
    "genesis invitational",
    "wells fargo championship",
    "travelers championship",
    "valero texas open",
    "farmers insurance open",
    "wm phoenix open",
    "zurich classic",
    "rbc heritage",
    "rocket mortgage classic",
    "john deere classic",
    "tpc ",
    "pga national",
    "muirfield village",
    "bay hill",
    "torrey pines",
    "pinehurst",
    "oakmont",
    "bethpage",
    "whistling straits",
    "shinnecock",
    "valhalla",
    "oak hill",
    "medinah",
    "hazeltine",
    "men's major",
    "mens major",
)

OUTSIDE_TOUR_MARKERS = (
    "liv golf",
    "liv event",
    "liv league",
    "dp world tour",
    "european tour",
    "asian tour",
    "sunshine tour",
    "japan golf tour",
    "australasian tour",
    "korn ferry tour",
    "web.com tour",
    "nationwide tour",
    "college golf",
    "ncaa golf",
    "u.s. amateur",
    "us amateur",
    "amateur championship",
    "walker cup",
)

_INSTALLED = False
_ORIGINAL_GENERATE_ROWS = None
_ORIGINAL_ENHANCED_DOC = None
_ORIGINAL_ENSURE_INDEXES = None
_ORIGINAL_BUILD_FILTER = None


def _normalized_tags(row: dict[str, Any]) -> set[str]:
    return {str(tag).strip().lower() for tag in (row.get("tags") or []) if str(tag).strip()}


def _scope_text(row: dict[str, Any]) -> str:
    values: list[str] = []
    for key in (
        "question",
        "correct_answer",
        "explanation",
        "source",
        "subcategory",
        "league",
        "season",
        "review_note",
    ):
        value = row.get(key)
        if value:
            values.append(str(value))
    for key in ("incorrect_answers", "teams", "players", "tags"):
        value = row.get(key)
        if isinstance(value, (list, tuple, set)):
            values.extend(str(item) for item in value if item)
        elif value:
            values.append(str(value))
    return " ".join(values).lower().replace("’", "'")


def is_golf(row: dict[str, Any]) -> bool:
    sport = question_bank.canonical_sport(str(row.get("sport") or row.get("category") or ""))
    return sport == "golf"


def explicitly_in_scope(row: dict[str, Any]) -> bool:
    if row.get("golf_scope") == MENS_PGA_SCOPE or MENS_PGA_TAG in _normalized_tags(row):
        return True
    text = _scope_text(row)
    if any(marker in text for marker in WOMENS_GOLF_MARKERS):
        return False
    return any(marker in text for marker in MENS_PGA_MARKERS)


def explicitly_excluded(row: dict[str, Any]) -> bool:
    text = _scope_text(row)
    if any(marker in text for marker in WOMENS_GOLF_MARKERS):
        return True
    # A major/PGA-connected fact may mention a rival tour. Keep it when the direct
    # PGA connection is explicit; exclude tour-only material.
    return any(marker in text for marker in OUTSIDE_TOUR_MARKERS) and not explicitly_in_scope(row)


def classify_golf_question(row: dict[str, Any]) -> str:
    if not is_golf(row):
        return "not_golf"
    if explicitly_excluded(row):
        return "excluded"
    if explicitly_in_scope(row):
        return MENS_PGA_SCOPE
    return "review"


def scoped_sport_branches(sports: Iterable[str]) -> list[dict[str, Any]]:
    """Build Mongo branches that apply the PGA scope only to the Golf branch."""
    branches: list[dict[str, Any]] = []
    seen: set[str] = set()
    for value in sports:
        sport = question_bank.canonical_sport(value)
        if not sport or sport in seen:
            continue
        seen.add(sport)
        base = {"$or": [{"sport": sport}, {"category": sport}]}
        if sport == "golf":
            branches.append(
                {
                    "$and": [
                        base,
                        {
                            "$or": [
                                {"golf_scope": MENS_PGA_SCOPE},
                                {"tags": MENS_PGA_TAG},
                            ]
                        },
                    ]
                }
            )
        else:
            branches.append(base)
    return branches


def scope_generated_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Tag scoped golf drafts and reject any clearly out-of-policy model output."""
    scoped: list[dict[str, Any]] = []
    for raw in rows:
        row = dict(raw)
        if not is_golf(row):
            scoped.append(row)
            continue
        if explicitly_excluded(row):
            continue
        row["subcategory"] = MENS_PGA_SUBCATEGORY
        row["league"] = MENS_PGA_LEAGUE
        row["tags"] = sorted(_normalized_tags(row) | MENS_PGA_TAGS)
        row["golf_scope"] = MENS_PGA_SCOPE
        row["golf_scope_version"] = SCOPE_VERSION
        scoped.append(row)
    return scoped


def _scoped_build_filter(query, *, include_status: bool = True) -> dict[str, Any]:
    match = _ORIGINAL_BUILD_FILTER(query, include_status=include_status)
    match["$or"] = scoped_sport_branches(query.sports)
    return match


def _scoped_enhanced_doc(row: dict[str, Any], *, campaign_id=None) -> dict[str, Any]:
    doc = _ORIGINAL_ENHANCED_DOC(row, campaign_id=campaign_id)
    if not is_golf(doc):
        return doc
    scope = classify_golf_question(row)
    tags = _normalized_tags(doc)
    if scope == MENS_PGA_SCOPE:
        tags |= MENS_PGA_TAGS
        doc["subcategory"] = MENS_PGA_SUBCATEGORY
        doc["league"] = MENS_PGA_LEAGUE
    elif scope == "excluded":
        doc["status"] = "archived"
        doc["verification_status"] = "needs_review"
        doc["retired_reason"] = "Outside DeepCut's men's-PGA-only golf scope"
    else:
        doc["verification_status"] = "needs_review"
        doc["review_note"] = "Golf scope is ambiguous; confirm a direct men's PGA connection before approval."
    doc["tags"] = sorted(tags)
    doc["golf_scope"] = scope
    doc["golf_scope_version"] = SCOPE_VERSION
    return doc


async def _scoped_generate_rows(*args, **kwargs):
    sport = question_bank.canonical_sport(str(kwargs.get("sport") or ""))
    if sport == "golf":
        kwargs = dict(kwargs)
        kwargs["subcategory"] = MENS_PGA_PROMPT_SCOPE
        kwargs["league"] = MENS_PGA_LEAGUE
        kwargs["tags"] = sorted(
            {str(tag).strip().lower() for tag in (kwargs.get("tags") or []) if str(tag).strip()}
            | MENS_PGA_TAGS
        )
    rows = await _ORIGINAL_GENERATE_ROWS(*args, **kwargs)
    return scope_generated_rows(rows) if sport == "golf" else rows


async def reconcile_existing_golf(db) -> dict[str, int]:
    """One-time conservative cleanup of legacy golf records and campaign slices."""
    now = datetime.now(timezone.utc)
    query = {
        "$and": [
            {"$or": [{"sport": "golf"}, {"category": "golf"}]},
            {"golf_scope_version": {"$ne": SCOPE_VERSION}},
        ]
    }
    docs = await db.question_bank.find(query, {"_id": 0}).to_list(10000)
    counts = {MENS_PGA_SCOPE: 0, "excluded": 0, "review": 0}

    for doc in docs:
        scope = classify_golf_question(doc)
        counts[scope] = counts.get(scope, 0) + 1
        tags = _normalized_tags(doc)
        updates: dict[str, Any] = {
            "golf_scope": scope,
            "golf_scope_version": SCOPE_VERSION,
            "updated_at": now,
        }
        if scope == MENS_PGA_SCOPE:
            tags |= MENS_PGA_TAGS
            updates.update(
                {
                    "tags": sorted(tags),
                    "subcategory": MENS_PGA_SUBCATEGORY,
                }
            )
        elif scope == "excluded":
            updates.update(
                {
                    "status": "archived",
                    "verification_status": "needs_review",
                    "retired_reason": "Outside DeepCut's men's-PGA-only golf scope",
                    "review_note": "Automatically removed from the playable golf bank by scope policy.",
                }
            )
        else:
            updates["review_note"] = (
                "Golf scope is ambiguous; confirm a direct men's PGA connection before approval."
            )
            if doc.get("status") == "approved":
                updates["status"] = "flagged"
                updates["verification_status"] = "needs_review"
        await db.question_bank.update_one({"id": doc.get("id")}, {"$set": updates})

    campaigns = await db.question_campaigns.find(
        {"sport": "golf", "golf_scope_version": {"$ne": SCOPE_VERSION}},
        {"_id": 0},
    ).to_list(1000)
    for campaign in campaigns:
        slices = []
        for raw_slice in campaign.get("slices") or []:
            item = dict(raw_slice)
            item["subcategory"] = MENS_PGA_PROMPT_SCOPE
            item["league"] = MENS_PGA_LEAGUE
            item["tags"] = sorted(
                {str(tag).strip().lower() for tag in (item.get("tags") or []) if str(tag).strip()}
                | MENS_PGA_TAGS
            )
            slices.append(item)
        await db.question_campaigns.update_one(
            {"id": campaign.get("id")},
            {
                "$set": {
                    "slices": slices,
                    "golf_scope": MENS_PGA_SCOPE,
                    "golf_scope_version": SCOPE_VERSION,
                    "scope_note": "Men's PGA only",
                    "updated_at": now,
                }
            },
        )

    if docs:
        question_bank.clear_cache()
    return counts


async def _scoped_ensure_indexes(db) -> None:
    await _ORIGINAL_ENSURE_INDEXES(db)
    await db.question_bank.create_index(
        [("status", 1), ("sport", 1), ("golf_scope", 1), ("difficulty", 1)]
    )
    await reconcile_existing_golf(db)


def install() -> None:
    """Install the policy once; safe to call repeatedly during imports/tests."""
    global _INSTALLED
    global _ORIGINAL_GENERATE_ROWS, _ORIGINAL_ENHANCED_DOC, _ORIGINAL_ENSURE_INDEXES, _ORIGINAL_BUILD_FILTER
    if _INSTALLED:
        return

    _ORIGINAL_GENERATE_ROWS = question_bank_v2.generate_rows
    _ORIGINAL_ENHANCED_DOC = question_bank_v2._enhanced_doc
    _ORIGINAL_ENSURE_INDEXES = question_bank.ensure_indexes
    _ORIGINAL_BUILD_FILTER = question_bank.build_filter

    question_bank_v2.generate_rows = wraps(_ORIGINAL_GENERATE_ROWS)(_scoped_generate_rows)
    question_bank_v2._enhanced_doc = wraps(_ORIGINAL_ENHANCED_DOC)(_scoped_enhanced_doc)
    question_bank.ensure_indexes = wraps(_ORIGINAL_ENSURE_INDEXES)(_scoped_ensure_indexes)
    question_bank.build_filter = wraps(_ORIGINAL_BUILD_FILTER)(_scoped_build_filter)
    _INSTALLED = True
