import re
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from fastapi import Header, HTTPException
from pydantic import BaseModel, Field, field_validator

import question_bank

VERIFICATION_STATUSES = {"unverified", "needs_review", "verified"}
REVIEW_STATUSES = {"draft", "approved", "rejected", "archived", "flagged"}
REPORT_FLAG_THRESHOLD = 3


GENERATED_QUESTION_V2_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "questions": {
            "type": "array",
            "minItems": 1,
            "maxItems": 50,
            "items": {
                "type": "object",
                "properties": {
                    "sport": {"type": "string"},
                    "subcategory": {"type": "string"},
                    "difficulty": {"type": "string"},
                    "era": {"type": "string"},
                    "league": {"type": "string"},
                    "season": {"type": "string"},
                    "teams": {"type": "array", "items": {"type": "string"}},
                    "players": {"type": "array", "items": {"type": "string"}},
                    "question": {"type": "string"},
                    "correct_answer": {"type": "string"},
                    "incorrect_answers": {
                        "type": "array",
                        "minItems": 3,
                        "maxItems": 3,
                        "items": {"type": "string"},
                    },
                    "explanation": {"type": "string"},
                    "tags": {"type": "array", "items": {"type": "string"}},
                    "source": {"type": "string"},
                    "source_url": {"type": "string"},
                    "factual_confidence": {"type": "number", "minimum": 0, "maximum": 1},
                },
                "required": [
                    "sport", "subcategory", "difficulty", "era", "league", "season",
                    "teams", "players", "question", "correct_answer", "incorrect_answers",
                    "explanation", "tags", "source", "source_url", "factual_confidence",
                ],
                "additionalProperties": False,
            },
        }
    },
    "required": ["questions"],
    "additionalProperties": False,
}


class GeneratedQuestionV2(BaseModel):
    sport: str
    subcategory: str
    difficulty: str
    era: str
    league: str
    season: str
    teams: list[str]
    players: list[str]
    question: str
    correct_answer: str
    incorrect_answers: list[str] = Field(..., min_length=3, max_length=3)
    explanation: str
    tags: list[str]
    source: str
    source_url: str
    factual_confidence: float = Field(..., ge=0, le=1)


class GeneratedQuestionBatchV2(BaseModel):
    questions: list[GeneratedQuestionV2] = Field(..., min_length=1, max_length=50)


