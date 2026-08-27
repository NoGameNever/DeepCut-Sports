import os
import sys
import types
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from openai import AsyncOpenAI
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

# Keep the legacy app importable on hosts that do not install Emergent's private
# integration package. Admin question generation uses the official OpenAI SDK.
os.environ.setdefault("EMERGENT_LLM_KEY", "")
_EMERGENT_LLM_AVAILABLE = True

try:
    from server_legacy import *  # noqa: F401,F403
except ModuleNotFoundError as exc:
    if exc.name != "emergentintegrations":
        raise

    _EMERGENT_LLM_AVAILABLE = False

    chat_module = types.ModuleType("emergentintegrations.llm.chat")
    chat_module.LlmChat = object
    chat_module.UserMessage = object
    sys.modules.setdefault("emergentintegrations", types.ModuleType("emergentintegrations"))
    sys.modules.setdefault("emergentintegrations.llm", types.ModuleType("emergentintegrations.llm"))
    sys.modules["emergentintegrations.llm.chat"] = chat_module

    from server_legacy import *  # noqa: F401,F403

# Star imports intentionally omit names beginning with an underscore. The
# migration layer still reuses a small set of private helpers from the legacy
# module, so bind them explicitly instead of relying on import * behavior.
import server_legacy as _legacy

_ensure_username = _legacy._ensure_username
_user_out = _legacy._user_out
_require_member = _legacy._require_member
_member_count = _legacy._member_count
_validate_settings = _legacy._validate_settings
_now = _legacy._now

if not _EMERGENT_LLM_AVAILABLE:
    LlmChat = None
    UserMessage = None
    EMERGENT_LLM_KEY = None

import auth_native
import beta_release
import credential_migration
import question_bank
import question_bank_v2
import user_access


# Add migration-era access and credential flags to every auth/profile payload
# without changing the large legacy module's response contract in place.
_legacy_user_out = _user_out


def _user_out(user: dict) -> dict:
    output = _legacy_user_out(user)
    output.update(user_access.public_access_fields(user))
    output.update(credential_migration.credential_fields(user))
    return output


# Legacy route functions resolve their module globals at request time, so point
# them at the augmented serializer as well. This keeps /auth/me and /profile in
# sync with native registration/login responses.
_legacy._user_out = _user_out


OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "").strip()
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-5.6-luna").strip() or "gpt-5.6-luna"
openai_client = (
    AsyncOpenAI(api_key=OPENAI_API_KEY, timeout=90.0, max_retries=2)
    if OPENAI_API_KEY
    else None
)

QUIZ_SESSION_TTL = timedelta(hours=2)
BASE_QUIZ_POINTS = 100
QUIZ_DIFFICULTIES = set(DIFFICULTIES) | {"mixed"}


class PublicQuizQuestion(BaseModel):
    id: str
    question: str
    options: list[str]
    difficulty: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    deep_cut: bool = False


class QuizStartResponse(BaseModel):
    session_id: str
    total: int
    question_index: int
    question: PublicQuizQuestion


class QuizAnswerRequest(BaseModel):
    selected_index: Optional[int] = Field(default=None, ge=0, le=3)


class QuizAnswerResponse(BaseModel):
    correct: bool
    correct_index: int
    score: int
    correct_count: int
    question_index: int
    total: int
    complete: bool
    next_question: Optional[PublicQuizQuestion] = None
    progression: Optional[dict] = None
    user: Optional[dict] = None


def _remove_route(path: str, method: str) -> None:
    method = method.upper()
    app.router.routes = [
        route for route in app.router.routes
        if not (getattr(route, "path", None) == path and method in getattr(route, "methods", set()))
    ]


def _env_list(name: str) -> list[str]:
    return [value.strip().rstrip("/") for value in os.environ.get(name, "").split(",") if value.strip()]


def _configure_cors() -> None:
    origins = _env_list("CORS_ORIGINS")
    app_base_url = os.environ.get("APP_BASE_URL", "").strip().rstrip("/")
    if app_base_url and app_base_url not in origins:
        origins.append(app_base_url)
    if not origins:
        # Production should set CORS_ORIGINS and/or APP_BASE_URL.
        # Keep local development working without opening credentialed CORS to every origin.
        origins = [
            "http://localhost:3000",
            "http://localhost:8081",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:8081",
        ]

    app.user_middleware = [m for m in app.user_middleware if m.cls is not CORSMiddleware]
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=True,
        allow_origins=origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.middleware_stack = None


def _public_question(question: dict) -> PublicQuizQuestion:
    return PublicQuizQuestion(
        id=str(question["id"]),
        question=str(question["question"]),
        options=[str(option) for option in question["options"]],
        difficulty=question.get("difficulty"),
        tags=list(question.get("tags") or []),
        deep_cut=bool(question.get("deep_cut")),
    )


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


async def _load_quiz_questions(*, body: QuizRequest, sport_keys: list[str], user_id: str) -> list[dict]:
    count = max(3, min(body.count, 30))
    if body.difficulty == "mixed":
        return await beta_release.fetch_mixed_questions(
            db,
            sports=sport_keys,
            count=count,
            user_id=user_id,
        )
    query = question_bank.QuestionBankQuery(
        sports=sport_keys,
        difficulty=body.difficulty,
        count=count,
    )
    return await question_bank.fetch_approved_questions(db, query, user_id=user_id)


