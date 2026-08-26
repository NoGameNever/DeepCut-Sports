"""Admin-managed access to the full DeepCut application.

Full-app access is deliberately separate from admin access. Admins can grant or revoke
normal user access without modifying ADMIN_EMAILS / ADMIN_USER_IDS or exposing any
question-bank controls to the target account.
"""

from __future__ import annotations

import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from fastapi import Header, HTTPException
from pydantic import BaseModel, EmailStr


BOOTSTRAP_ENV = "FULL_APP_BOOTSTRAP_EMAILS"
ACCESS_COLLECTION = "full_app_access_grants"


class FullAppAccessBody(BaseModel):
    email: EmailStr
    full_app_access: bool


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def normalize_email(value: str) -> str:
    return str(value or "").strip().lower()


def parse_email_set(value: str | None) -> set[str]:
    return {
        normalize_email(item)
        for item in re.split(r"[,;\n]", str(value or ""))
        if normalize_email(item)
    }


def bootstrap_emails() -> set[str]:
    return parse_email_set(os.environ.get(BOOTSTRAP_ENV, ""))


def email_query(email: str) -> dict[str, Any]:
    normalized = normalize_email(email)
    return {
        "$or": [
            {"email_normalized": normalized},
            {"email": {"$regex": f"^{re.escape(normalized)}$", "$options": "i"}},
        ]
    }


def missing_access_user_query(email: str) -> dict[str, Any]:
    return {
        "$and": [
            email_query(email),
            {
                "$or": [
                    {"full_app_access": {"$exists": False}},
                    {"full_app_access": None},
                ]
            },
        ]
    }


def is_admin_user(user: dict[str, Any]) -> bool:
    admin_emails = parse_email_set(os.environ.get("ADMIN_EMAILS", ""))
    admin_ids = parse_email_set(os.environ.get("ADMIN_USER_IDS", ""))
    return (
        normalize_email(user.get("email", "")) in admin_emails
        or str(user.get("user_id") or "").strip().lower() in admin_ids
    )


def public_access_fields(user: dict[str, Any]) -> dict[str, Any]:
    return {
        "full_app_access": bool(user.get("full_app_access", False)),
        "beta_cohort": user.get("beta_cohort"),
    }


async def resolve_initial_access(db, email: str) -> bool:
    """Return the access state to store when an account is first created."""
    normalized = normalize_email(email)
    grant = await db[ACCESS_COLLECTION].find_one({"email": normalized}, {"_id": 0, "enabled": 1})
    if grant is not None:
        return bool(grant.get("enabled"))
    return normalized in bootstrap_emails()


async def sync_user_from_grant(db, user: dict[str, Any]) -> dict[str, Any]:
    """Apply a pending email grant to a user that predates the access field.

    An explicit stored user value always wins. This lets an admin revoke a bootstrap
    grant without the next restart silently restoring it.
    """
    if "full_app_access" in user and user.get("full_app_access") is not None:
        return user

    email = normalize_email(user.get("email", ""))
    enabled = await resolve_initial_access(db, email) if email else False
    now = utcnow()
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {
            "$set": {
                "full_app_access": enabled,
                "full_app_access_source": "pending_grant" if enabled else "default",
                "updated_at": now,
            }
        },
    )
    return {**user, "full_app_access": enabled}


async def ensure_bootstrap_access(db) -> None:
    """Seed one-time grants from Render without making the env var authoritative forever."""
    now = utcnow()
    for email in bootstrap_emails():
        await db[ACCESS_COLLECTION].update_one(
            {"email": email},
            {
                "$setOnInsert": {
                    "id": f"fullapp_{uuid.uuid4().hex[:16]}",
                    "email": email,
                    "enabled": True,
                    "source": "bootstrap_env",
                    "created_at": now,
                    "updated_at": now,
                }
            },
            upsert=True,
        )
        grant = await db[ACCESS_COLLECTION].find_one({"email": email}, {"_id": 0, "enabled": 1})
        if grant and grant.get("enabled"):
            await db.users.update_many(
                missing_access_user_query(email),
                {
                    "$set": {
                        "full_app_access": True,
                        "full_app_access_source": "bootstrap_env",
                        "full_app_access_granted_at": now,
                        "updated_at": now,
                    }
                },
            )


async def ensure_indexes(db) -> None:
    await db[ACCESS_COLLECTION].create_index("email", unique=True)
    await db[ACCESS_COLLECTION].create_index([("enabled", 1), ("updated_at", -1)])
    await db.users.create_index([("full_app_access", 1), ("created_at", -1)])


