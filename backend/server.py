import os
import re
import json
import uuid
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
            "total_score": 0,
            "matches": 0,
            "correct_answers": 0,
            "total_answers": 0,
            "best_sport": None,
            "sport_scores": {},
            "created_at": datetime.now(timezone.utc),
        })

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
    return {"session_token": session_token, "user": user}


@api_router.get("/auth/me")
async def auth_me(authorization: Optional[str] = Header(None)):
    return await get_current_user(authorization)


@api_router.post("/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


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
            "name": u.get("name") or "Player",
            "picture": u.get("picture"),
            "total_score": u.get("total_score", 0),
            "matches": u.get("matches", 0),
        })
    my_rank = await db.users.count_documents({"total_score": {"$gt": me.get("total_score", 0)}}) + 1
    return {
        "top": top,
        "me": {
            "rank": my_rank,
            "user_id": me["user_id"],
            "name": me.get("name") or "Player",
            "picture": me.get("picture"),
            "total_score": me.get("total_score", 0),
            "matches": me.get("matches", 0),
        },
    }


@api_router.get("/sports")
async def list_sports():
    return [{"key": k, "name": v} for k, v in SPORTS.items()]


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
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
