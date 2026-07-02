import os
import re
import json
import uuid
import secrets
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Annotated

import httpx
from fastapi import FastAPI, APIRouter, Header, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
APP_BASE_URL = os.environ.get("APP_BASE_URL", "").rstrip("/")

MAX_PLAYERS = 4
LOBBY_TTL = timedelta(hours=2)
INVITE_TTL = timedelta(hours=2)
ONLINE_WINDOW = timedelta(seconds=90)
TIMERS = {"blitz", "standard", "chill"}

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()
api_router = APIRouter(prefix="/api")

EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

SPORTS = {
    "soccer": "Soccer / Football",
    "basketball": "Basketball",
    "cricket": "Cricket",
    "tennis": "Tennis",
    "f1": "Formula 1 Motor Racing",
    "nfl": "American Football (NFL)",
    "baseball": "Baseball (MLB)",
}
DIFFICULTIES = {"easy", "medium", "hard"}
ERAS = {
    "modern": "Focus on events, players, records and results from roughly the last 10 years (recent era).",
    "2000s": "Focus on events, players and records from the year 2000 up to the present day.",
    "alltime": "Draw from the entire history of the sport across all eras, from its early days to the present.",
}


# ---------- Models ----------
class SessionRequest(BaseModel):
    session_token: str


class QuizRequest(BaseModel):
    sport: str
    difficulty: str
    era: str = "modern"
    count: int = 7


class Question(BaseModel):
    id: str
    question: str
    options: List[str]
    correct_index: int


class SubmitRequest(BaseModel):
    sport: str
    difficulty: str
    score: int
    correct: int
    total: int


# ---------- Auth helpers ----------
async def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1]
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires_at = session["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"last_seen": datetime.now(timezone.utc)}},
    )
    return user


@api_router.get("/")
async def root():
    return {"message": "Sports Trivia Blitz API"}