def _serialize_user(user: dict[str, Any]) -> dict[str, Any]:
    return {
        "user_id": user.get("user_id"),
        "email": user.get("email"),
        "username": user.get("username"),
        "name": user.get("username") or user.get("name") or "Player",
        "picture": user.get("avatar") or user.get("picture"),
        "full_app_access": bool(user.get("full_app_access", False)),
        "is_admin": is_admin_user(user),
        "beta_cohort": user.get("beta_cohort"),
        "registration_source": user.get("registration_source"),
        "matches": int(user.get("matches", 0) or 0),
        "total_score": int(user.get("total_score", 0) or 0),
        "created_at": user.get("created_at"),
        "last_seen": user.get("last_seen"),
        "full_app_access_granted_at": user.get("full_app_access_granted_at"),
        "full_app_access_revoked_at": user.get("full_app_access_revoked_at"),
    }


def register_routes(
    api_router,
    *,
    db,
    get_current_user: Callable,
    require_admin: Callable,
) -> None:
    @api_router.get("/admin/user-access")
    async def list_user_access(
        q: Optional[str] = None,
        access: str = "all",
        limit: int = 100,
        skip: int = 0,
        authorization: Optional[str] = Header(None),
    ):
        admin = await get_current_user(authorization)
        await require_admin(admin)

        if access not in {"all", "full", "beta"}:
            raise HTTPException(status_code=400, detail="access must be all, full, or beta")

        match: dict[str, Any] = {}
        if q and q.strip():
            safe = re.escape(q.strip())
            match["$or"] = [
                {"email": {"$regex": safe, "$options": "i"}},
                {"email_normalized": {"$regex": safe, "$options": "i"}},
                {"username": {"$regex": safe, "$options": "i"}},
                {"name": {"$regex": safe, "$options": "i"}},
            ]
        if access == "full":
            match["full_app_access"] = True
        elif access == "beta":
            match["$and"] = [
                {
                    "$or": [
                        {"full_app_access": False},
                        {"full_app_access": None},
                        {"full_app_access": {"$exists": False}},
                    ]
                }
            ]

        capped = max(1, min(int(limit), 250))
        offset = max(0, int(skip))
        users = await db.users.find(match, {"_id": 0, "password_hash": 0}).sort("created_at", -1).skip(offset).limit(capped).to_list(capped)
        total = await db.users.count_documents(match)
        total_users = await db.users.count_documents({})
        full_users = await db.users.count_documents({"full_app_access": True})

        pending: list[dict[str, Any]] = []
        grant_query: dict[str, Any] = {"enabled": True}
        if q and q.strip():
            grant_query["email"] = {"$regex": re.escape(q.strip()), "$options": "i"}
        grants = await db[ACCESS_COLLECTION].find(grant_query, {"_id": 0}).sort("updated_at", -1).limit(100).to_list(100)
        for grant in grants:
            if not await db.users.find_one(email_query(grant["email"]), {"_id": 0, "user_id": 1}):
                pending.append({
                    "email": grant["email"],
                    "full_app_access": True,
                    "created_at": grant.get("created_at"),
                    "updated_at": grant.get("updated_at"),
                })

        return {
            "items": [_serialize_user(user) for user in users],
            "pending_grants": pending,
            "total": total,
            "limit": capped,
            "skip": offset,
            "counts": {
                "users": total_users,
                "full_app": full_users,
                "beta_only": max(total_users - full_users, 0),
                "pending": len(pending),
            },
        }

    @api_router.post("/admin/user-access")
    async def set_user_access(
        body: FullAppAccessBody,
        authorization: Optional[str] = Header(None),
    ):
        admin = await get_current_user(authorization)
        await require_admin(admin)

        email = normalize_email(str(body.email))
        now = utcnow()
        grant_id = f"fullapp_{uuid.uuid4().hex[:16]}"
        await db[ACCESS_COLLECTION].update_one(
            {"email": email},
            {
                "$setOnInsert": {
                    "id": grant_id,
                    "email": email,
                    "created_at": now,
                },
                "$set": {
                    "enabled": body.full_app_access,
                    "source": "admin_portal",
                    "updated_at": now,
                    "updated_by": admin.get("user_id"),
                },
            },
            upsert=True,
        )

        target = await db.users.find_one(email_query(email), {"_id": 0})
        if target:
            updates: dict[str, Any] = {
                "full_app_access": body.full_app_access,
                "full_app_access_source": "admin_portal",
                "updated_at": now,
            }
            if body.full_app_access:
                updates.update({
                    "full_app_access_granted_at": now,
                    "full_app_access_granted_by": admin.get("user_id"),
                    "full_app_access_revoked_at": None,
                    "full_app_access_revoked_by": None,
                })
            else:
                updates.update({
                    "full_app_access_revoked_at": now,
                    "full_app_access_revoked_by": admin.get("user_id"),
                })
            await db.users.update_one({"user_id": target["user_id"]}, {"$set": updates})
            target = await db.users.find_one({"user_id": target["user_id"]}, {"_id": 0, "password_hash": 0})

        return {
            "email": email,
            "full_app_access": body.full_app_access,
            "user_found": bool(target),
            "user": _serialize_user(target) if target else None,
            "admin_access_changed": False,
        }