_configure_cors()
# New sign-ins are DeepCut-owned. Existing legacy sessions remain valid only long
# enough for their owner to activate a DeepCut password.
_remove_route("/api/auth/session", "POST")
_remove_route("/api/quiz/generate", "POST")
_remove_route("/api/lobbies/{lobby_id}/start", "POST")


@app.post("/api/quiz/generate", response_model=list[Question])
async def generate_quiz(body: QuizRequest, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    sport_keys = [s for s in (body.sports or [body.sport]) if s]
    if (
        not sport_keys
        or any(question_bank.canonical_sport(s) not in set(question_bank.CATEGORY_ALIASES.values()) for s in sport_keys)
        or body.difficulty not in QUIZ_DIFFICULTIES
        or body.era not in ERAS
    ):
        raise HTTPException(status_code=400, detail="Invalid sport, difficulty or era")
    return await _load_quiz_questions(body=body, sport_keys=sport_keys, user_id=user["user_id"])


@app.post("/api/v2/quiz/start", response_model=QuizStartResponse)
async def start_quiz_session(body: QuizRequest, authorization: Optional[str] = Header(None)):
    """Start a server-authoritative single-player quiz.

    Correct answers are retained server-side. The client receives one public question
    at a time and cannot calculate or submit its own final score.
    """
    user = await get_current_user(authorization)
    sport_keys = [s for s in (body.sports or [body.sport]) if s]
    valid_sports = set(question_bank.CATEGORY_ALIASES.values())
    if (
        not sport_keys
        or any(question_bank.canonical_sport(s) not in valid_sports for s in sport_keys)
        or body.difficulty not in QUIZ_DIFFICULTIES
        or body.era not in ERAS
    ):
        raise HTTPException(status_code=400, detail="Invalid sport, difficulty or era")

    questions = await _load_quiz_questions(body=body, sport_keys=sport_keys, user_id=user["user_id"])
    if len(questions) < 3:
        raise HTTPException(status_code=503, detail="Not enough approved questions matched your filters")

    session_id = f"quiz_{uuid.uuid4().hex}"
    now = _now_utc()
    await db.quiz_sessions.insert_one({
        "id": session_id,
        "user_id": user["user_id"],
        "sport": question_bank.canonical_sport(sport_keys[0]),
        "sports": [question_bank.canonical_sport(s) for s in sport_keys],
        "difficulty": body.difficulty,
        "era": body.era,
        "questions": questions,
        "current_index": 0,
        "score": 0,
        "correct_count": 0,
        "answers": [],
        "status": "active",
        "created_at": now,
        "expires_at": now + QUIZ_SESSION_TTL,
    })
    return QuizStartResponse(
        session_id=session_id,
        total=len(questions),
        question_index=0,
        question=_public_question(questions[0]),
    )


@app.post("/api/v2/quiz/{session_id}/answer", response_model=QuizAnswerResponse)
async def answer_quiz_session(
    session_id: str,
    body: QuizAnswerRequest,
    authorization: Optional[str] = Header(None),
):
    user = await get_current_user(authorization)
    session = await db.quiz_sessions.find_one({"id": session_id, "user_id": user["user_id"]}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Quiz session not found")
    if session.get("status") != "active":
        raise HTTPException(status_code=409, detail="Quiz session is already complete")
    expires_at = session.get("expires_at")
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at and expires_at < _now_utc():
        await db.quiz_sessions.update_one({"id": session_id}, {"$set": {"status": "expired"}})
        raise HTTPException(status_code=410, detail="Quiz session expired")

    questions = session.get("questions") or []
    index = int(session.get("current_index", 0))
    if index >= len(questions):
        raise HTTPException(status_code=409, detail="Quiz session has no remaining questions")

    question = questions[index]
    correct_index = int(question["correct_index"])
    is_correct = body.selected_index == correct_index
    score = int(session.get("score", 0)) + (BASE_QUIZ_POINTS if is_correct else 0)
    correct_count = int(session.get("correct_count", 0)) + (1 if is_correct else 0)
    next_index = index + 1
    complete = next_index >= len(questions)
    answer_detail = {
        "question_id": question["id"],
        "selected_index": body.selected_index,
        "correct": is_correct,
        "difficulty": question.get("difficulty") or session.get("difficulty"),
        "tags": list(question.get("tags") or []),
        "deep_cut": bool(question.get("deep_cut")),
    }

    update = {
        "$set": {
            "current_index": next_index,
            "score": score,
            "correct_count": correct_count,
            "status": "complete" if complete else "active",
            "updated_at": _now_utc(),
        },
        "$push": {"answers": answer_detail},
    }
    write = await db.quiz_sessions.update_one(
        {"id": session_id, "user_id": user["user_id"], "status": "active", "current_index": index},
        update,
    )
    if write.modified_count != 1:
        raise HTTPException(status_code=409, detail="Answer was already submitted")

    await question_bank_v2.record_answer_stats(db, str(question["id"]), is_correct)

    progression = None
    updated_user = None
    if complete:
        sport = session.get("sport") or "general"
        sport_scores = user.get("sport_scores", {}) or {}
        sport_scores[sport] = sport_scores.get(sport, 0) + score
        best_sport = max(sport_scores, key=sport_scores.get) if sport_scores else None
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {
                "$inc": {
                    "total_score": score,
                    "matches": 1,
                    "correct_answers": correct_count,
                    "total_answers": len(questions),
                },
                "$set": {"sport_scores": sport_scores, "best_sport": best_sport},
            },
        )
        progression_answers = [*(session.get("answers") or []), answer_detail]
        fallback_difficulty = session.get("difficulty") or "medium"
        if fallback_difficulty == "mixed":
            fallback_difficulty = "medium"
        progression = await prog.process_quiz_answers(
            db,
            user,
            progression_answers,
            fallback_difficulty=fallback_difficulty,
        )
        updated = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
        updated_user = _user_out(updated)

    next_question = _public_question(questions[next_index]) if not complete else None
    return QuizAnswerResponse(
        correct=is_correct,
        correct_index=correct_index,
        score=score,
        correct_count=correct_count,
        question_index=index,
        total=len(questions),
        complete=complete,
        next_question=next_question,
        progression=progression,
        user=updated_user,
    )


@app.post("/api/lobbies/{lobby_id}/start")
async def start_lobby(lobby_id: str, authorization: Optional[str] = Header(None)):
    me = await get_current_user(authorization)
    lobby = await _require_member(lobby_id, me["user_id"])
    if lobby["creator_user_id"] != me["user_id"]:
        raise HTTPException(status_code=403, detail="Only the host can start the game")
    if lobby["status"] != "waiting":
        raise HTTPException(status_code=409, detail="Game already started")
    if await _member_count(lobby_id) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 players to start")

    settings = _validate_settings({}, base=(lobby.get("settings") or DEFAULT_SETTINGS))
    difficulty = "deepcut" if settings["game_type"] == "deepcut" else settings["difficulty"]
    query = question_bank.QuestionBankQuery(
        sports=settings.get("selected_categories") or ["general"],
        difficulty=difficulty,
        count=max(3, min(int(settings.get("question_count", 10)), 50)),
        subcategories=settings.get("selected_subcategories") or [],
        answer_format=settings.get("answer_format", "multiple_choice"),
    )

    try:
        questions = await question_bank.fetch_approved_questions(db, query, user_id=me["user_id"])
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Lobby question-bank retrieval failed: {e}")
        raise HTTPException(status_code=502, detail="Couldn't load questions, try again")

    if len(questions) < 3:
        raise HTTPException(
            status_code=503,
            detail="Not enough approved questions matched your filters. Try broadening categories, era or difficulty.",
        )

    settings["settings_locked"] = True
    await db.lobbies.update_one(
        {"id": lobby_id},
        {"$set": {"status": "active", "questions": questions, "settings": settings, "started_at": _now()}},
    )
    await db.lobby_invites.update_many(
        {"lobby_id": lobby_id, "status": "pending"}, {"$set": {"status": "expired"}}
    )
    return {"status": "active"}


_admin_router = APIRouter(prefix="/api")
auth_native.register_routes(
    _admin_router,
    db=db,
    get_current_user=get_current_user,
    ensure_username=_ensure_username,
    user_out=_user_out,
)
credential_migration.register_routes(
    _admin_router,
    db=db,
    get_current_user=get_current_user,
    user_out=_user_out,
    require_admin=question_bank.require_admin,
)
beta_release.register_routes(
    _admin_router,
    db=db,
    get_current_user=get_current_user,
)
question_bank.register_routes(
    _admin_router,
    db=db,
    get_current_user=get_current_user,
    openai_client=openai_client,
    openai_model=OPENAI_MODEL,
    logger=logger,
)
question_bank_v2.register_routes(
    _admin_router,
    db=db,
    get_current_user=get_current_user,
    openai_client=openai_client,
    openai_model=OPENAI_MODEL,
    logger=logger,
)
user_access.register_routes(
    _admin_router,
    db=db,
    get_current_user=get_current_user,
    require_admin=question_bank.require_admin,
)
app.include_router(_admin_router)


@app.get("/api/health")
async def health_check():
    try:
        await db.command("ping")
    except Exception as exc:
        logger.error(f"Health check failed: {exc}")
        raise HTTPException(status_code=503, detail="Database unavailable")
    return {"status": "ok", "database": "ok"}


@app.on_event("startup")
async def question_bank_startup():
    await question_bank.ensure_indexes(db)
    await question_bank_v2.ensure_indexes(db)
    await beta_release.ensure_indexes(db)
    await auth_native.ensure_indexes(db)
    await credential_migration.ensure_indexes(db)
    await user_access.ensure_indexes(db)
    await user_access.ensure_bootstrap_access(db)
    await credential_migration.migrate_all_user_metadata(db)
    await db.quiz_sessions.create_index("id", unique=True)
    await db.quiz_sessions.create_index("expires_at", expireAfterSeconds=0)