@api_router.post("/auth/session")
async def auth_session(body: SessionRequest):
    async with httpx.AsyncClient(timeout=30) as hc:
        resp = await hc.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": body.session_token})
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session token")
    data = resp.json()
    email = data["email"]
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": data.get("name"), "picture": data.get("picture")}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": data.get("name"),
            "picture": data.get("picture"),
            "username": None,
            "tagline": None,
            "avatar": None,
            "total_score": 0,
            "matches": 0,
            "correct_answers": 0,
            "total_answers": 0,
            "best_sport": None,
            "sport_scores": {},
            "created_at": datetime.now(timezone.utc),
        })
        uname = await _ensure_username(user_id, data.get("name") or email)
        await db.users.update_one({"user_id": user_id}, {"$set": {"username": uname}})

    session_token = data["session_token"]
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {"$set": {
            "session_token": session_token,
            "user_id": user_id,
            "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
            "created_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"session_token": session_token, "user": _user_out(user)}


@api_router.get("/auth/me")
async def auth_me(authorization: Optional[str] = Header(None)):
    return _user_out(await get_current_user(authorization))


@api_router.post("/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


# ---------- Profile customization ----------
USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]{3,20}$")
BANNED_WORDS = {
    "admin", "root", "fuck", "shit", "bitch", "nigger", "nigga", "cunt",
    "faggot", "rape", "nazi", "slut", "whore", "dick", "pussy",
}
ALLOWED_AVATAR_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
MAX_AVATAR_B64 = 900_000  # ~600KB decoded


def _effective_name(u: dict) -> str:
    return u.get("username") or u.get("name") or "Player"


def _effective_picture(u: dict):
    return u.get("avatar") or u.get("picture")


def _contains_banned(text: str) -> bool:
    low = text.lower()
    return any(b in low for b in BANNED_WORDS)


def _user_out(u: dict) -> dict:
    return {
        "user_id": u["user_id"],
        "email": u.get("email"),
        "name": _effective_name(u),
        "username": u.get("username"),
        "tagline": u.get("tagline"),
        "picture": _effective_picture(u),
        "total_score": u.get("total_score", 0),
        "matches": u.get("matches", 0),
        "correct_answers": u.get("correct_answers", 0),
        "total_answers": u.get("total_answers", 0),
        "best_sport": u.get("best_sport"),
        "sport_scores": u.get("sport_scores", {}),
    }


async def _ensure_username(user_id: str, base: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9_]", "", (base or "player").replace(" ", "")).lower()[:16] or "player"
    if len(base) < 3:
        base = (base + "player")[:6]
    candidate, i = base, 0
    while await db.users.find_one(
        {"username": {"$regex": f"^{re.escape(candidate)}$", "$options": "i"}, "user_id": {"$ne": user_id}}
    ):
        i += 1
        candidate = f"{base}{i}"
    return candidate


class ProfileUpdate(BaseModel):
    username: Optional[str] = None
    tagline: Optional[str] = None


class AvatarUpload(BaseModel):
    image: str
    content_type: Optional[str] = None


@api_router.get("/profile")
async def get_profile(authorization: Optional[str] = Header(None)):
    me = await get_current_user(authorization)
    if not me.get("username"):
        uname = await _ensure_username(me["user_id"], me.get("name") or me.get("email"))
        await db.users.update_one({"user_id": me["user_id"]}, {"$set": {"username": uname}})
        me["username"] = uname
    return _user_out(me)


@api_router.put("/profile")
async def update_profile(body: ProfileUpdate, authorization: Optional[str] = Header(None)):
    me = await get_current_user(authorization)
    updates: dict = {}

    if body.username is not None:
        uname = body.username.strip()
        if not USERNAME_RE.match(uname):
            raise HTTPException(status_code=400, detail="Username must be 3-20 letters, numbers or underscores")
        if _contains_banned(uname):
            raise HTTPException(status_code=400, detail="That username isn't allowed")
        clash = await db.users.find_one(
            {"username": {"$regex": f"^{re.escape(uname)}$", "$options": "i"}, "user_id": {"$ne": me["user_id"]}}
        )
        if clash:
            raise HTTPException(status_code=409, detail="Username is already taken")
        updates["username"] = uname

    if body.tagline is not None:
        tag = body.tagline.strip()
        if len(tag) > 40:
            raise HTTPException(status_code=400, detail="Tagline must be 40 characters or less")
        if tag and _contains_banned(tag):
            raise HTTPException(status_code=400, detail="That tagline isn't allowed")
        symbols = len(re.findall(r"[^a-zA-Z0-9 ]", tag))
        if symbols > 5:
            raise HTTPException(status_code=400, detail="Too many symbols in tagline")
        updates["tagline"] = tag or None

    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")

    updates["updated_at"] = datetime.now(timezone.utc)
    await db.users.update_one({"user_id": me["user_id"]}, {"$set": updates})
    fresh = await db.users.find_one({"user_id": me["user_id"]}, {"_id": 0})
    return _user_out(fresh)


@api_router.post("/profile/avatar")
async def upload_avatar(body: AvatarUpload, authorization: Optional[str] = Header(None)):
    me = await get_current_user(authorization)
    raw = body.image.strip()
    ctype = (body.content_type or "").lower()
    if raw.startswith("data:"):
        try:
            header, _ = raw.split(",", 1)
            ctype = header.split(";")[0].replace("data:", "").lower()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid image data")
    if ctype and ctype not in ALLOWED_AVATAR_TYPES:
        raise HTTPException(status_code=400, detail="Only PNG, JPG or WEBP images are allowed")
    if len(raw) > MAX_AVATAR_B64:
        raise HTTPException(status_code=400, detail="Image is too large (max ~600KB). Try a smaller photo.")
    data_uri = raw if raw.startswith("data:") else f"data:{ctype or 'image/jpeg'};base64,{raw}"
    await db.users.update_one(
        {"user_id": me["user_id"]}, {"$set": {"avatar": data_uri, "updated_at": datetime.now(timezone.utc)}}
    )
    fresh = await db.users.find_one({"user_id": me["user_id"]}, {"_id": 0})
    return _user_out(fresh)


# ---------- Quiz ----------
def _parse_json_array(text: str):
    text = text.strip()
    text = re.sub(r"^```(?:json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    start = text.find("[")
    end = text.rfind("]")
    if start != -1 and end != -1:
        text = text[start:end + 1]
    return json.loads(text)


@api_router.post("/quiz/generate", response_model=List[Question])
async def generate_quiz(body: QuizRequest, authorization: Optional[str] = Header(None)):
    await get_current_user(authorization)
    if body.sport not in SPORTS or body.difficulty not in DIFFICULTIES or body.era not in ERAS:
        raise HTTPException(status_code=400, detail="Invalid sport, difficulty or era")

    sport_name = SPORTS[body.sport]
    era_instruction = ERAS[body.era]
    count = max(3, min(body.count, 10))
    system = (
        "You are a sports trivia question generator. You output ONLY valid JSON, no prose, "
        "no markdown fences. Each question must be factually accurate and unambiguous."
    )
    prompt = (
        f"Generate {count} {body.difficulty}-difficulty multiple-choice trivia questions about {sport_name}. "
        f"{era_instruction} "
        "Vary the topics (history, records, players, rules, famous events). "
        "Return a JSON array where each item is an object with exactly these keys: "
        '"question" (string), "options" (array of exactly 4 distinct strings), '
        '"correct_index" (integer 0-3 indicating the correct option). '
        "Do not number the questions. Output only the JSON array."
    )
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"quiz_{uuid.uuid4().hex}",
        system_message=system,
    ).with_model("gemini", "gemini-3-flash-preview")

    try:
        raw = await chat.send_message(UserMessage(text=prompt))
        items = _parse_json_array(raw)
    except Exception as e:
        logger.error(f"Quiz generation failed: {e}")
        raise HTTPException(status_code=502, detail="Failed to generate questions")

    questions = []
    for it in items:
        opts = it.get("options", [])
        ci = it.get("correct_index", 0)
        if not isinstance(opts, list) or len(opts) != 4:
            continue
        if not isinstance(ci, int) or ci < 0 or ci > 3:
            ci = 0
        questions.append(Question(
            id=uuid.uuid4().hex,
            question=str(it.get("question", "")).strip(),
            options=[str(o) for o in opts],
            correct_index=ci,
        ))
    if not questions:
        raise HTTPException(status_code=502, detail="No valid questions generated")
    return questions


@api_router.post("/quiz/submit")
async def submit_quiz(body: SubmitRequest, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    user_id = user["user_id"]
    sport_scores = user.get("sport_scores", {}) or {}
    sport_scores[body.sport] = sport_scores.get(body.sport, 0) + body.score
    best_sport = max(sport_scores, key=sport_scores.get) if sport_scores else None

    await db.users.update_one(
        {"user_id": user_id},
        {
            "$inc": {
                "total_score": body.score,
                "matches": 1,
                "correct_answers": body.correct,
                "total_answers": body.total,
            },
            "$set": {"sport_scores": sport_scores, "best_sport": best_sport},
        },
    )
    updated = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    rank = await db.users.count_documents({"total_score": {"$gt": updated["total_score"]}}) + 1
    return {"user": updated, "rank": rank, "gained": body.score}


@api_router.get("/leaderboard")
async def leaderboard(authorization: Optional[str] = Header(None)):
    me = await get_current_user(authorization)
    top_docs = await db.users.find({}, {"_id": 0}).sort("total_score", -1).limit(50).to_list(50)
    top = []
    for i, u in enumerate(top_docs):
        top.append({
            "rank": i + 1,
            "user_id": u["user_id"],
            "name": _effective_name(u),
            "tagline": u.get("tagline"),
            "picture": _effective_picture(u),
            "total_score": u.get("total_score", 0),
            "matches": u.get("matches", 0),
        })
    my_rank = await db.users.count_documents({"total_score": {"$gt": me.get("total_score", 0)}}) + 1
    return {
        "top": top,
        "me": {
            "rank": my_rank,
            "user_id": me["user_id"],
            "name": _effective_name(me),
            "tagline": me.get("tagline"),
            "picture": _effective_picture(me),
            "total_score": me.get("total_score", 0),
            "matches": me.get("matches", 0),
        },
    }


@api_router.get("/sports")
async def list_sports():
    return [{"key": k, "name": v} for k, v in SPORTS.items()]


# =====================================================================
# FRIENDS + MULTIPLAYER LOBBIES + NATIVE-SHARE INVITES
# Architecture: thin route layer -> service helpers below. No SMS provider;
# invites are shared via the device's native Share Sheet using a secure link.
# =====================================================================

def _now():
    return datetime.now(timezone.utc)


def _aware(dt):
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _gen_token():
    """Cryptographically-random, URL-safe, hard-to-guess invite token."""
    return secrets.token_urlsafe(9)  # ~12 chars


def _gen_code():
    """Short human-shareable lobby code (never a DB id)."""
    return "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(6))


def _invite_url(token: str) -> str:
    base = APP_BASE_URL or ""
    return f"{base}/join/{token}"


def _is_online(user: dict) -> bool:
    ls = _aware(user.get("last_seen"))
    return bool(ls and (_now() - ls) < ONLINE_WINDOW)


def _public_user_from_doc(u: dict):
    return {
        "user_id": u["user_id"],
        "name": _effective_name(u),
        "tagline": u.get("tagline"),
        "picture": _effective_picture(u),
        "online": _is_online(u),
    }


async def _public_user(user_id: str):
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not u:
        return None
    return _public_user_from_doc(u)


async def _public_users_map(user_ids: list) -> dict:
    """Batch-load public user objects for a list of ids in a single query."""
    ids = list({uid for uid in user_ids if uid})
    if not ids:
        return {}
    docs = await db.users.find({"user_id": {"$in": ids}}, {"_id": 0}).to_list(len(ids))
    return {u["user_id"]: _public_user_from_doc(u) for u in docs}


async def _relations_map(me: str, other_ids: list) -> dict:
    """Batch-load relationship status of each other_id relative to `me`."""
    ids = [uid for uid in other_ids if uid]
    if not ids:
        return {}
    docs = await db.friendships.find({
        "$or": [
            {"requester_user_id": me, "receiver_user_id": {"$in": ids}},
            {"receiver_user_id": me, "requester_user_id": {"$in": ids}},
        ]
    }, {"_id": 0}).to_list(len(ids) * 2)
    out = {uid: "none" for uid in ids}
    for f in docs:
        other = f["receiver_user_id"] if f["requester_user_id"] == me else f["requester_user_id"]
        status = f["status"]
        if status == "accepted":
            out[other] = "friends"
        elif status == "blocked":
            out[other] = "blocked_by_me" if f["requester_user_id"] == me else "blocked_me"
        elif status == "pending":
            out[other] = "request_sent" if f["requester_user_id"] == me else "request_received"
    return out


async def _friendship_between(a: str, b: str):
    return await db.friendships.find_one({
        "$or": [
            {"requester_user_id": a, "receiver_user_id": b},
            {"requester_user_id": b, "receiver_user_id": a},
        ]
    }, {"_id": 0})


async def _relation_status(me: str, other: str) -> str:
    """Relationship of `other` relative to `me`."""
    f = await _friendship_between(me, other)
    if not f:
        return "none"
    if f["status"] == "accepted":
        return "friends"
    if f["status"] == "blocked":
        return "blocked_by_me" if f["requester_user_id"] == me else "blocked_me"
    if f["status"] == "pending":
        return "request_sent" if f["requester_user_id"] == me else "request_received"
    return "none"


async def _member_count(lobby_id: str) -> int:
    return await db.lobby_members.count_documents({"lobby_id": lobby_id})


async def _expire_if_needed(lobby: dict):
    if lobby["status"] == "waiting" and _aware(lobby.get("expires_at")) and _aware(lobby["expires_at"]) < _now():
        await db.lobbies.update_one({"id": lobby["id"]}, {"$set": {"status": "expired"}})
        lobby["status"] = "expired"
    return lobby


async def _lobby_detail(lobby: dict, me: str):
    members = await db.lobby_members.find({"lobby_id": lobby["id"]}, {"_id": 0}).sort("joined_at", 1).to_list(10)
    invites = await db.lobby_invites.find(
        {"lobby_id": lobby["id"], "invite_type": "friend", "status": "pending"}, {"_id": 0}
    ).to_list(10)
    users_map = await _public_users_map(
        [m["user_id"] for m in members] + [inv["invited_user_id"] for inv in invites]
    )
    member_out = []
    for m in members:
        pu = users_map.get(m["user_id"])
        if pu:
            pu = dict(pu)
            pu.update({"role": m["role"], "score": m.get("score"), "finished": m.get("finished", False)})
            member_out.append(pu)
    # pending friend invites (not yet accepted)
    pending_friends = []
    for inv in invites:
        pu = users_map.get(inv["invited_user_id"])
        if pu:
            pu = dict(pu)
            pu["invite_id"] = inv["id"]
            pending_friends.append(pu)
    s = lobby.get("settings") or DEFAULT_SETTINGS
    return {
        "id": lobby["id"],
        "code": lobby["code"],
        "status": lobby["status"],
        "sport": (s.get("selected_categories") or ["general"])[0],
        "difficulty": s.get("difficulty"),
        "timer": s.get("timer_seconds"),
        "era": s.get("era_filter"),
        "max_players": s.get("max_players", MAX_PLAYERS),
        "settings": s,
        "settings_locked": bool(s.get("settings_locked")),
        "creator_user_id": lobby["creator_user_id"],
        "is_host": lobby["creator_user_id"] == me,
        "invite_token": lobby.get("invite_token"),
        "invite_url": _invite_url(lobby["invite_token"]) if lobby.get("invite_token") else None,
        "expires_at": _aware(lobby.get("expires_at")).isoformat() if lobby.get("expires_at") else None,
        "members": member_out,
        "member_count": len(member_out),
        "pending_friend_invites": pending_friends,
    }


async def _generate_questions(sport, difficulty, era, count=7):
    sport_name = SPORTS[sport]
    era_instruction = ERAS[era]
    count = max(3, min(count, 10))
    system = (
        "You are a sports trivia question generator. You output ONLY valid JSON, no prose, "
        "no markdown fences. Each question must be factually accurate and unambiguous."
    )
    prompt = (
        f"Generate {count} {difficulty}-difficulty multiple-choice trivia questions about {sport_name}. "
        f"{era_instruction} Vary the topics. "
        'Return a JSON array; each item has keys "question" (string), "options" (array of exactly 4 distinct '
        'strings), "correct_index" (integer 0-3). Output only the JSON array.'
    )
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"quiz_{uuid.uuid4().hex}", system_message=system).with_model(
        "gemini", "gemini-3-flash-preview"
    )
    raw = await chat.send_message(UserMessage(text=prompt))
    items = _parse_json_array(raw)
    out = []
    for it in items:
        opts = it.get("options", [])
        ci = it.get("correct_index", 0)
        if not isinstance(opts, list) or len(opts) != 4:
            continue
        if not isinstance(ci, int) or ci < 0 or ci > 3:
            ci = 0
        out.append({
            "id": uuid.uuid4().hex,
            "question": str(it.get("question", "")).strip(),
            "options": [str(o) for o in opts],
            "correct_index": ci,
        })
    return out


# ---------- Lobby settings ----------
GAME_TYPES_SUPPORTED = {"classic", "lightning", "streak", "deepcut"}
GAME_TYPES_COMINGSOON = {"survival", "wager", "team"}
DIFFICULTIES_SUPPORTED = {"casual", "normal", "hard", "expert", "deepcut", "mixed"}
DIFFICULTIES_COMINGSOON = {"adaptive"}
CATEGORIES_VALID = {"nba", "nfl", "mlb", "nhl", "soccer", "college", "combat", "olympics", "general"}
SUBCATEGORIES_VALID = {
    "player_stats", "awards", "championships", "drafts", "trades", "jersey_numbers",
    "stadiums", "teams_played_for", "role_players", "current_season", "historical_eras",
}
ERA_FILTERS = {"all", "current", "2020s", "2010s", "2000s", "1990s", "pre1990"}
ANSWER_FORMATS_SUPPORTED = {"multiple_choice", "true_false", "mixed"}
ANSWER_FORMATS_COMINGSOON = {"type_in"}

DEFAULT_SETTINGS = {
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

CAT_LABEL = {
    "nba": "NBA basketball", "nfl": "NFL American football", "mlb": "MLB baseball",
    "nhl": "NHL ice hockey", "soccer": "international soccer/football", "college": "US college sports",
    "combat": "combat sports (boxing/UFC/MMA)", "olympics": "the Olympic Games", "general": "general sports",
}
DIFF_TEXT = {
    "casual": "very easy, well-known", "normal": "medium", "hard": "hard",
    "expert": "very hard, expert-level",
    "deepcut": "extremely obscure deep-cut, focused on backups, role players and little-known facts",
    "mixed": "of mixed/varying",
}
ERA_TEXT = {
    "all": "across all eras of the sport's history",
    "current": "from the current season / most recent year only",
    "2020s": "from the 2020s decade", "2010s": "from the 2010s decade",
    "2000s": "from the 2000s decade", "1990s": "from the 1990s decade",
    "pre1990": "from before 1990",
}


def _validate_settings(raw: dict, base: dict = None) -> dict:
    s = dict(DEFAULT_SETTINGS)
    if base:
        s.update(base)
    if raw:
        for k, v in raw.items():
            if k in s and k != "settings_locked":
                s[k] = v

    gt = s["game_type"]
    if gt in GAME_TYPES_COMINGSOON:
        raise HTTPException(status_code=400, detail=f"{gt.title()} mode is coming soon")
    if gt not in GAME_TYPES_SUPPORTED:
        raise HTTPException(status_code=400, detail="Invalid game type")

    try:
        s["question_count"] = int(s["question_count"])
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid question count")
    if not (5 <= s["question_count"] <= 50):
        raise HTTPException(status_code=400, detail="Question count must be between 5 and 50")

    df = s["difficulty"]
    if df in DIFFICULTIES_COMINGSOON:
        raise HTTPException(status_code=400, detail="Adaptive difficulty is coming soon")
    if df not in DIFFICULTIES_SUPPORTED:
        raise HTTPException(status_code=400, detail="Invalid difficulty")

    cats = s["selected_categories"]
    if not isinstance(cats, list) or not cats:
        raise HTTPException(status_code=400, detail="Select at least one category")
    if any(c not in CATEGORIES_VALID for c in cats):
        raise HTTPException(status_code=400, detail="Invalid category selected")

    subs = s.get("selected_subcategories") or []
    if not isinstance(subs, list) or any(c not in SUBCATEGORIES_VALID for c in subs):
        raise HTTPException(status_code=400, detail="Invalid subcategory selected")
    s["selected_subcategories"] = subs

    if s["era_filter"] not in ERA_FILTERS:
        raise HTTPException(status_code=400, detail="Invalid era filter")

    af = s["answer_format"]
    if af in ANSWER_FORMATS_COMINGSOON:
        raise HTTPException(status_code=400, detail="Type-in answers are coming soon")
    if af not in ANSWER_FORMATS_SUPPORTED:
        raise HTTPException(status_code=400, detail="Invalid answer format")

    try:
        s["timer_seconds"] = int(s["timer_seconds"])
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid timer")
    if s["timer_seconds"] != 0 and not (5 <= s["timer_seconds"] <= 120):
        raise HTTPException(status_code=400, detail="Timer must be 0 (none) or between 5 and 120 seconds")

    try:
        s["max_players"] = int(s["max_players"])
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid max players")
    if not (2 <= s["max_players"] <= MAX_PLAYERS):
        raise HTTPException(status_code=400, detail=f"Max players must be between 2 and {MAX_PLAYERS}")

    for b in ("speed_bonus_enabled", "streak_bonus_enabled", "wrong_answer_penalty_enabled",
              "final_question_multiplier_enabled", "friends_only", "invite_only",
              "allow_rematch", "allow_spectators"):
        s[b] = bool(s[b])

    s["settings_locked"] = bool(base.get("settings_locked")) if base else False
    return s


async def _generate_lobby_questions(settings: dict):
    cats = ", ".join(CAT_LABEL.get(c, c) for c in settings["selected_categories"])
    diff = "deepcut" if settings["game_type"] == "deepcut" else settings["difficulty"]
    diff_text = DIFF_TEXT.get(diff, "medium")
    era_text = ERA_TEXT.get(settings["era_filter"], "across all eras")
    count = max(3, min(int(settings["question_count"]), 50))
    subs = settings.get("selected_subcategories") or []
    sub_text = f" Focus on these angles: {', '.join(subs)}." if subs else ""

    fmt = settings["answer_format"]
    if fmt == "true_false":
        fmt_text = ('each item is a factual STATEMENT to judge; "options" MUST be exactly ["True","False"] '
                    'and "correct_index" is 0 if the statement is true, else 1')
    elif fmt == "mixed":
        fmt_text = ('each item is EITHER a 4-option multiple choice (options = 4 distinct strings, correct_index 0-3) '
                    'OR a true/false (options = ["True","False"], correct_index 0 or 1)')
    else:
        fmt_text = 'each item has "options" (array of exactly 4 distinct strings) and "correct_index" (integer 0-3)'

    system = (
        "You are a sports trivia question generator. You output ONLY valid JSON, no prose, no markdown fences. "
        "Every question must be factually accurate and unambiguous."
    )
    prompt = (
        f"Generate {count} {diff_text}-difficulty sports trivia questions about {cats}, {era_text}.{sub_text} "
        f"Vary the topics. Return a JSON array where {fmt_text}. "
        'Each item also has a "question" key (string). Output only the JSON array.'
    )
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"lobby_{uuid.uuid4().hex}", system_message=system).with_model(
        "gemini", "gemini-3-flash-preview"
    )
    raw = await chat.send_message(UserMessage(text=prompt))
    items = _parse_json_array(raw)
    out = []
    for it in items:
        opts = it.get("options", [])
        ci = it.get("correct_index", 0)
        if not isinstance(opts, list) or len(opts) not in (2, 4):
            continue
        if not isinstance(ci, int) or ci < 0 or ci >= len(opts):
            ci = 0
        out.append({
            "id": uuid.uuid4().hex,
            "question": str(it.get("question", "")).strip(),
            "options": [str(o) for o in opts],
            "correct_index": ci,
        })
    return out


# ---------- Request bodies ----------
class FriendTargetBody(BaseModel):
    user_id: str


class CreateLobbyBody(BaseModel):
    settings: Optional[dict] = None


class SettingsBody(BaseModel):
    settings: dict


class JoinBody(BaseModel):
    token: str


class LobbyScoreBody(BaseModel):
    score: int
    correct: int
    total: int


# ---------- Friends API ----------
@api_router.get("/users/search")
async def search_users(q: str = "", authorization: Optional[str] = Header(None)):
    me = await get_current_user(authorization)
    q = (q or "").strip()
    if len(q) < 2:
        return []
    rx = {"$regex": re.escape(q), "$options": "i"}
    docs = await db.users.find(
        {"$or": [{"name": rx}, {"username": rx}, {"email": rx}, {"phone": rx}], "user_id": {"$ne": me["user_id"]}},
        {"_id": 0},
    ).limit(20).to_list(20)
    relations = await _relations_map(me["user_id"], [u["user_id"] for u in docs])
    out = []
    for u in docs:
        out.append({
            "user_id": u["user_id"],
            "name": _effective_name(u),
            "tagline": u.get("tagline"),
            "picture": _effective_picture(u),
            "online": _is_online(u),
            "relation": relations.get(u["user_id"], "none"),
        })
    return out


@api_router.post("/friends/request")
async def send_friend_request(body: FriendTargetBody, authorization: Optional[str] = Header(None)):
    me = await get_current_user(authorization)
    target = body.user_id
    if target == me["user_id"]:
        raise HTTPException(status_code=400, detail="You can't add yourself")
    if not await db.users.find_one({"user_id": target}):
        raise HTTPException(status_code=404, detail="User not found")
    existing = await _friendship_between(me["user_id"], target)
    if existing:
        if existing["status"] == "blocked":
            raise HTTPException(status_code=403, detail="Unavailable")
        if existing["status"] == "accepted":
            raise HTTPException(status_code=400, detail="Already friends")
        # reverse pending -> auto accept
        if existing["status"] == "pending" and existing["receiver_user_id"] == me["user_id"]:
            await db.friendships.update_one({"id": existing["id"]}, {"$set": {"status": "accepted", "updated_at": _now()}})
            return {"status": "accepted"}
        raise HTTPException(status_code=400, detail="Request already pending")
    await db.friendships.insert_one({
        "id": uuid.uuid4().hex,
        "requester_user_id": me["user_id"],
        "receiver_user_id": target,
        "status": "pending",
        "created_at": _now(),
        "updated_at": _now(),
    })
    return {"status": "pending"}


@api_router.post("/friends/{friendship_id}/accept")
async def accept_friend(friendship_id: str, authorization: Optional[str] = Header(None)):
    me = await get_current_user(authorization)
    f = await db.friendships.find_one({"id": friendship_id}, {"_id": 0})
    if not f or f["status"] != "pending":
        raise HTTPException(status_code=404, detail="Request not found")
    if f["receiver_user_id"] != me["user_id"]:
        raise HTTPException(status_code=403, detail="Not your request to accept")
    await db.friendships.update_one({"id": friendship_id}, {"$set": {"status": "accepted", "updated_at": _now()}})
    return {"status": "accepted"}


@api_router.post("/friends/{friendship_id}/decline")
async def decline_friend(friendship_id: str, authorization: Optional[str] = Header(None)):
    me = await get_current_user(authorization)
    f = await db.friendships.find_one({"id": friendship_id}, {"_id": 0})
    if not f or f["status"] != "pending":
        raise HTTPException(status_code=404, detail="Request not found")
    if f["receiver_user_id"] != me["user_id"]:
        raise HTTPException(status_code=403, detail="Not your request to decline")
    await db.friendships.delete_one({"id": friendship_id})
    return {"status": "declined"}


@api_router.post("/friends/remove")
async def remove_friend(body: FriendTargetBody, authorization: Optional[str] = Header(None)):
    me = await get_current_user(authorization)
    f = await _friendship_between(me["user_id"], body.user_id)
    if not f or f["status"] != "accepted":
        raise HTTPException(status_code=404, detail="Not friends")
    await db.friendships.delete_one({"id": f["id"]})
    return {"status": "removed"}


@api_router.post("/friends/block")
async def block_user(body: FriendTargetBody, authorization: Optional[str] = Header(None)):
    me = await get_current_user(authorization)
    if body.user_id == me["user_id"]:
        raise HTTPException(status_code=400, detail="You can't block yourself")
    f = await _friendship_between(me["user_id"], body.user_id)
    if f:
        await db.friendships.delete_one({"id": f["id"]})
    await db.friendships.insert_one({
        "id": uuid.uuid4().hex,
        "requester_user_id": me["user_id"],  # blocker
        "receiver_user_id": body.user_id,
        "status": "blocked",
        "created_at": _now(),
        "updated_at": _now(),
    })
    return {"status": "blocked"}


@api_router.post("/friends/unblock")
async def unblock_user(body: FriendTargetBody, authorization: Optional[str] = Header(None)):
    me = await get_current_user(authorization)
    await db.friendships.delete_one({
        "requester_user_id": me["user_id"], "receiver_user_id": body.user_id, "status": "blocked"
    })
    return {"status": "unblocked"}


@api_router.get("/friends")
async def list_friends(authorization: Optional[str] = Header(None)):
    me = await get_current_user(authorization)
    docs = await db.friendships.find(
        {"status": "accepted", "$or": [{"requester_user_id": me["user_id"]}, {"receiver_user_id": me["user_id"]}]},
        {"_id": 0},
    ).to_list(200)
    others = [
        f["receiver_user_id"] if f["requester_user_id"] == me["user_id"] else f["requester_user_id"]
        for f in docs
    ]
    users_map = await _public_users_map(others)
    out = [users_map[o] for o in others if o in users_map]
    out.sort(key=lambda x: (not x["online"], x["name"].lower()))
    return out


@api_router.get("/friends/requests")
async def friend_requests(authorization: Optional[str] = Header(None)):
    me = await get_current_user(authorization)
    docs = await db.friendships.find(
        {"status": "pending", "receiver_user_id": me["user_id"]}, {"_id": 0}
    ).to_list(100)
    users_map = await _public_users_map([f["requester_user_id"] for f in docs])
    out = []
    for f in docs:
        pu = users_map.get(f["requester_user_id"])
        if pu:
            pu = dict(pu)
            pu["friendship_id"] = f["id"]
            out.append(pu)
    return out


# ---------- Lobby API ----------
@api_router.post("/lobbies")
async def create_lobby(body: CreateLobbyBody, authorization: Optional[str] = Header(None)):
    me = await get_current_user(authorization)
    settings = _validate_settings(body.settings or {})
    lobby_id = uuid.uuid4().hex
    lobby = {
        "id": lobby_id,
        "creator_user_id": me["user_id"],
        "code": _gen_code(),
        "invite_token": _gen_token(),
        "status": "waiting",
        "settings": settings,
        "questions": None,
        "created_at": _now(),
        "updated_at": _now(),
        "expires_at": _now() + LOBBY_TTL,
    }
    await db.lobbies.insert_one(lobby)
    await db.lobby_members.insert_one({
        "id": uuid.uuid4().hex,
        "lobby_id": lobby_id,
        "user_id": me["user_id"],
        "role": "host",
        "score": None,
        "finished": False,
        "joined_at": _now(),
    })
    return await _lobby_detail(lobby, me["user_id"])


@api_router.get("/lobbies/{lobby_id}/settings")
async def get_lobby_settings(lobby_id: str, authorization: Optional[str] = Header(None)):
    me = await get_current_user(authorization)
    lobby = await _require_member(lobby_id, me["user_id"])
    s = lobby.get("settings") or DEFAULT_SETTINGS
    return {"settings": s, "is_host": lobby["creator_user_id"] == me["user_id"], "locked": bool(s.get("settings_locked"))}


@api_router.put("/lobbies/{lobby_id}/settings")
async def update_lobby_settings(lobby_id: str, body: SettingsBody, authorization: Optional[str] = Header(None)):
    me = await get_current_user(authorization)
    lobby = await _require_member(lobby_id, me["user_id"])
    if lobby["creator_user_id"] != me["user_id"]:
        raise HTTPException(status_code=403, detail="Only the host can change settings")
    current = lobby.get("settings") or DEFAULT_SETTINGS
    if current.get("settings_locked") or lobby["status"] != "waiting":
        raise HTTPException(status_code=409, detail="Settings are locked — the game has started")
    new_settings = _validate_settings(body.settings, base=current)
    await db.lobbies.update_one({"id": lobby_id}, {"$set": {"settings": new_settings, "updated_at": _now()}})
    return {"settings": new_settings}


async def _require_member(lobby_id: str, user_id: str):
    lobby = await db.lobbies.find_one({"id": lobby_id}, {"_id": 0})
    if not lobby:
        raise HTTPException(status_code=404, detail="Lobby not found")
    await _expire_if_needed(lobby)
    member = await db.lobby_members.find_one({"lobby_id": lobby_id, "user_id": user_id}, {"_id": 0})
    if not member:
        raise HTTPException(status_code=403, detail="You are not in this lobby")
    return lobby


@api_router.get("/lobbies/{lobby_id}")
async def get_lobby(lobby_id: str, authorization: Optional[str] = Header(None)):
    me = await get_current_user(authorization)
    lobby = await _require_member(lobby_id, me["user_id"])
    return await _lobby_detail(lobby, me["user_id"])


@api_router.post("/lobbies/{lobby_id}/invite")
async def get_or_rotate_invite(lobby_id: str, authorization: Optional[str] = Header(None)):
    """Return the shareable invite (host only). Used to feed the native Share Sheet."""
    me = await get_current_user(authorization)
    lobby = await _require_member(lobby_id, me["user_id"])
    if lobby["creator_user_id"] != me["user_id"]:
        raise HTTPException(status_code=403, detail="Only the host can invite")
    token = lobby.get("invite_token") or _gen_token()
    if not lobby.get("invite_token"):
        await db.lobbies.update_one({"id": lobby_id}, {"$set": {"invite_token": token}})
    return {
        "inviteToken": token,
        "inviteUrl": _invite_url(token),
        "expiresAt": _aware(lobby.get("expires_at")).isoformat() if lobby.get("expires_at") else None,
    }


@api_router.post("/lobbies/{lobby_id}/revoke-invite")
async def revoke_invite(lobby_id: str, authorization: Optional[str] = Header(None)):
    me = await get_current_user(authorization)
    lobby = await _require_member(lobby_id, me["user_id"])
    if lobby["creator_user_id"] != me["user_id"]:
        raise HTTPException(status_code=403, detail="Only the host can revoke")
    token = _gen_token()
    await db.lobbies.update_one({"id": lobby_id}, {"$set": {"invite_token": token}})
    return {"inviteToken": token, "inviteUrl": _invite_url(token)}


@api_router.post("/lobbies/{lobby_id}/invite/friend")
async def invite_friend(lobby_id: str, body: FriendTargetBody, authorization: Optional[str] = Header(None)):
    me = await get_current_user(authorization)
    lobby = await _require_member(lobby_id, me["user_id"])
    if lobby["status"] != "waiting":
        raise HTTPException(status_code=409, detail="Lobby is not accepting players")
    rel = await _relation_status(me["user_id"], body.user_id)
    if rel != "friends":
        raise HTTPException(status_code=403, detail="You can only invite friends")
    if await db.lobby_members.find_one({"lobby_id": lobby_id, "user_id": body.user_id}):
        raise HTTPException(status_code=400, detail="Already in the lobby")
    dup = await db.lobby_invites.find_one({
        "lobby_id": lobby_id, "invite_type": "friend", "invited_user_id": body.user_id, "status": "pending"
    })
    if dup:
        raise HTTPException(status_code=400, detail="Already invited")
    reserved = await _member_count(lobby_id) + await db.lobby_invites.count_documents(
        {"lobby_id": lobby_id, "invite_type": "friend", "status": "pending"}
    )
    if reserved >= MAX_PLAYERS:
        raise HTTPException(status_code=409, detail="Lobby is full")
    await db.lobby_invites.insert_one({
        "id": uuid.uuid4().hex,
        "lobby_id": lobby_id,
        "invite_type": "friend",
        "invited_phone_number": None,
        "invited_user_id": body.user_id,
        "invite_token": None,
        "status": "pending",
        "created_at": _now(),
        "expires_at": _now() + INVITE_TTL,
        "accepted_by_user_id": None,
    })
    return {"status": "invited"}


async def _do_join(lobby: dict, user_id: str):
    """Validated join used by both link + friend flows. Returns lobby detail."""
    await _expire_if_needed(lobby)
    if lobby["status"] == "expired":
        raise HTTPException(status_code=410, detail="This lobby has expired")
    if lobby["status"] in ("active", "completed"):
        raise HTTPException(status_code=409, detail="This game has already started")
    if lobby["status"] != "waiting":
        raise HTTPException(status_code=409, detail="Lobby unavailable")
    existing = await db.lobby_members.find_one({"lobby_id": lobby["id"], "user_id": user_id}, {"_id": 0})
    if existing:
        return await _lobby_detail(lobby, user_id)  # idempotent reconnect
    if await _member_count(lobby["id"]) >= (lobby.get("settings") or DEFAULT_SETTINGS).get("max_players", MAX_PLAYERS):
        raise HTTPException(status_code=409, detail="This lobby is full")
    await db.lobby_members.insert_one({
        "id": uuid.uuid4().hex,
        "lobby_id": lobby["id"],
        "user_id": user_id,
        "role": "player",
        "score": None,
        "finished": False,
        "joined_at": _now(),
    })
    return await _lobby_detail(lobby, user_id)


@api_router.get("/join/{token}")
async def validate_invite(token: str):
    """Public: validate an invite link before auth so the join screen can show state."""
    lobby = await db.lobbies.find_one({"invite_token": token}, {"_id": 0})
    if not lobby:
        return {"valid": False, "reason": "invalid", "message": "This invite link is invalid."}
    await _expire_if_needed(lobby)
    count = await _member_count(lobby["id"])
    if lobby["status"] == "expired":
        return {"valid": False, "reason": "expired", "message": "This invite has expired."}
    if lobby["status"] in ("active", "completed"):
        return {"valid": False, "reason": "started", "message": "This game has already started."}
    s = lobby.get("settings") or DEFAULT_SETTINGS
    if count >= s.get("max_players", MAX_PLAYERS):
        return {"valid": False, "reason": "full", "message": "This lobby is full."}
    host = await _public_user(lobby["creator_user_id"])
    return {
        "valid": True,
        "lobby_id": lobby["id"],
        "code": lobby["code"],
        "sport": (s.get("selected_categories") or ["general"])[0],
        "host_name": host["name"] if host else "A player",
        "member_count": count,
        "max_players": s.get("max_players", MAX_PLAYERS),
    }


@api_router.post("/join")
async def join_by_token(body: JoinBody, authorization: Optional[str] = Header(None)):
    me = await get_current_user(authorization)
    lobby = await db.lobbies.find_one({"invite_token": body.token}, {"_id": 0})
    if not lobby:
        raise HTTPException(status_code=404, detail="Invalid invite link")
    return await _do_join(lobby, me["user_id"])


@api_router.post("/lobbies/{lobby_id}/leave")
async def leave_lobby(lobby_id: str, authorization: Optional[str] = Header(None)):
    me = await get_current_user(authorization)
    lobby = await db.lobbies.find_one({"id": lobby_id}, {"_id": 0})
    if not lobby:
        raise HTTPException(status_code=404, detail="Lobby not found")
    await db.lobby_members.delete_one({"lobby_id": lobby_id, "user_id": me["user_id"]})
    if lobby["creator_user_id"] == me["user_id"]:
        # host leaving cancels the lobby
        await db.lobbies.update_one({"id": lobby_id}, {"$set": {"status": "expired"}})
        await db.lobby_members.delete_many({"lobby_id": lobby_id})
    return {"status": "left"}


@api_router.post("/lobbies/{lobby_id}/start")
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
    try:
        questions = await _generate_lobby_questions(settings)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Lobby question generation failed: {e}")
        raise HTTPException(status_code=502, detail="Couldn't generate questions, try again")
    if len(questions) < 3:
        raise HTTPException(
            status_code=502,
            detail="Not enough questions matched your filters. Try broadening categories, era or difficulty.",
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


@api_router.get("/lobbies/{lobby_id}/game")
async def lobby_game(lobby_id: str, authorization: Optional[str] = Header(None)):
    me = await get_current_user(authorization)
    lobby = await _require_member(lobby_id, me["user_id"])
    if lobby["status"] not in ("active", "completed") or not lobby.get("questions"):
        raise HTTPException(status_code=409, detail="Game has not started")
    return {"questions": lobby["questions"], "settings": lobby.get("settings") or DEFAULT_SETTINGS}


@api_router.post("/lobbies/{lobby_id}/score")
async def submit_lobby_score(lobby_id: str, body: LobbyScoreBody, authorization: Optional[str] = Header(None)):
    me = await get_current_user(authorization)
    lobby = await _require_member(lobby_id, me["user_id"])
    member = await db.lobby_members.find_one({"lobby_id": lobby_id, "user_id": me["user_id"]}, {"_id": 0})
    if member.get("finished"):
        return await _lobby_detail(lobby, me["user_id"])  # idempotent
    await db.lobby_members.update_one(
        {"lobby_id": lobby_id, "user_id": me["user_id"]},
        {"$set": {"score": body.score, "finished": True}},
    )
    # also credit global profile stats + leaderboard
    u = await db.users.find_one({"user_id": me["user_id"]}, {"_id": 0})
    cat = ((lobby.get("settings") or DEFAULT_SETTINGS).get("selected_categories") or ["general"])[0]
    sport_scores = u.get("sport_scores", {}) or {}
    sport_scores[cat] = sport_scores.get(cat, 0) + body.score
    best_sport = max(sport_scores, key=sport_scores.get) if sport_scores else None
    await db.users.update_one(
        {"user_id": me["user_id"]},
        {"$inc": {"total_score": body.score, "matches": 1, "correct_answers": body.correct, "total_answers": body.total},
         "$set": {"sport_scores": sport_scores, "best_sport": best_sport}},
    )
    # if everyone finished, mark completed
    total_m = await _member_count(lobby_id)
    fin_m = await db.lobby_members.count_documents({"lobby_id": lobby_id, "finished": True})
    if fin_m >= total_m:
        await db.lobbies.update_one({"id": lobby_id}, {"$set": {"status": "completed"}})
        lobby["status"] = "completed"
    return await _lobby_detail(lobby, me["user_id"])


# ---------- In-app lobby invites (friend) ----------
@api_router.get("/lobby-invites")
async def my_lobby_invites(authorization: Optional[str] = Header(None)):
    me = await get_current_user(authorization)
    docs = await db.lobby_invites.find(
        {"invite_type": "friend", "invited_user_id": me["user_id"], "status": "pending"}, {"_id": 0}
    ).to_list(50)
    lobby_ids = [inv["lobby_id"] for inv in docs]
    lobbies = await db.lobbies.find(
        {"id": {"$in": lobby_ids}, "status": "waiting"}, {"_id": 0}
    ).to_list(len(lobby_ids) or 1)
    lobby_map = {lb["id"]: lb for lb in lobbies}
    hosts_map = await _public_users_map([lb["creator_user_id"] for lb in lobbies])
    # batch member counts via aggregation
    counts = {}
    if lobbies:
        agg = await db.lobby_members.aggregate([
            {"$match": {"lobby_id": {"$in": list(lobby_map.keys())}}},
            {"$group": {"_id": "$lobby_id", "n": {"$sum": 1}}},
        ]).to_list(len(lobby_map))
        counts = {row["_id"]: row["n"] for row in agg}
    out = []
    for inv in docs:
        lobby = lobby_map.get(inv["lobby_id"])
        if not lobby:
            continue
        host = hosts_map.get(lobby["creator_user_id"])
        out.append({
            "invite_id": inv["id"],
            "lobby_id": lobby["id"],
            "sport": ((lobby.get("settings") or DEFAULT_SETTINGS).get("selected_categories") or ["general"])[0],
            "host_name": host["name"] if host else "A friend",
            "host_picture": host["picture"] if host else None,
            "member_count": counts.get(lobby["id"], 0),
            "max_players": lobby["max_players"],
        })
    return out


@api_router.post("/lobby-invites/{invite_id}/accept")
async def accept_lobby_invite(invite_id: str, authorization: Optional[str] = Header(None)):
    me = await get_current_user(authorization)
    inv = await db.lobby_invites.find_one({"id": invite_id}, {"_id": 0})
    if not inv or inv["status"] != "pending" or inv["invited_user_id"] != me["user_id"]:
        raise HTTPException(status_code=404, detail="Invite not found")
    lobby = await db.lobbies.find_one({"id": inv["lobby_id"]}, {"_id": 0})
    if not lobby:
        raise HTTPException(status_code=404, detail="Lobby no longer exists")
    detail = await _do_join(lobby, me["user_id"])
    await db.lobby_invites.update_one(
        {"id": invite_id}, {"$set": {"status": "accepted", "accepted_by_user_id": me["user_id"]}}
    )
    return detail


@api_router.post("/lobby-invites/{invite_id}/decline")
async def decline_lobby_invite(invite_id: str, authorization: Optional[str] = Header(None)):
    me = await get_current_user(authorization)
    inv = await db.lobby_invites.find_one({"id": invite_id}, {"_id": 0})
    if not inv or inv["invited_user_id"] != me["user_id"]:
        raise HTTPException(status_code=404, detail="Invite not found")
    await db.lobby_invites.update_one({"id": invite_id}, {"$set": {"status": "declined"}})
    return {"status": "declined"}


app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.users.create_index("username")
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.friendships.create_index([("requester_user_id", 1), ("receiver_user_id", 1)])
    await db.lobbies.create_index("id", unique=True)
    await db.lobbies.create_index("invite_token")
    await db.lobby_members.create_index([("lobby_id", 1), ("user_id", 1)])
    await db.lobby_invites.create_index("invited_user_id")
    await db.lobby_invites.create_index("lobby_id")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
