import os
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from starlette.middleware.cors import CORSMiddleware

from server_legacy import *  # noqa: F401,F403
import question_bank


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
        origins = ["*"]

    app.user_middleware = [m for m in app.user_middleware if m.cls is not CORSMiddleware]
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=True,
        allow_origins=origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.middleware_stack = None


_configure_cors()
_remove_route("/api/quiz/generate", "POST")
_remove_route("/api/lobbies/{lobby_id}/start", "POST")


@app.post("/api/quiz/generate", response_model=list[Question])
async def generate_quiz(body: QuizRequest, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    sport_keys = [s for s in (body.sports or [body.sport]) if s]
    if (
        not sport_keys
        or any(question_bank.canonical_sport(s) not in set(question_bank.CATEGORY_ALIASES.values()) for s in sport_keys)
        or body.difficulty not in DIFFICULTIES
        or body.era not in ERAS
    ):
        raise HTTPException(status_code=400, detail="Invalid sport, difficulty or era")

    query = question_bank.QuestionBankQuery(
        sports=sport_keys,
        difficulty=body.difficulty,
        count=max(3, min(body.count, 30)),
    )
    return await question_bank.fetch_approved_questions(db, query, user_id=user["user_id"])


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
question_bank.register_routes(
    _admin_router,
    db=db,
    get_current_user=get_current_user,
    llm_chat_cls=LlmChat,
    user_message_cls=UserMessage,
    llm_key=EMERGENT_LLM_KEY,
    logger=logger,
)
app.include_router(_admin_router)


@app.on_event("startup")
async def question_bank_startup():
    await question_bank.ensure_indexes(db)
