"""Admin-controlled registration modes and limited-use signup invites."""
from __future__ import annotations

import hashlib
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Callable, Literal
from urllib.parse import quote

from fastapi import Header, HTTPException
from pydantic import BaseModel, EmailStr, Field
from pymongo import ReturnDocument

import auth_native
import user_access

SETTINGS_COLLECTION = "app_settings"
INVITES_COLLECTION = "registration_invites"
SETTING_ID = "registration_access"
DEFAULT_MODE = os.environ.get("REGISTRATION_MODE", "invite").strip().lower()
if DEFAULT_MODE not in {"open", "invite", "closed"}:
    DEFAULT_MODE = "invite"


def now() -> datetime:
    return datetime.now(timezone.utc)


def token_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


class ModeBody(BaseModel):
    mode: Literal["open", "invite", "closed"]


class InviteBody(BaseModel):
    max_uses: int = Field(default=1, ge=1, le=500)
    expires_hours: int = Field(default=168, ge=1, le=2160)


class ControlledRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    username: str | None = Field(default=None, min_length=3, max_length=20)
    invite: str | None = Field(default=None, max_length=512)


async def get_mode(db) -> str:
    doc = await db[SETTINGS_COLLECTION].find_one({"id": SETTING_ID}, {"_id": 0, "mode": 1})
    mode = str((doc or {}).get("mode") or DEFAULT_MODE).lower()
    return mode if mode in {"open", "invite", "closed"} else DEFAULT_MODE


async def reserve_invite(db, raw: str | None) -> dict | None:
    mode = await get_mode(db)
    if mode == "open":
        return None
    if mode == "closed":
        raise HTTPException(status_code=403, detail="New account registration is currently closed")

    token = str(raw or "").strip()
    if not token:
        raise HTTPException(status_code=403, detail="A valid signup invite is required")

    stamp = now()
    invite = await db[INVITES_COLLECTION].find_one_and_update(
        {
            "token_hash": token_hash(token),
            "enabled": True,
            "expires_at": {"$gt": stamp},
            "$expr": {"$lt": ["$uses", "$max_uses"]},
        },
        {"$inc": {"uses": 1}, "$set": {"last_used_at": stamp}},
        return_document=ReturnDocument.AFTER,
    )
    if not invite:
        raise HTTPException(status_code=403, detail="Signup invite is invalid, expired, or fully used")
    return invite


async def release_invite(db, invite: dict | None) -> None:
    if invite:
        await db[INVITES_COLLECTION].update_one(
            {"id": invite.get("id"), "uses": {"$gt": 0}},
            {"$inc": {"uses": -1}},
        )


async def ensure_username(db, user_id: str, base: str) -> str:
    clean = re.sub(r"[^a-zA-Z0-9_]", "", (base or "player").replace(" ", "")).lower()[:16] or "player"
    if len(clean) < 3:
        clean = (clean + "player")[:6]
    candidate = clean
    suffix = 0
    while await db.users.find_one(
        {"username": {"$regex": f"^{re.escape(candidate)}$", "$options": "i"}, "user_id": {"$ne": user_id}},
        {"_id": 0, "user_id": 1},
    ):
        suffix += 1
        candidate = f"{clean}{suffix}"
    return candidate


def signup_url(token: str) -> str:
    base = os.environ.get("APP_BASE_URL", "").strip().rstrip("/")
    path = f"/login?invite={quote(token)}"
    return f"{base}{path}" if base else path


def _remove_native_register_route(router) -> None:
    router.routes = [
        route
        for route in router.routes
        if not (
            getattr(route, "path", None) == "/auth/register"
            and "POST" in getattr(route, "methods", set())
        )
    ]


