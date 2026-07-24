import csv
import io
import json
import os
import random
import re
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Iterable, Optional

from fastapi import Header, HTTPException, UploadFile
from pydantic import BaseModel, Field, field_validator

QUESTION_STATUSES = {"draft", "approved", "rejected", "archived"}
DEFAULT_RECENT_WINDOW_DAYS = 14
QUESTION_CACHE_TTL_SECONDS = 45
QUESTION_CACHE_LIMIT = 64

DIFFICULTY_ALIASES = {
    "casual": "easy",
    "normal": "medium",
    "expert": "hard",
    "mixed": "medium",
    "deepcut": "deepcut",
}
CATEGORY_ALIASES = {
    "nba": "basketball",
    "basketball": "basketball",
    "soccer": "soccer",
    "football": "nfl",
    "nfl": "nfl",
    "american football": "nfl",
    "hockey": "hockey",
    "nhl": "hockey",
    "golf": "golf",
    "videogames": "videogames",
    "video games": "videogames",
    "sports videogames": "videogames",
    "sports video games": "videogames",
    "baseball": "baseball",
    "mlb": "baseball",
    "general": "general",
}

_question_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}


GENERATED_QUESTION_BATCH_SCHEMA: dict[str, Any] = {
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
                },
                "required": [
                    "sport",
                    "subcategory",
                    "difficulty",
                    "question",
                    "correct_answer",
                    "incorrect_answers",
                    "explanation",
                    "tags",
                    "source",
                ],
                "additionalProperties": False,
            },
        }
    },
    "required": ["questions"],
    "additionalProperties": False,
}


class QuestionBankInput(BaseModel):
    id: Optional[str] = None
    sport: str = Field(..., min_length=1)
    category: Optional[str] = None
    subcategory: Optional[str] = None
    difficulty: str = Field(..., min_length=1)
    question: str = Field(..., min_length=8)
    correct_answer: str = Field(..., min_length=1)
    incorrect_answers: list[str] = Field(..., min_length=1)
    explanation: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    source: Optional[str] = None
    reference: Optional[str] = None
    status: str = "draft"

    @field_validator("sport", "difficulty", "status", mode="before")
    @classmethod
    def lower_text(cls, value):
        return str(value or "").strip().lower()

    @field_validator("incorrect_answers", mode="before")
    @classmethod
    def split_answers(cls, value):
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                if isinstance(parsed, list):
                    return parsed
            except Exception:
                pass
            return [v.strip() for v in re.split(r"[|;]", value) if v.strip()]
        return value

    @field_validator("tags", mode="before")
    @classmethod
    def split_tags(cls, value):
        if value is None:
            return []
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                if isinstance(parsed, list):
                    return parsed
            except Exception:
                pass
            return [v.strip() for v in re.split(r"[,|;]", value) if v.strip()]
        return value

    @field_validator("status")
    @classmethod
    def valid_status(cls, value):
        if value not in QUESTION_STATUSES:
            raise ValueError("status must be draft, approved, rejected, or archived")
        return value

    @field_validator("difficulty")
    @classmethod
    def valid_difficulty(cls, value):
        value = DIFFICULTY_ALIASES.get(value, value)
        if value not in {"easy", "medium", "hard", "deepcut"}:
            raise ValueError("difficulty must be easy, medium, hard, or deepcut")
        return value

    @field_validator("sport")
    @classmethod
    def valid_sport(cls, value):
        value = CATEGORY_ALIASES.get(value, value)
        if value not in set(CATEGORY_ALIASES.values()):
            raise ValueError("unsupported sport/category")
        return value

    def to_doc(self, *, status: Optional[str] = None, now: Optional[datetime] = None) -> dict[str, Any]:
        now = now or utcnow()
        correct = self.correct_answer.strip()
        incorrect = [str(a).strip() for a in self.incorrect_answers if str(a).strip()]
        if len(incorrect) < 1:
            raise ValueError("at least one incorrect answer is required")
        if correct.lower() in {a.lower() for a in incorrect}:
            raise ValueError("correct answer cannot also be an incorrect answer")
        if len({a.lower() for a in incorrect}) != len(incorrect):
            raise ValueError("incorrect answers must be distinct")
        doc_id = self.id or uuid.uuid4().hex
        sport = CATEGORY_ALIASES.get(self.sport, self.sport)
        category = CATEGORY_ALIASES.get((self.category or sport).strip().lower(), (self.category or sport).strip().lower())
        return {
            "id": doc_id,
            "sport": sport,
            "category": category,
            "subcategory": (self.subcategory or "general").strip().lower(),
            "difficulty": DIFFICULTY_ALIASES.get(self.difficulty, self.difficulty),
            "question": self.question.strip(),
            "correct_answer": correct,
            "incorrect_answers": incorrect,
            "explanation": (self.explanation or "").strip(),
            "tags": sorted({str(t).strip().lower() for t in self.tags if str(t).strip()}),
            "source": (self.source or self.reference or "").strip(),
            "status": status or self.status,
            "normalized_hash": normalize_question(self.question),
            "created_at": now,
            "updated_at": now,
        }


