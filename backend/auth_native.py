"""First-party DeepCut authentication.

This module deliberately reuses the existing `user_sessions` collection and bearer-token
contract so the rest of the API does not need to know whether a user authenticated through
the legacy provider or directly with DeepCut credentials.
"""

from datetime import datetime, timedelta, timezone
import re
import secrets
from typing import Callable

import bcrypt
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, EmailStr, Field

SESSION_TTL = timedelta(days=30)
USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]{3,20}$")
BANNED_WORDS = {
    "admin", "root", "fuck", "shit", "bitch", "nigger", "nigga", "cunt",
    "faggot", "rape", "nazi", "slut", "whore", "dick", "pussy",
}


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    username: str | None = Field(default=None, min_length=3, max_length=20)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class SetPasswordRequest(BaseModel):
    password: str = Field(min_length=8, max_length=128)


def _email(value: str) -> str:
    return value.strip().lower()


def _email_query(email: str) -> dict:
    return {
        "$or": [
            {"email_normalized": email},
            {"email": {"$regex": f"^{re.escape(email)}$", "$options": "i"}},
        ]
    }


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def _verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (TypeError, ValueError):
        return False


def _validate_requested_username(username: str | None) -> str | None:
    if username is None:
        return None
    value = username.strip()
    if not USERNAME_RE.fullmatch(value):
        raise HTTPException(status_code=400, detail="Username must be 3-20 letters, numbers or underscores")
    low = value.lower()
    if any(word in low for word in BANNED_WORDS):
        raise HTTPException(status_code=400, detail="That username isn't allowed")
    return value


async def _issue_session(db, user_id: str) -> str:
    now = datetime.now(timezone.utc)
    token = secrets.token_urlsafe(32)
    await db.user_sessions.insert_one(
        {
            "session_token": token,
            "user_id": user_id,
            "expires_at": now + SESSION_TTL,
            "created_at": now,
            "auth_provider": "deepcut_password",
        }
    )
    return token


def register_routes(
    router: APIRouter,
    *,
    db,
    get_current_user: Callable,
    ensure_username: Callable,
    user_out: Callable,
) -> None:
    @router.post("/auth/register")
    async def register(body: RegisterRequest):
        email = _email(str(body.email))
        requested_username = _validate_requested_username(body.username)
        existing = await db.users.find_one(_email_query(email), {"_id": 0})
        if existing:
            raise HTTPException(status_code=409, detail="An account already exists for this email")

        user_id = f"user_{secrets.token_hex(6)}"
        now = datetime.now(timezone.utc)
        await db.users.insert_one(
            {
                "user_id": user_id,
                "email": email,
                "email_normalized": email,
                "password_hash": _hash_password(body.password),
                "auth_provider": "deepcut_password",
                "name": None,
                "picture": None,
                "username": None,
                "tagline": None,
                "avatar": None,
                "total_score": 0,
                "matches": 0,
                "correct_answers": 0,
                "total_answers": 0,
                "best_sport": None,
                "sport_scores": {},
                "created_at": now,
            }
        )

        preferred = requested_username or email.split("@", 1)[0]
        username = await ensure_username(user_id, preferred)
        await db.users.update_one({"user_id": user_id}, {"$set": {"username": username}})
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        token = await _issue_session(db, user_id)
        return {"session_token": token, "user": user_out(user)}

    @router.post("/auth/login")
    async def login(body: LoginRequest):
        email = _email(str(body.email))
        user = await db.users.find_one(_email_query(email), {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Invalid email or password")

        password_hash = user.get("password_hash")
        if not password_hash:
            raise HTTPException(
                status_code=409,
                detail="This existing account has not been migrated to DeepCut credentials yet",
            )
        if not _verify_password(body.password, password_hash):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        token = await _issue_session(db, user["user_id"])
        return {"session_token": token, "user": user_out(user)}

    @router.post("/auth/set-password")
    async def set_password(body: SetPasswordRequest, authorization: str | None = Header(None)):
        """Allow an already-authenticated legacy account to opt into first-party credentials."""
        user = await get_current_user(authorization)
        email = _email(user.get("email") or "")
        if not email:
            raise HTTPException(status_code=400, detail="Account does not have an email address")

        collision = await db.users.find_one(
            {"email_normalized": email, "user_id": {"$ne": user["user_id"]}},
            {"_id": 0, "user_id": 1},
        )
        if collision:
            raise HTTPException(status_code=409, detail="Email is already attached to another account")

        await db.users.update_one(
            {"user_id": user["user_id"]},
            {
                "$set": {
                    "email": email,
                    "email_normalized": email,
                    "password_hash": _hash_password(body.password),
                    "auth_provider": "deepcut_password",
                    "password_migrated_at": datetime.now(timezone.utc),
                }
            },
        )
        return {"ok": True}


async def ensure_indexes(db) -> None:
    # Sparse keeps legacy records that do not yet have `email_normalized` compatible
    # while guaranteeing new/migrated credential accounts cannot duplicate an email.
    await db.users.create_index("email_normalized", unique=True, sparse=True)
    # These are intentionally the same definitions as the legacy startup indexes.
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