class CampaignSlice(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    count: int = Field(..., ge=1, le=2000)
    difficulty: str = "deepcut"
    subcategory: Optional[str] = None
    era: Optional[str] = None
    league: Optional[str] = None
    tags: list[str] = Field(default_factory=list)

    @field_validator("difficulty", mode="before")
    @classmethod
    def normalize_difficulty(cls, value):
        value = question_bank.canonical_difficulty(str(value or "deepcut"))
        if value not in {"easy", "medium", "hard", "deepcut"}:
            raise ValueError("Unsupported difficulty")
        return value


class CampaignCreate(BaseModel):
    name: str = Field(..., min_length=3, max_length=120)
    sport: str
    target_count: Optional[int] = Field(default=None, ge=1, le=5000)
    difficulty: str = "deepcut"
    subcategory: Optional[str] = None
    era: Optional[str] = None
    league: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    slices: list[CampaignSlice] = Field(default_factory=list)


class GenerateNextBody(BaseModel):
    batch_size: int = Field(default=25, ge=1, le=50)


class QuestionPatch(BaseModel):
    question: Optional[str] = Field(default=None, min_length=8)
    correct_answer: Optional[str] = Field(default=None, min_length=1)
    incorrect_answers: Optional[list[str]] = None
    explanation: Optional[str] = None
    source: Optional[str] = None
    source_url: Optional[str] = None
    era: Optional[str] = None
    league: Optional[str] = None
    season: Optional[str] = None
    teams: Optional[list[str]] = None
    players: Optional[list[str]] = None
    tags: Optional[list[str]] = None
    factual_confidence: Optional[float] = Field(default=None, ge=0, le=1)
    verification_status: Optional[str] = None
    retired_reason: Optional[str] = None

    @field_validator("verification_status")
    @classmethod
    def validate_verification(cls, value):
        if value is None:
            return value
        normalized = value.strip().lower()
        if normalized not in VERIFICATION_STATUSES:
            raise ValueError("Invalid verification status")
        return normalized


class ReviewBody(BaseModel):
    status: str
    verification_status: Optional[str] = None
    review_note: Optional[str] = Field(default=None, max_length=500)

    @field_validator("status", mode="before")
    @classmethod
    def validate_status(cls, value):
        normalized = str(value or "").strip().lower()
        if normalized not in REVIEW_STATUSES:
            raise ValueError("Invalid review status")
        return normalized

    @field_validator("verification_status")
    @classmethod
    def validate_verification(cls, value):
        if value is None:
            return value
        normalized = value.strip().lower()
        if normalized not in VERIFICATION_STATUSES:
            raise ValueError("Invalid verification status")
        return normalized


class ReportBody(BaseModel):
    reason: str = Field(..., min_length=3, max_length=80)
    details: Optional[str] = Field(default=None, max_length=500)


class BackfillBody(BaseModel):
    dry_run: bool = True


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _clean_list(values: Optional[list[str]]) -> list[str]:
    return sorted({str(v).strip() for v in (values or []) if str(v).strip()})


def _campaign_slices(body: CampaignCreate) -> list[dict[str, Any]]:
    if body.slices:
        slices = [s.model_dump() for s in body.slices]
    else:
        if not body.target_count:
            raise HTTPException(status_code=400, detail="target_count or slices is required")
        difficulty = question_bank.canonical_difficulty(body.difficulty)
        if difficulty not in {"easy", "medium", "hard", "deepcut"}:
            raise HTTPException(status_code=400, detail="Unsupported difficulty")
        slices = [{
            "name": body.subcategory or "general",
            "count": body.target_count,
            "difficulty": difficulty,
            "subcategory": body.subcategory,
            "era": body.era,
            "league": body.league,
            "tags": body.tags,
        }]
    for item in slices:
        item["generated_count"] = 0
        item["imported_count"] = 0
        item["rejected_count"] = 0
    return slices


def _enhanced_doc(row: dict[str, Any], *, campaign_id: Optional[str] = None) -> dict[str, Any]:
    base = question_bank.QuestionBankInput(**row).to_doc(status="draft")
    base.update({
        "era": str(row.get("era") or "").strip().lower() or None,
        "league": str(row.get("league") or "").strip().lower() or None,
        "season": str(row.get("season") or "").strip() or None,
        "teams": _clean_list(row.get("teams")),
        "players": _clean_list(row.get("players")),
        "source_url": str(row.get("source_url") or "").strip() or None,
        "factual_confidence": float(row.get("factual_confidence", 0.5)),
        "verification_status": str(row.get("verification_status") or "needs_review").strip().lower(),
        "review_note": None,
        "reviewed_by": None,
        "verified_at": None,
        "last_reviewed_at": None,
        "answer_count": 0,
        "correct_count": 0,
        "report_count": 0,
        "retired_reason": None,
        "campaign_id": campaign_id,
    })
    return base


async def import_enhanced_rows(db, rows: list[dict[str, Any]], *, campaign_id: Optional[str] = None) -> dict[str, Any]:
    imported = 0
    duplicates = 0
    rejected: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        try:
            doc = _enhanced_doc(row, campaign_id=campaign_id)
            existing = await db.question_bank.find_one({"normalized_hash": doc["normalized_hash"]}, {"_id": 0, "id": 1})
            if existing:
                duplicates += 1
                continue
            await db.question_bank.insert_one(doc)
            imported += 1
        except Exception as exc:
            rejected.append({"row": index, "question": row.get("question"), "error": str(exc)})
    question_bank.clear_cache()
    return {"imported": imported, "duplicates": duplicates, "rejected": rejected}


async def generate_rows(
    *,
    openai_client,
    openai_model: str,
    sport: str,
    difficulty: str,
    count: int,
    subcategory: Optional[str],
    era: Optional[str],
    league: Optional[str],
    tags: list[str],
    logger=None,
) -> list[dict[str, Any]]:
    if not openai_client:
        raise HTTPException(status_code=503, detail="OpenAI question generation is not configured")
    sport = question_bank.canonical_sport(sport)
    difficulty = question_bank.canonical_difficulty(difficulty)
    if sport not in set(question_bank.CATEGORY_ALIASES.values()):
        raise HTTPException(status_code=400, detail="Unsupported sport/category")
    if difficulty not in {"easy", "medium", "hard", "deepcut"}:
        raise HTTPException(status_code=400, detail="Unsupported difficulty")
    count = max(1, min(int(count), 50))

    constraints = []
    if subcategory:
        constraints.append(f'subcategory "{subcategory}"')
    if era:
        constraints.append(f'era "{era}"')
    if league:
        constraints.append(f'league "{league}"')
    constraint_text = ", ".join(constraints) if constraints else "a specific subcategory and era appropriate to the fact"

    system_prompt = (
        "You create draft content for DeepCut Sports, an obscure sports-trivia game. "
        "Return only JSON matching the schema. Every fact must be suitable for human verification. "
        "Do not invent URLs, statistics, games, players, transactions, or sources. If a direct URL is not known, "
        "return an empty source_url. factual_confidence is your confidence that the core fact is correct, not how hard the question is. "
        "Incorrect answers must be plausible, distinct, and definitely wrong."
    )
    user_prompt = (
        f"Generate exactly {count} unique {difficulty} questions for {sport}, using {constraint_text}. "
        "DeepCut questions should favor backups, role players, forgotten playoff moments, transactions, roster details, draft history, "
        "coaches/front offices, arenas/jerseys, unusual records, and sports-video-game culture rather than famous headline facts. "
        "Each question needs exactly three incorrect answers, a concise explanation, season/league/era metadata when applicable, "
        "named teams and players when applicable, and a concrete source description such as an official gamebook, box score, record book, "
        "transaction log, or named statistics page. Never fabricate a direct link."
    )
    try:
        response = await openai_client.responses.create(
            model=openai_model,
            input=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
            text={"format": {"type": "json_schema", "name": "deepcut_question_bank_v2", "strict": True, "schema": GENERATED_QUESTION_V2_SCHEMA}},
            store=False,
        )
        batch = GeneratedQuestionBatchV2.model_validate_json(response.output_text)
    except Exception as exc:
        if logger:
            logger.error("Question Bank v2 generation failed: %s", exc)
        raise HTTPException(status_code=502, detail="OpenAI returned invalid question-bank data")

    requested_tags = {str(tag).strip().lower() for tag in tags if str(tag).strip()}
    rows = []
    for generated in batch.questions[:count]:
        row = generated.model_dump()
        row["sport"] = sport
        row["difficulty"] = difficulty
        if subcategory:
            row["subcategory"] = subcategory.strip().lower()
        if era:
            row["era"] = era.strip().lower()
        if league:
            row["league"] = league.strip().lower()
        row["tags"] = sorted(set(row.get("tags") or []) | requested_tags | {"ai_generated", "openai", "question_bank_v2"})
        row["verification_status"] = "needs_review"
        row["status"] = "draft"
        rows.append(row)
    return rows


async def record_answer_stats(db, question_id: str, correct: bool) -> None:
    inc = {"answer_count": 1}
    if correct:
        inc["correct_count"] = 1
    await db.question_bank.update_one({"id": question_id}, {"$inc": inc})


async def ensure_indexes(db) -> None:
    await db.question_bank.create_index([("verification_status", 1), ("status", 1), ("sport", 1), ("difficulty", 1)])
    await db.question_bank.create_index([("campaign_id", 1), ("status", 1)])
    await db.question_campaigns.create_index("id", unique=True)
    await db.question_campaigns.create_index([("status", 1), ("updated_at", -1)])
    await db.question_reports.create_index([("question_id", 1), ("user_id", 1)], unique=True)
    await db.question_reports.create_index([("status", 1), ("created_at", -1)])


def register_routes(api_router, *, db, get_current_user: Callable, openai_client=None, openai_model: str = "gpt-5.6-luna", logger=None):
    @api_router.get("/admin/v2/questions/summary")
    async def question_summary(authorization: Optional[str] = Header(None)):
        user = await get_current_user(authorization)
        await question_bank.require_admin(user)
        statuses = {status: await db.question_bank.count_documents({"status": status}) for status in REVIEW_STATUSES}
        verification = {status: await db.question_bank.count_documents({"verification_status": status}) for status in VERIFICATION_STATUSES}
        verification["legacy_unset"] = await db.question_bank.count_documents({"verification_status": {"$exists": False}})
        total = await db.question_bank.count_documents({})
        flagged_reports = await db.question_reports.count_documents({"status": "open"})
        return {"total": total, "statuses": statuses, "verification": verification, "open_reports": flagged_reports}

    @api_router.get("/admin/v2/questions")
    async def list_questions_v2(
        status: str = "draft",
        sport: Optional[str] = None,
        difficulty: Optional[str] = None,
        verification: Optional[str] = None,
        campaign_id: Optional[str] = None,
        q: Optional[str] = None,
        limit: int = 100,
        skip: int = 0,
        authorization: Optional[str] = Header(None),
    ):
        user = await get_current_user(authorization)
        await question_bank.require_admin(user)
        match: dict[str, Any] = {}
        if status != "all":
            if status not in REVIEW_STATUSES:
                raise HTTPException(status_code=400, detail="Invalid status")
            match["status"] = status
        if sport:
            match["sport"] = question_bank.canonical_sport(sport)
        if difficulty:
            match["difficulty"] = question_bank.canonical_difficulty(difficulty)
        if verification:
            if verification not in VERIFICATION_STATUSES:
                raise HTTPException(status_code=400, detail="Invalid verification status")
            match["verification_status"] = verification
        if campaign_id:
            match["campaign_id"] = campaign_id
        if q and q.strip():
            safe = re.escape(q.strip())
            match["$or"] = [
                {"question": {"$regex": safe, "$options": "i"}},
                {"correct_answer": {"$regex": safe, "$options": "i"}},
                {"players": {"$regex": safe, "$options": "i"}},
                {"teams": {"$regex": safe, "$options": "i"}},
            ]
        capped = max(1, min(limit, 500))
        docs = await db.question_bank.find(match, {"_id": 0}).sort("updated_at", -1).skip(max(skip, 0)).limit(capped).to_list(capped)
        total = await db.question_bank.count_documents(match)
        return {"items": docs, "total": total, "limit": capped, "skip": max(skip, 0)}

    @api_router.patch("/admin/v2/questions/{question_id}")
    async def patch_question(question_id: str, body: QuestionPatch, authorization: Optional[str] = Header(None)):
        user = await get_current_user(authorization)
        await question_bank.require_admin(user)
        existing = await db.question_bank.find_one({"id": question_id}, {"_id": 0})
        if not existing:
            raise HTTPException(status_code=404, detail="Question not found")
        updates = body.model_dump(exclude_unset=True)
        if "incorrect_answers" in updates:
            answers = [str(a).strip() for a in updates["incorrect_answers"] if str(a).strip()]
            if len(answers) != 3 or len({a.lower() for a in answers}) != 3:
                raise HTTPException(status_code=400, detail="Exactly three distinct incorrect answers are required")
            correct = str(updates.get("correct_answer", existing.get("correct_answer", ""))).strip().lower()
            if correct in {a.lower() for a in answers}:
                raise HTTPException(status_code=400, detail="Correct answer cannot also be incorrect")
            updates["incorrect_answers"] = answers
        if "question" in updates:
            normalized = question_bank.normalize_question(updates["question"])
            duplicate = await db.question_bank.find_one({"normalized_hash": normalized, "id": {"$ne": question_id}}, {"_id": 0, "id": 1})
            if duplicate:
                raise HTTPException(status_code=409, detail="A matching question already exists")
            updates["normalized_hash"] = normalized
        for key in ("teams", "players", "tags"):
            if key in updates:
                updates[key] = _clean_list(updates[key])
        updates["updated_at"] = utcnow()
        updates["last_reviewed_at"] = utcnow()
        updates["reviewed_by"] = user.get("user_id")
        await db.question_bank.update_one({"id": question_id}, {"$set": updates})
        question_bank.clear_cache()
        return await db.question_bank.find_one({"id": question_id}, {"_id": 0})

    @api_router.post("/admin/v2/questions/{question_id}/review")
    async def review_question(question_id: str, body: ReviewBody, authorization: Optional[str] = Header(None)):
        user = await get_current_user(authorization)
        await question_bank.require_admin(user)
        question = await db.question_bank.find_one({"id": question_id}, {"_id": 0})
        if not question:
            raise HTTPException(status_code=404, detail="Question not found")
        verification_status = body.verification_status or question.get("verification_status") or "unverified"
        if body.status == "approved":
            source = str(question.get("source") or "").strip().lower()
            if verification_status != "verified":
                raise HTTPException(status_code=400, detail="Question must be verified before approval")
            if not source or source == "needs_manual_verification":
                raise HTTPException(status_code=400, detail="A concrete verification source is required before approval")
        now = utcnow()
        updates: dict[str, Any] = {
            "status": body.status,
            "verification_status": verification_status,
            "review_note": body.review_note,
            "reviewed_by": user.get("user_id"),
            "last_reviewed_at": now,
            "updated_at": now,
        }
        if verification_status == "verified":
            updates["verified_at"] = now
        await db.question_bank.update_one({"id": question_id}, {"$set": updates})
        question_bank.clear_cache()
        return {"id": question_id, "status": body.status, "verification_status": verification_status}

    @api_router.post("/admin/v2/questions/backfill-metadata")
    async def backfill_metadata(body: BackfillBody, authorization: Optional[str] = Header(None)):
        user = await get_current_user(authorization)
        await question_bank.require_admin(user)
        fields = {
            "verification_status": "unverified",
            "answer_count": 0,
            "correct_count": 0,
            "report_count": 0,
            "teams": [],
            "players": [],
            "campaign_id": None,
        }
        counts = {key: await db.question_bank.count_documents({key: {"$exists": False}}) for key in fields}
        if body.dry_run:
            return {"dry_run": True, "would_update": counts}
        modified = {}
        for key, value in fields.items():
            result = await db.question_bank.update_many({key: {"$exists": False}}, {"$set": {key: value}})
            modified[key] = result.modified_count
        return {"dry_run": False, "modified": modified}

    @api_router.post("/admin/v2/question-campaigns")
    async def create_campaign(body: CampaignCreate, authorization: Optional[str] = Header(None)):
        user = await get_current_user(authorization)
        await question_bank.require_admin(user)
        sport = question_bank.canonical_sport(body.sport)
        if sport not in set(question_bank.CATEGORY_ALIASES.values()):
            raise HTTPException(status_code=400, detail="Unsupported sport/category")
        slices = _campaign_slices(body)
        target = sum(int(item["count"]) for item in slices)
        if target > 5000:
            raise HTTPException(status_code=400, detail="Campaign cannot exceed 5,000 questions")
        now = utcnow()
        doc = {
            "id": f"qcamp_{uuid.uuid4().hex[:16]}",
            "name": body.name.strip(),
            "sport": sport,
            "target_count": target,
            "generated_count": 0,
            "imported_count": 0,
            "duplicate_count": 0,
            "rejected_count": 0,
            "status": "active",
            "slices": slices,
            "created_by": user.get("user_id"),
            "created_at": now,
            "updated_at": now,
        }
        await db.question_campaigns.insert_one(doc)
        return {k: v for k, v in doc.items() if k != "_id"}

    @api_router.get("/admin/v2/question-campaigns")
    async def list_campaigns(limit: int = 50, authorization: Optional[str] = Header(None)):
        user = await get_current_user(authorization)
        await question_bank.require_admin(user)
        capped = max(1, min(limit, 200))
        return await db.question_campaigns.find({}, {"_id": 0}).sort("updated_at", -1).limit(capped).to_list(capped)

    @api_router.post("/admin/v2/question-campaigns/{campaign_id}/generate-next")
    async def generate_campaign_batch(campaign_id: str, body: GenerateNextBody, authorization: Optional[str] = Header(None)):
        user = await get_current_user(authorization)
        await question_bank.require_admin(user)
        campaign = await db.question_campaigns.find_one({"id": campaign_id}, {"_id": 0})
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        if campaign.get("status") == "complete":
            raise HTTPException(status_code=409, detail="Campaign is already complete")
        slices = campaign.get("slices") or []
        slice_index = next((i for i, item in enumerate(slices) if int(item.get("generated_count", 0)) < int(item.get("count", 0))), None)
        if slice_index is None:
            await db.question_campaigns.update_one({"id": campaign_id}, {"$set": {"status": "complete", "updated_at": utcnow()}})
            raise HTTPException(status_code=409, detail="Campaign has no remaining generation targets")
        target = slices[slice_index]
        remaining = int(target.get("count", 0)) - int(target.get("generated_count", 0))
        request_count = min(body.batch_size, remaining, 50)
        rows = await generate_rows(
            openai_client=openai_client,
            openai_model=openai_model,
            sport=campaign["sport"],
            difficulty=target.get("difficulty") or "deepcut",
            count=request_count,
            subcategory=target.get("subcategory") or target.get("name"),
            era=target.get("era"),
            league=target.get("league"),
            tags=list(target.get("tags") or []),
            logger=logger,
        )
        result = await import_enhanced_rows(db, rows, campaign_id=campaign_id)
        generated = len(rows)
        rejected_count = len(result["rejected"])
        await db.question_campaigns.update_one(
            {"id": campaign_id},
            {
                "$inc": {
                    "generated_count": generated,
                    "imported_count": result["imported"],
                    "duplicate_count": result["duplicates"],
                    "rejected_count": rejected_count,
                    f"slices.{slice_index}.generated_count": generated,
                    f"slices.{slice_index}.imported_count": result["imported"],
                    f"slices.{slice_index}.rejected_count": rejected_count,
                },
                "$set": {"updated_at": utcnow()},
            },
        )
        updated = await db.question_campaigns.find_one({"id": campaign_id}, {"_id": 0})
        if int(updated.get("generated_count", 0)) >= int(updated.get("target_count", 0)):
            await db.question_campaigns.update_one({"id": campaign_id}, {"$set": {"status": "complete", "updated_at": utcnow()}})
            updated["status"] = "complete"
        return {"campaign": updated, "batch": {"requested": request_count, "generated": generated, **result}}

    @api_router.post("/questions/{question_id}/report")
    async def report_question(question_id: str, body: ReportBody, authorization: Optional[str] = Header(None)):
        user = await get_current_user(authorization)
        question = await db.question_bank.find_one({"id": question_id}, {"_id": 0, "id": 1, "status": 1})
        if not question:
            raise HTTPException(status_code=404, detail="Question not found")
        now = utcnow()
        report_id = f"qreport_{uuid.uuid4().hex[:16]}"
        result = await db.question_reports.update_one(
            {"question_id": question_id, "user_id": user["user_id"]},
            {"$setOnInsert": {
                "id": report_id,
                "question_id": question_id,
                "user_id": user["user_id"],
                "reason": body.reason.strip().lower(),
                "details": body.details,
                "status": "open",
                "created_at": now,
            }},
            upsert=True,
        )
        if result.upserted_id is None:
            return {"reported": True, "already_reported": True}
        updated = await db.question_bank.find_one_and_update(
            {"id": question_id},
            {"$inc": {"report_count": 1}, "$set": {"last_reported_at": now}},
            projection={"_id": 0, "report_count": 1, "status": 1},
            return_document=True,
        )
        report_count = int((updated or {}).get("report_count", 1))
        if report_count >= REPORT_FLAG_THRESHOLD and question.get("status") == "approved":
            await db.question_bank.update_one(
                {"id": question_id, "status": "approved"},
                {"$set": {"status": "flagged", "verification_status": "needs_review", "updated_at": now}},
            )
            question_bank.clear_cache()
        return {"reported": True, "already_reported": False, "report_count": report_count}