class ImportQuestionsBody(BaseModel):
    questions: list[QuestionBankInput]
    default_status: str = "draft"


class DraftGenerationBody(BaseModel):
    sport: str
    difficulty: str = "medium"
    count: int = 10
    subcategory: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    source: Optional[str] = None


class GeneratedQuestion(BaseModel):
    sport: str
    subcategory: str
    difficulty: str
    question: str
    correct_answer: str
    incorrect_answers: list[str] = Field(..., min_length=3, max_length=3)
    explanation: str
    tags: list[str]
    source: str


class GeneratedQuestionBatch(BaseModel):
    questions: list[GeneratedQuestion] = Field(..., min_length=1, max_length=50)


class QuestionStatusBody(BaseModel):
    status: str

    @field_validator("status", mode="before")
    @classmethod
    def validate_status(cls, value):
        normalized = str(value or "").strip().lower()
        if normalized not in QUESTION_STATUSES:
            raise ValueError("status must be draft, approved, rejected, or archived")
        return normalized


class QuestionBankQuery(BaseModel):
    sports: list[str]
    difficulty: str
    count: int = 7
    subcategories: list[str] = Field(default_factory=list)
    answer_format: str = "multiple_choice"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def normalize_question(question: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", question.lower())).strip()


def canonical_sport(value: str) -> str:
    return CATEGORY_ALIASES.get(str(value or "").strip().lower(), str(value or "").strip().lower())


def canonical_difficulty(value: str) -> str:
    return DIFFICULTY_ALIASES.get(str(value or "").strip().lower(), str(value or "").strip().lower())


def cache_key(query: QuestionBankQuery) -> str:
    return json.dumps(
        {
            "sports": sorted(canonical_sport(s) for s in query.sports),
            "difficulty": canonical_difficulty(query.difficulty),
            "subcategories": sorted(query.subcategories),
            "answer_format": query.answer_format,
        },
        sort_keys=True,
    )


def clear_cache() -> None:
    _question_cache.clear()


def question_to_game_payload(doc: dict[str, Any]) -> dict[str, Any]:
    answers = [doc["correct_answer"], *doc.get("incorrect_answers", [])]
    random.shuffle(answers)
    correct_index = answers.index(doc["correct_answer"])
    return {
        "id": doc["id"],
        "question": doc["question"],
        "options": answers,
        "correct_index": correct_index,
        "difficulty": doc.get("difficulty"),
        "tags": doc.get("tags", []),
        "deep_cut": doc.get("difficulty") == "deepcut" or "deepcut" in doc.get("tags", []),
    }


def build_filter(query: QuestionBankQuery, *, include_status: bool = True) -> dict[str, Any]:
    sports = [canonical_sport(s) for s in query.sports if s]
    difficulty = canonical_difficulty(query.difficulty)
    match: dict[str, Any] = {
        "$or": [{"sport": {"$in": sports}}, {"category": {"$in": sports}}],
    }
    if include_status:
        match["status"] = "approved"
    if difficulty != "mixed":
        match["difficulty"] = difficulty
    if query.subcategories:
        match["subcategory"] = {"$in": [s.strip().lower() for s in query.subcategories if s]}
    return match


async def ensure_indexes(db) -> None:
    await db.question_bank.create_index("id", unique=True)
    await db.question_bank.create_index("normalized_hash", unique=True)
    await db.question_bank.create_index([("status", 1), ("sport", 1), ("difficulty", 1), ("subcategory", 1)])
    await db.question_bank.create_index([("status", 1), ("category", 1), ("difficulty", 1)])
    await db.question_serves.create_index([("user_id", 1), ("question_id", 1), ("served_at", -1)])
    await db.question_serves.create_index("served_at", expireAfterSeconds=60 * 60 * 24 * 90)


async def recent_question_ids(db, user_id: str, *, days: int = DEFAULT_RECENT_WINDOW_DAYS) -> set[str]:
    since = utcnow() - timedelta(days=days)
    docs = await db.question_serves.find(
        {"user_id": user_id, "served_at": {"$gte": since}},
        {"_id": 0, "question_id": 1},
    ).to_list(1000)
    return {d["question_id"] for d in docs}


async def record_serves(db, user_id: str, questions: Iterable[dict[str, Any]]) -> None:
    now = utcnow()
    docs = [
        {"id": uuid.uuid4().hex, "user_id": user_id, "question_id": q["id"], "served_at": now}
        for q in questions
    ]
    if docs:
        await db.question_serves.insert_many(docs)
        await db.question_bank.update_many(
            {"id": {"$in": [d["question_id"] for d in docs]}},
            {"$inc": {"times_served": 1}, "$set": {"last_served_at": now}},
        )


async def fetch_approved_questions(db, query: QuestionBankQuery, *, user_id: str) -> list[dict[str, Any]]:
    query.count = max(3, min(int(query.count), 50))
    recent = await recent_question_ids(db, user_id)
    key = cache_key(query)
    now = time.time()
    cached = _question_cache.get(key)
    if cached and now - cached[0] < QUESTION_CACHE_TTL_SECONDS:
        pool = [q for q in cached[1] if q["id"] not in recent]
    else:
        pipeline = [
            {"$match": build_filter(query)},
            {"$sample": {"size": max(query.count * 6, 40)}},
        ]
        pool = await db.question_bank.aggregate(pipeline).to_list(max(query.count * 6, 40))
        _question_cache[key] = (now, pool[:QUESTION_CACHE_LIMIT])
        if len(_question_cache) > QUESTION_CACHE_LIMIT:
            oldest = min(_question_cache, key=lambda k: _question_cache[k][0])
            _question_cache.pop(oldest, None)
        pool = [q for q in pool if q["id"] not in recent]

    if len(pool) < query.count:
        fallback = await db.question_bank.aggregate([
            {"$match": build_filter(query)},
            {"$sample": {"size": query.count - len(pool)}},
        ]).to_list(query.count - len(pool))
        seen = {q["id"] for q in pool}
        pool.extend([q for q in fallback if q["id"] not in seen])

    selected = pool[:query.count]
    if len(selected) < min(query.count, 3):
        raise HTTPException(status_code=503, detail="Not enough approved questions match those filters yet")
    await record_serves(db, user_id, selected)
    return [question_to_game_payload(q) for q in selected]


async def import_question_docs(db, rows: list[dict[str, Any]], *, default_status: str = "draft") -> dict[str, Any]:
    if default_status not in QUESTION_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid default status")
    imported = 0
    rejected: list[dict[str, Any]] = []
    now = utcnow()
    for index, row in enumerate(rows):
        try:
            if "question_text" in row and "question" not in row:
                row["question"] = row.pop("question_text")
            if "correct" in row and "correct_answer" not in row:
                row["correct_answer"] = row.pop("correct")
            if "reference" in row and "source" not in row:
                row["source"] = row.get("reference")
            item = QuestionBankInput(**row)
            doc = item.to_doc(status=row.get("status") or default_status, now=now)
            await db.question_bank.update_one(
                {"normalized_hash": doc["normalized_hash"]},
                {"$setOnInsert": {**doc, "times_served": 0}, "$set": {"updated_at": now}},
                upsert=True,
            )
            imported += 1
        except Exception as exc:
            rejected.append({"row": index, "error": str(exc), "question": row.get("question") or row.get("question_text")})
    clear_cache()
    return {"imported": imported, "rejected": rejected}


async def parse_upload(file: UploadFile) -> list[dict[str, Any]]:
    raw = await file.read()
    text = raw.decode("utf-8-sig")
    name = (file.filename or "").lower()
    if name.endswith(".json"):
        data = json.loads(text)
        return data if isinstance(data, list) else data.get("questions", [])
    if name.endswith(".csv"):
        return list(csv.DictReader(io.StringIO(text)))
    raise HTTPException(status_code=400, detail="Upload must be a JSON or CSV file")


def admin_values(name: str) -> set[str]:
    return {v.strip().lower() for v in re.split(r"[,;]", str(name or "")) if v.strip()}


async def require_admin(user: dict[str, Any]) -> dict[str, Any]:
    emails = admin_values(os.environ.get("ADMIN_EMAILS", ""))
    ids = admin_values(os.environ.get("ADMIN_USER_IDS", ""))
    if user.get("email", "").lower() in emails or user.get("user_id", "").lower() in ids:
        return user
    raise HTTPException(status_code=403, detail="Admin access required")


async def authorize_generation_request(
    get_current_user: Callable,
    authorization: Optional[str],
    x_api_key: Optional[str],
) -> dict[str, Any]:
    """Authorize draft generation through an admin session or the Adalo key."""
    configured_key = os.environ.get("ADALO_API_KEY", "").strip()
    supplied_key = str(x_api_key or "").strip()
    if configured_key and supplied_key and secrets.compare_digest(configured_key, supplied_key):
        return {"user_id": "adalo_admin_api", "email": "adalo-admin-api@internal"}

    user = await get_current_user(authorization)
    return await require_admin(user)


def register_routes(api_router, *, db, get_current_user: Callable, openai_client=None, openai_model: str = "gpt-5.6-luna", logger=None):
    @api_router.post("/admin/questions/import")
    async def import_questions(body: ImportQuestionsBody, authorization: Optional[str] = Header(None)):
        user = await get_current_user(authorization)
        await require_admin(user)
        rows = [q.model_dump() for q in body.questions]
        return await import_question_docs(db, rows, default_status=body.default_status)

    @api_router.post("/admin/questions/import-file")
    async def import_questions_file(file: UploadFile, status: str = "draft", authorization: Optional[str] = Header(None)):
        user = await get_current_user(authorization)
        await require_admin(user)
        rows = await parse_upload(file)
        return await import_question_docs(db, rows, default_status=status)

    @api_router.post("/admin/questions/generate-drafts")
    async def generate_draft_questions(
        body: DraftGenerationBody,
        authorization: Optional[str] = Header(None),
        x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    ):
        await authorize_generation_request(get_current_user, authorization, x_api_key)
        if not openai_client:
            raise HTTPException(status_code=503, detail="OpenAI draft generation is not configured")

        sport = canonical_sport(body.sport)
        difficulty = canonical_difficulty(body.difficulty)
        if sport not in set(CATEGORY_ALIASES.values()):
            raise HTTPException(status_code=400, detail="Unsupported sport/category")
        if difficulty not in {"easy", "medium", "hard", "deepcut"}:
            raise HTTPException(status_code=400, detail="Unsupported difficulty")

        count = max(1, min(body.count, 50))
        subcategory_instruction = (
            f'Use the subcategory "{body.subcategory.strip()}".'
            if body.subcategory and body.subcategory.strip()
            else "Use a concise, specific subcategory for each question."
        )
        system_prompt = (
            "You create draft content for DeepCut Sports, an obscure sports-trivia game. "
            "Return only data matching the provided JSON schema. These questions will be manually reviewed. "
            "Never invent a URL, quote, statistic, player, event, or source. If you are not confident in a fact, "
            "use source=needs_manual_verification. Incorrect answers must be plausible, distinct, and definitely wrong."
        )
        user_prompt = (
            f"Generate exactly {count} unique {difficulty} trivia questions for {sport}. "
            f"{subcategory_instruction} Focus on backups, role players, forgotten games, unusual records, roster details, "
            "sports-video-game history, or other facts that make a knowledgeable fan ask how someone remembers that. "
            "Each question must have exactly three incorrect answers. Explanations should state why the answer is correct. "
            "For source, give a concrete verification target such as a league gamebook, official record book, box score, "
            "or named statistics page, but do not fabricate direct links."
        )

        try:
            response = await openai_client.responses.create(
                model=openai_model,
                input=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                text={
                    "format": {
                        "type": "json_schema",
                        "name": "deepcut_question_batch",
                        "strict": True,
                        "schema": GENERATED_QUESTION_BATCH_SCHEMA,
                    }
                },
                store=False,
            )
            batch = GeneratedQuestionBatch.model_validate_json(response.output_text)
        except Exception as exc:
            request_id = getattr(exc, "request_id", None)
            if logger:
                logger.error(
                    "OpenAI draft question generation failed%s: %s",
                    f" request_id={request_id}" if request_id else "",
                    exc,
                )
            raise HTTPException(status_code=502, detail="OpenAI returned invalid draft data")

        rows: list[dict[str, Any]] = []
        requested_tags = {str(tag).strip().lower() for tag in body.tags if str(tag).strip()}
        for generated in batch.questions[:count]:
            row = generated.model_dump()
            row["sport"] = sport
            row["difficulty"] = difficulty
            if body.subcategory and body.subcategory.strip():
                row["subcategory"] = body.subcategory.strip().lower()
            row["tags"] = sorted(
                {str(tag).strip().lower() for tag in row.get("tags", []) if str(tag).strip()}
                | requested_tags
                | {"ai_generated", "openai"}
            )
            row["source"] = (body.source or row.get("source") or "needs_manual_verification").strip()
            row["status"] = "draft"
            rows.append(row)

        result = await import_question_docs(db, rows, default_status="draft")
        result.update(
            {
                "requested": count,
                "generated": len(rows),
                "rejected_count": len(result["rejected"]),
                "provider": "openai",
                "model": openai_model,
                "status": "draft",
                "message": f"Generated {len(rows)} draft questions for review",
            }
        )
        return result

    @api_router.get("/admin/questions")
    async def list_admin_questions(status: str = "draft", limit: int = 100, authorization: Optional[str] = Header(None)):
        user = await get_current_user(authorization)
        await require_admin(user)
        if status not in QUESTION_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        docs = await db.question_bank.find({"status": status}, {"_id": 0}).sort("updated_at", -1).limit(min(limit, 500)).to_list(min(limit, 500))
        return docs

    @api_router.post("/admin/questions/{question_id}/status")
    async def set_question_status(
        question_id: str,
        body: QuestionStatusBody,
        authorization: Optional[str] = Header(None),
    ):
        user = await get_current_user(authorization)
        await require_admin(user)
        now = utcnow()
        result = await db.question_bank.update_one(
            {"id": question_id},
            {"$set": {"status": body.status, "updated_at": now}},
        )
        if getattr(result, "matched_count", 0) == 0:
            raise HTTPException(status_code=404, detail="Question not found")
        clear_cache()
        return {"id": question_id, "status": body.status}
