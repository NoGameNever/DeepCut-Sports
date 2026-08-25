"""Closed-beta support for DeepCut Sports.

The beta layer intentionally stays small: it provides a safe mixed-difficulty question
selector for the limited pilot bank and a first-party feedback inbox. It does not weaken
normal question approval rules or client/server score authority.
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from fastapi import Header, HTTPException
from pydantic import BaseModel, Field, field_validator

import question_bank

FEEDBACK_TYPES = {"bug", "question", "idea", "other"}
FEEDBACK_STATUSES = {"open", "reviewed", "resolved"}


class BetaFeedbackBody(BaseModel):
    feedback_type: str = "bug"
    message: str = Field(..., min_length=3, max_length=2000)
    screen: Optional[str] = Field(default=None, max_length=200)
    user_agent: Optional[str] = Field(default=None, max_length=500)
    app_version: Optional[str] = Field(default=None, max_length=80)
    question_id: Optional[str] = Field(default=None, max_length=100)
    quiz_session_id: Optional[str] = Field(default=None, max_length=120)

    @field_validator("feedback_type", mode="before")
    @classmethod
    def validate_type(cls, value):
        normalized = str(value or "bug").strip().lower()
        if normalized not in FEEDBACK_TYPES:
            raise ValueError("Invalid feedback type")
        return normalized


class BetaFeedbackPatch(BaseModel):
    status: str
    admin_note: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("status", mode="before")
    @classmethod
    def validate_status(cls, value):
        normalized = str(value or "").strip().lower()
        if normalized not in FEEDBACK_STATUSES:
            raise ValueError("Invalid feedback status")
        return normalized


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _canonical_sports(values: list[str]) -> list[str]:
    sports = []
    for value in values:
        sport = question_bank.canonical_sport(value)
        if sport and sport in set(question_bank.CATEGORY_ALIASES.values()) and sport not in sports:
            sports.append(sport)
    return sports


def build_mixed_filter(sports: list[str], *, recent_ids: Optional[set[str]] = None) -> dict[str, Any]:
    canonical = _canonical_sports(sports)
    if not canonical:
        raise HTTPException(status_code=400, detail="At least one valid sport is required")
    match: dict[str, Any] = {
        "status": "approved",
        "$or": [{"sport": {"$in": canonical}}, {"category": {"$in": canonical}}],
    }
    if recent_ids:
        match["id"] = {"$nin": list(recent_ids)}
    return match


async def fetch_mixed_questions(db, *, sports: list[str], count: int, user_id: str) -> list[dict[str, Any]]:
    """Serve approved questions across every stored difficulty.

    Mixed mode exists for the closed alpha because the pilot bank has enough questions per
    sport overall, but not enough in every individual difficulty bucket. Recent-question
    avoidance is preserved and relaxed only when necessary to complete a match.
    """
    count = max(3, min(int(count), 30))
    recent = await question_bank.recent_question_ids(db, user_id)
    sample_size = max(count * 6, 40)

    pool = await db.question_bank.aggregate(
        [
            {"$match": build_mixed_filter(sports, recent_ids=recent)},
            {"$sample": {"size": sample_size}},
        ]
    ).to_list(sample_size)

    if len(pool) < count:
        fallback = await db.question_bank.aggregate(
            [
                {"$match": build_mixed_filter(sports)},
                {"$sample": {"size": max(count * 2, 20)}},
            ]
        ).to_list(max(count * 2, 20))
        seen = {str(item.get("id")) for item in pool}
        pool.extend(item for item in fallback if str(item.get("id")) not in seen)

    selected = pool[:count]
    if len(selected) < min(count, 3):
        raise HTTPException(status_code=503, detail="Not enough approved questions match those sports yet")

    await question_bank.record_serves(db, user_id, selected)
    return [question_bank.question_to_game_payload(item) for item in selected]


def register_routes(api_router, *, db, get_current_user: Callable) -> None:
    @api_router.post("/beta/feedback")
    async def submit_beta_feedback(body: BetaFeedbackBody, authorization: Optional[str] = Header(None)):
        user = await get_current_user(authorization)
        now = utcnow()
        doc = {
            "id": f"feedback_{uuid.uuid4().hex[:18]}",
            "user_id": user.get("user_id"),
            "email": user.get("email"),
            "username": user.get("username") or user.get("name"),
            "feedback_type": body.feedback_type,
            "message": body.message.strip(),
            "screen": (body.screen or "").strip() or None,
            "user_agent": (body.user_agent or "").strip() or None,
            "app_version": (body.app_version or "").strip() or None,
            "question_id": (body.question_id or "").strip() or None,
            "quiz_session_id": (body.quiz_session_id or "").strip() or None,
            "status": "open",
            "admin_note": None,
            "created_at": now,
            "updated_at": now,
        }
        await db.beta_feedback.insert_one(doc)
        return {"submitted": True, "id": doc["id"]}

    @api_router.get("/admin/v2/beta-feedback")
    async def list_beta_feedback(
        status: str = "open",
        feedback_type: Optional[str] = None,
        limit: int = 100,
        skip: int = 0,
        authorization: Optional[str] = Header(None),
    ):
        user = await get_current_user(authorization)
        await question_bank.require_admin(user)
        match: dict[str, Any] = {}
        if status != "all":
            if status not in FEEDBACK_STATUSES:
                raise HTTPException(status_code=400, detail="Invalid feedback status")
            match["status"] = status
        if feedback_type:
            normalized_type = feedback_type.strip().lower()
            if normalized_type not in FEEDBACK_TYPES:
                raise HTTPException(status_code=400, detail="Invalid feedback type")
            match["feedback_type"] = normalized_type
        capped = max(1, min(int(limit), 500))
        offset = max(int(skip), 0)
        items = await db.beta_feedback.find(match, {"_id": 0}).sort("created_at", -1).skip(offset).limit(capped).to_list(capped)
        total = await db.beta_feedback.count_documents(match)
        return {"items": items, "total": total, "limit": capped, "skip": offset}

    @api_router.patch("/admin/v2/beta-feedback/{feedback_id}")
    async def update_beta_feedback(
        feedback_id: str,
        body: BetaFeedbackPatch,
        authorization: Optional[str] = Header(None),
    ):
        user = await get_current_user(authorization)
        await question_bank.require_admin(user)
        result = await db.beta_feedback.update_one(
            {"id": feedback_id},
            {
                "$set": {
                    "status": body.status,
                    "admin_note": body.admin_note,
                    "reviewed_by": user.get("user_id"),
                    "updated_at": utcnow(),
                }
            },
        )
        if result.matched_count != 1:
            raise HTTPException(status_code=404, detail="Feedback not found")
        return await db.beta_feedback.find_one({"id": feedback_id}, {"_id": 0})


async def ensure_indexes(db) -> None:
    await db.beta_feedback.create_index("id", unique=True)
    await db.beta_feedback.create_index([("status", 1), ("created_at", -1)])
    await db.beta_feedback.create_index([("user_id", 1), ("created_at", -1)])
