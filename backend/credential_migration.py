"""Migrate legacy-auth accounts to credentials owned by DeepCut Sports.

Passwords from the retired provider cannot be imported because DeepCut never received
plaintext credentials. Existing sessions can instead activate a new DeepCut password.
This module classifies every account, exposes migration state in user payloads, and
issues a fresh first-party session after activation.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import logging
import re
import secrets
from typing import Any, Callable

import bcrypt
from fastapi import Header, HTTPException
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError


SESSION_TTL = timedelta(days=30)
ACTIVE = "active"
ACTIVATION_REQUIRED = "activation_required"
EMAIL_CONFLICT = "email_conflict"
MISSING_EMAIL = "missing_email"
DEEPCUT_PROVIDER = "deepcut_password"
LEGACY_PROVIDER = "legacy_migration_pending"
BLOCKING_STATUSES = {EMAIL_CONFLICT, MISSING_EMAIL}

logger = logging.getLogger(__name__)


class CredentialActivationRequest(BaseModel):
    password: str = Field(min_length=8, max_length=128)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def normalize_email(value: str | None) -> str:
    return str(value or "").strip().lower()


def email_query(email: str, *, exclude_user_id: str | None = None) -> dict[str, Any]:
    normalized = normalize_email(email)
    query: dict[str, Any] = {
        "$or": [
            {"email_normalized": normalized},
            {"email": {"$regex": f"^{re.escape(normalized)}$", "$options": "i"}},
        ]
    }
    if exclude_user_id:
        query["user_id"] = {"$ne": exclude_user_id}
    return query


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def credential_fields(user: dict[str, Any]) -> dict[str, Any]:
    """Return public, non-secret migration state for an account."""
    has_password = bool(user.get("password_hash"))
    stored_status = str(user.get("credential_status") or "")
    if stored_status in BLOCKING_STATUSES:
        return {
            "credential_provider": DEEPCUT_PROVIDER if has_password else LEGACY_PROVIDER,
            "credential_status": stored_status,
            "credential_migration_required": True,
        }
    if has_password:
        return {
            "credential_provider": DEEPCUT_PROVIDER,
            "credential_status": ACTIVE,
            "credential_migration_required": False,
        }

    status = stored_status or ACTIVATION_REQUIRED
    if status == ACTIVE:
        status = ACTIVATION_REQUIRED
    return {
        "credential_provider": LEGACY_PROVIDER,
        "credential_status": status,
        "credential_migration_required": True,
    }


async def issue_session(db, user_id: str) -> str:
    now = utcnow()
    token = secrets.token_urlsafe(32)
    await db.user_sessions.insert_one(
        {
            "session_token": token,
            "user_id": user_id,
            "expires_at": now + SESSION_TTL,
            "created_at": now,
            "auth_provider": DEEPCUT_PROVIDER,
        }
    )
    return token


async def migrate_all_user_metadata(db) -> dict[str, int]:
    """Classify every existing account without inventing or replacing passwords.

    Users that already have a password hash are marked active. Legacy users are marked
    activation-required and keep their existing sessions so they can choose a password.
    Email collisions are never merged automatically.
    """
    counts = {
        "total": 0,
        "active": 0,
        "activation_required": 0,
        "email_conflict": 0,
        "missing_email": 0,
    }
    now = utcnow()
    cursor = db.users.find(
        {},
        {
            "_id": 0,
            "user_id": 1,
            "email": 1,
            "email_normalized": 1,
            "password_hash": 1,
            "credential_status": 1,
        },
    )

    async for user in cursor:
        counts["total"] += 1
        user_id = str(user.get("user_id") or "")
        if not user_id:
            continue

        email = normalize_email(user.get("email_normalized") or user.get("email"))
        has_password = bool(user.get("password_hash"))
        provider = DEEPCUT_PROVIDER if has_password else LEGACY_PROVIDER
        updates: dict[str, Any] = {
            "credential_migration_scanned_at": now,
            "credential_provider": provider,
            "auth_provider": provider,
        }

        if not email:
            updates.update(
                {
                    "credential_status": MISSING_EMAIL,
                    "credential_migration_required": True,
                }
            )
            counts["missing_email"] += 1
        else:
            collision = await db.users.find_one(
                email_query(email, exclude_user_id=user_id),
                {"_id": 0, "user_id": 1},
            )
            if collision:
                updates.update(
                    {
                        "credential_status": EMAIL_CONFLICT,
                        "credential_migration_required": True,
                    }
                )
                counts["email_conflict"] += 1
            elif has_password:
                updates.update(
                    {
                        "email": email,
                        "email_normalized": email,
                        "credential_status": ACTIVE,
                        "credential_migration_required": False,
                    }
                )
                counts["active"] += 1
            else:
                updates.update(
                    {
                        "email": email,
                        "email_normalized": email,
                        "credential_status": ACTIVATION_REQUIRED,
                        "credential_migration_required": True,
                    }
                )
                counts["activation_required"] += 1

        try:
            await db.users.update_one({"user_id": user_id}, {"$set": updates})
        except DuplicateKeyError:
            await db.users.update_one(
                {"user_id": user_id},
                {
                    "$unset": {"email_normalized": ""},
                    "$set": {
                        "credential_provider": provider,
                        "credential_status": EMAIL_CONFLICT,
                        "credential_migration_required": True,
                        "auth_provider": provider,
                        "credential_migration_scanned_at": now,
                    },
                },
            )
            if has_password:
                counts["active"] = max(0, counts["active"] - 1)
            else:
                counts["activation_required"] = max(0, counts["activation_required"] - 1)
            counts["email_conflict"] += 1

    logger.info("DeepCut credential migration inventory: %s", counts)
    return counts


async def credential_summary(db) -> dict[str, int]:
    return {
        "total": await db.users.count_documents({}),
        "active": await db.users.count_documents({"credential_status": ACTIVE}),
        "activation_required": await db.users.count_documents({"credential_status": ACTIVATION_REQUIRED}),
        "email_conflict": await db.users.count_documents({"credential_status": EMAIL_CONFLICT}),
        "missing_email": await db.users.count_documents({"credential_status": MISSING_EMAIL}),
    }


def register_routes(
    router,
    *,
    db,
    get_current_user: Callable,
    user_out: Callable,
    require_admin: Callable,
) -> None:
    @router.get("/auth/credentials/status")
    async def get_credential_status(authorization: str | None = Header(None)):
        user = await get_current_user(authorization)
        return {
            "email": normalize_email(user.get("email")),
            **credential_fields(user),
        }

    @router.post("/auth/credentials/activate")
    async def activate_credentials(
        body: CredentialActivationRequest,
        authorization: str | None = Header(None),
    ):
        user = await get_current_user(authorization)
        email = normalize_email(user.get("email"))
        if not email:
            raise HTTPException(status_code=400, detail="Account does not have an email address")

        collision = await db.users.find_one(
            email_query(email, exclude_user_id=str(user["user_id"])),
            {"_id": 0, "user_id": 1},
        )
        if collision:
            raise HTTPException(
                status_code=409,
                detail="This email is attached to more than one account. Contact DeepCut support.",
            )

        now = utcnow()
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {
                "$set": {
                    "email": email,
                    "email_normalized": email,
                    "password_hash": hash_password(body.password),
                    "auth_provider": DEEPCUT_PROVIDER,
                    "credential_provider": DEEPCUT_PROVIDER,
                    "credential_status": ACTIVE,
                    "credential_migration_required": False,
                    "password_migrated_at": now,
                    "credential_activated_at": now,
                    "updated_at": now,
                }
            },
        )

        # Replace every legacy or stale session with one first-party session.
        await db.user_sessions.delete_many({"user_id": user["user_id"]})
        token = await issue_session(db, str(user["user_id"]))
        fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
        return {"session_token": token, "user": user_out(fresh)}

    @router.get("/admin/credentials/summary")
    async def get_admin_credential_summary(authorization: str | None = Header(None)):
        admin = await get_current_user(authorization)
        await require_admin(admin)
        return {
            **(await credential_summary(db)),
            "legacy_sign_in_enabled": False,
        }


async def ensure_indexes(db) -> None:
    await db.users.create_index([("credential_status", 1), ("created_at", -1)])
