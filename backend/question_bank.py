import csv
import io
import json
import random
import re
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
    emails = admin_values(__import__("os").environ.get("ADMIN_EMAILS", ""))
    ids = admin_values(__import__("os").environ.get("ADMIN_USER_IDS", ""))
    if user.get("email", "").lower() in emails or user.get("user_id", "").lower() in ids:
        return user
    raise HTTPException(status_code=403, detail="Admin access required")


def register_routes(api_router, *, db, get_current_user: Callable, llm_chat_cls=None, user_message_cls=None, llm_key: Optional[str] = None, logger=None):
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
    async def generate_draft_questions(body: DraftGenerationBody, authorization: Optional[str] = Header(None)):
        user = await get_current_user(authorization)
        await require_admin(user)
        if not llm_chat_cls or not user_message_cls or not llm_key:
            raise HTTPException(status_code=503, detail="AI draft generation is not configured")
        count = max(1, min(body.count, 50))
        prompt = (
            f"Generate {count} sports trivia questions for {body.sport}, difficulty {body.difficulty}. "
            "Return only JSON array items with sport, subcategory, difficulty, question, correct_answer, "
            "incorrect_answers, explanation, tags, and source."
        )
        chat = llm_chat_cls(api_key=llm_key, session_id=f"admin_drafts_{uuid.uuid4().hex}", system_message="Output only valid JSON.")
        raw = await chat.with_model("gemini", "gemini-3-flash-preview").send_message(user_message_cls(text=prompt))
        try:
            rows = json.loads(raw[raw.find("["): raw.rfind("]") + 1])
        except Exception as exc:
            if logger:
                logger.error(f"Draft question generation failed: {exc}")
            raise HTTPException(status_code=502, detail="AI returned invalid draft data")
        for row in rows:
            row.setdefault("sport", body.sport)
            row.setdefault("difficulty", body.difficulty)
            row.setdefault("subcategory", body.subcategory or "general")
            row.setdefault("tags", body.tags)
            row.setdefault("source", body.source or "ai_draft")
            row["status"] = "draft"
        return await import_question_docs(db, rows, default_status="draft")

    @api_router.get("/admin/questions")
    async def list_admin_questions(status: str = "draft", limit: int = 100, authorization: Optional[str] = Header(None)):
        user = await get_current_user(authorization)
        await require_admin(user)
        if status not in QUESTION_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        docs = await db.question_bank.find({"status": status}, {"_id": 0}).sort("updated_at", -1).limit(min(limit, 500)).to_list(min(limit, 500))
        return docs