def register_routes(
    router,
    *,
    db,
    get_current_user: Callable,
    user_out: Callable,
    require_admin: Callable,
) -> None:
    # auth_native is registered first. Replace only its public registration route;
    # login, password reset, logout, and credential migration remain untouched.
    _remove_native_register_route(router)

    @router.get("/registration/status")
    async def public_status():
        return {"mode": await get_mode(db)}

    @router.post("/auth/register")
    async def controlled_register(body: ControlledRegisterRequest):
        email = auth_native._email(str(body.email))
        username = auth_native._validate_requested_username(body.username)
        if await db.users.find_one(auth_native._email_query(email), {"_id": 0, "user_id": 1}):
            raise HTTPException(status_code=409, detail="An account already exists for this email")

        invite = await reserve_invite(db, body.invite)
        full_access = await user_access.resolve_initial_access(db, email)
        user_id = f"user_{secrets.token_hex(6)}"
        stamp = now()
        try:
            await db.users.insert_one(
                {
                    "user_id": user_id,
                    "email": email,
                    "email_normalized": email,
                    "password_hash": auth_native._hash_password(body.password),
                    "auth_provider": "deepcut_password",
                    "credential_provider": "deepcut_password",
                    "credential_status": "active",
                    "credential_migration_required": False,
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
                    "full_app_access": full_access,
                    "full_app_access_source": "preapproved_email" if full_access else "default",
                    "full_app_access_granted_at": stamp if full_access else None,
                    "registration_source": "invite" if invite else "open",
                    "registration_invite_id": invite.get("id") if invite else None,
                    "created_at": stamp,
                }
            )
            assigned = await ensure_username(db, user_id, username or email.split("@", 1)[0])
            await db.users.update_one({"user_id": user_id}, {"$set": {"username": assigned}})
        except Exception:
            await db.users.delete_one({"user_id": user_id})
            await release_invite(db, invite)
            raise

        user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        session = await auth_native._issue_session(db, user_id)
        return {"session_token": session, "user": user_out(user)}

    @router.get("/admin/registration")
    async def admin_status(authorization: str | None = Header(None)):
        admin = await get_current_user(authorization)
        await require_admin(admin)
        stamp = now()
        invites = await db[INVITES_COLLECTION].find(
            {"enabled": True, "expires_at": {"$gt": stamp}},
            {"_id": 0, "token_hash": 0},
        ).sort("created_at", -1).limit(100).to_list(100)
        return {"mode": await get_mode(db), "invites": invites}

    @router.put("/admin/registration/mode")
    async def set_mode(body: ModeBody, authorization: str | None = Header(None)):
        admin = await get_current_user(authorization)
        await require_admin(admin)
        await db[SETTINGS_COLLECTION].update_one(
            {"id": SETTING_ID},
            {
                "$set": {
                    "id": SETTING_ID,
                    "mode": body.mode,
                    "updated_at": now(),
                    "updated_by": admin.get("user_id"),
                }
            },
            upsert=True,
        )
        return {"mode": body.mode}

    @router.post("/admin/registration/invites")
    async def create_invite(body: InviteBody, authorization: str | None = Header(None)):
        admin = await get_current_user(authorization)
        await require_admin(admin)
        raw = secrets.token_urlsafe(32)
        stamp = now()
        invite_id = f"invite_{secrets.token_hex(8)}"
        expires_at = stamp + timedelta(hours=body.expires_hours)
        await db[INVITES_COLLECTION].insert_one(
            {
                "id": invite_id,
                "token_hash": token_hash(raw),
                "enabled": True,
                "max_uses": body.max_uses,
                "uses": 0,
                "created_at": stamp,
                "expires_at": expires_at,
                "created_by": admin.get("user_id"),
            }
        )
        return {
            "id": invite_id,
            "token": raw,
            "signup_url": signup_url(raw),
            "max_uses": body.max_uses,
            "uses": 0,
            "expires_at": expires_at,
        }

    @router.delete("/admin/registration/invites/{invite_id}")
    async def revoke(invite_id: str, authorization: str | None = Header(None)):
        admin = await get_current_user(authorization)
        await require_admin(admin)
        await db[INVITES_COLLECTION].update_one(
            {"id": invite_id},
            {"$set": {"enabled": False, "revoked_at": now(), "revoked_by": admin.get("user_id")}},
        )
        return {"ok": True}


async def ensure_indexes(db) -> None:
    await db[INVITES_COLLECTION].create_index("id", unique=True)
    await db[INVITES_COLLECTION].create_index("token_hash", unique=True)
    await db[INVITES_COLLECTION].create_index("expires_at", expireAfterSeconds=0)
