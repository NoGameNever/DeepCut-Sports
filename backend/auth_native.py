"""First-party DeepCut authentication.

This module deliberately reuses the existing `user_sessions` collection and bearer-token
contract so the rest of the API does not need to know whether a user authenticated through
the legacy provider or directly with DeepCut credentials.
"""

from datetime import datetime, timedelta, timezone
import hashlib
import html
import logging
import os
import re
import secrets
from typing import Callable
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import bcrypt
import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, EmailStr, Field
from pymongo.errors import DuplicateKeyError

import user_access

SESSION_TTL = timedelta(days=30)
PASSWORD_RESET_TTL = timedelta(minutes=30)
PASSWORD_RESET_COOLDOWN = timedelta(seconds=60)
PASSWORD_RESET_REQUEST_RETENTION = timedelta(hours=1)
PASSWORD_RESET_RESPONSE = {
    "ok": True,
    "message": "If an account exists for that email, a reset link is on the way.",
}
USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]{3,20}$")
BETA_ACCESS_CODE = os.environ.get("BETA_ACCESS_CODE", "").strip()
BETA_COHORT = os.environ.get("BETA_COHORT", "closed_alpha_1").strip() or "closed_alpha_1"
BANNED_WORDS = {
    "admin", "root", "fuck", "shit", "bitch", "nigger", "nigga", "cunt",
    "faggot", "rape", "nazi", "slut", "whore", "dick", "pussy",
}
logger = logging.getLogger(__name__)


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    username: str | None = Field(default=None, min_length=3, max_length=20)
    access_code: str | None = Field(default=None, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class SetPasswordRequest(BaseModel):
    password: str = Field(min_length=8, max_length=128)


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirmRequest(BaseModel):
    token: str = Field(min_length=20, max_length=512)
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


def _require_beta_access(submitted: str | None, configured: str | None = None) -> None:
    """Require the configured shared beta code without ever persisting it.

    Registration remains open in local/dev environments where BETA_ACCESS_CODE is unset.
    Comparison is case-insensitive to avoid support churn from mobile keyboards.
    """
    expected = BETA_ACCESS_CODE if configured is None else str(configured or "").strip()
    if not expected:
        return
    candidate = str(submitted or "").strip()
    if not candidate or not secrets.compare_digest(candidate.casefold(), expected.casefold()):
        raise HTTPException(status_code=403, detail="Invalid beta access code")


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _password_reset_config() -> dict[str, str] | None:
    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    sender = os.environ.get("EMAIL_FROM", "").strip()
    reset_url = os.environ.get("PASSWORD_RESET_URL", "").strip()
    if not reset_url:
        app_base_url = os.environ.get("APP_BASE_URL", "").strip().rstrip("/")
        if app_base_url:
            reset_url = f"{app_base_url}/reset-password"
    if not api_key or not sender or not reset_url:
        return None
    return {"api_key": api_key, "sender": sender, "reset_url": reset_url}


def _build_password_reset_url(token: str, base_url: str) -> str:
    parts = urlsplit(base_url)
    query = [(key, value) for key, value in parse_qsl(parts.query, keep_blank_values=True) if key != "token"]
    query.append(("token", token))
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def _password_reset_email(reset_url: str) -> tuple[str, str, str]:
    safe_url = html.escape(reset_url, quote=True)
    subject = "Reset your DeepCut Sports password"
    text = (
        "We received a request to reset your DeepCut Sports password.\n\n"
        f"Reset it here: {reset_url}\n\n"
        "This link expires in 30 minutes and can only be used once. "
        "If you did not request this, you can ignore this email."
    )
    email_html = f"""<!doctype html>
<html lang="en">
  <body style="margin:0;background:#0b0d0f;color:#f8f7f2;font-family:Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b0d0f;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#171a1f;border:3px solid #000;border-radius:18px;box-shadow:6px 6px 0 #000;">
            <tr>
              <td style="padding:32px;">
                <div style="font-size:13px;letter-spacing:1.6px;color:#f7c948;font-weight:700;">DEEPCUT SPORTS</div>
                <h1 style="margin:12px 0 10px;font-size:30px;line-height:1.1;color:#f8f7f2;">Reset your password</h1>
                <p style="margin:0 0 24px;color:#c8ccd2;line-height:1.6;">Use the button below to choose a new password. The link expires in 30 minutes and works once.</p>
                <a href="{safe_url}" style="display:inline-block;background:#f7c948;color:#050505;text-decoration:none;font-weight:800;font-size:16px;padding:15px 22px;border:3px solid #000;border-radius:12px;box-shadow:4px 4px 0 #000;">RESET PASSWORD</a>
                <p style="margin:28px 0 0;color:#8f96a3;font-size:13px;line-height:1.5;">Did not ask for this? Ignore the email. Your current password stays unchanged.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""
    return subject, text, email_html


async def _send_password_reset_email(*, recipient: str, token: str, token_hash: str) -> str:
    config = _password_reset_config()
    if not config:
        raise RuntimeError("Password reset email is not configured")

    reset_url = _build_password_reset_url(token, config["reset_url"])
    subject, text, email_html = _password_reset_email(reset_url)
    async with httpx.AsyncClient(timeout=httpx.Timeout(12.0)) as client:
        response = await client.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {config['api_key']}",
                "Content-Type": "application/json",
                "Idempotency-Key": f"password-reset-{token_hash}",
            },
            json={
                "from": config["sender"],
                "to": [recipient],
                "subject": subject,
                "text": text,
                "html": email_html,
                "tags": [{"name": "email_type", "value": "password_reset"}],
            },
        )
        response.raise_for_status()
        payload = response.json()
        return str(payload.get("id") or "")


async def _record_password_reset_request(db, email: str, now: datetime) -> bool:
    """Atomically reserve one reset request per normalized email per cooldown window."""
    email_hash = _sha256(f"password-reset:{email}")
    try:
        result = await db.password_reset_requests.update_one(
            {
                "email_hash": email_hash,
                "$or": [
                    {"requested_at": {"$lte": now - PASSWORD_RESET_COOLDOWN}},
                    {"requested_at": {"$exists": False}},
                ],
            },
            {
                "$set": {
                    "email_hash": email_hash,
                    "requested_at": now,
                    "expires_at": now + PASSWORD_RESET_REQUEST_RETENTION,
                }
            },
            upsert=True,
        )
    except DuplicateKeyError:
        # A recent document exists but did not match the cooldown query, or a
        # concurrent request won the unique email_hash reservation.
        return False
    return result.matched_count == 1 or result.upserted_id is not None


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
        _require_beta_access(body.access_code)
        email = _email(str(body.email))
        requested_username = _validate_requested_username(body.username)
        existing = await db.users.find_one(_email_query(email), {"_id": 0})
        if existing:
            raise HTTPException(status_code=409, detail="An account already exists for this email")

        full_app_access = await user_access.resolve_initial_access(db, email)
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
                "full_app_access": full_app_access,
                "full_app_access_source": "preapproved_email" if full_app_access else "default",
                "full_app_access_granted_at": now if full_app_access else None,
                "beta_cohort": BETA_COHORT if BETA_ACCESS_CODE else None,
                "beta_access_granted_at": now if BETA_ACCESS_CODE else None,
                "registration_source": "closed_beta" if BETA_ACCESS_CODE else "open",
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

        user = await user_access.sync_user_from_grant(db, user)
        token = await _issue_session(db, user["user_id"])
        return {"session_token": token, "user": user_out(user)}

    @router.post("/auth/password-reset/request")
    async def request_password_reset(body: PasswordResetRequest):
        # Fail the same way for every address when delivery is not configured.
        if not _password_reset_config():
            raise HTTPException(status_code=503, detail="Password reset email is not configured")

        email = _email(str(body.email))
        now = datetime.now(timezone.utc)
        if not await _record_password_reset_request(db, email, now):
            return dict(PASSWORD_RESET_RESPONSE)

        user = await db.users.find_one(_email_query(email), {"_id": 0, "user_id": 1})
        if not user:
            return dict(PASSWORD_RESET_RESPONSE)

        user_id = str(user["user_id"])
        token = secrets.token_urlsafe(48)
        token_hash = _sha256(token)
        await db.password_reset_tokens.delete_many({"user_id": user_id})
        await db.password_reset_tokens.insert_one(
            {
                "token_hash": token_hash,
                "user_id": user_id,
                "created_at": now,
                "expires_at": now + PASSWORD_RESET_TTL,
            }
        )

        try:
            delivery_id = await _send_password_reset_email(
                recipient=email,
                token=token,
                token_hash=token_hash,
            )
            if delivery_id:
                await db.password_reset_tokens.update_one(
                    {"token_hash": token_hash},
                    {"$set": {"delivery_id": delivery_id, "delivered_at": datetime.now(timezone.utc)}},
                )
        except Exception:
            # Never leak provider failures or account existence to the public endpoint.
            await db.password_reset_tokens.delete_one({"token_hash": token_hash})
            logger.exception("Password reset email delivery failed for user_id=%s", user_id)

        return dict(PASSWORD_RESET_RESPONSE)

    @router.post("/auth/password-reset/confirm")
    async def confirm_password_reset(body: PasswordResetConfirmRequest):
        token = body.token.strip()
        if len(token) < 20:
            raise HTTPException(status_code=400, detail="Reset link is invalid or expired")

        now = datetime.now(timezone.utc)
        token_record = await db.password_reset_tokens.find_one_and_delete(
            {
                "token_hash": _sha256(token),
                "expires_at": {"$gt": now},
            }
        )
        if not token_record:
            raise HTTPException(status_code=400, detail="Reset link is invalid or expired")

        user_id = str(token_record.get("user_id") or "")
        result = await db.users.update_one(
            {"user_id": user_id},
            {
                "$set": {
                    "password_hash": _hash_password(body.password),
                    "auth_provider": "deepcut_password",
                    "password_migrated_at": now,
                    "password_reset_at": now,
                }
            },
        )
        if result.matched_count != 1:
            raise HTTPException(status_code=400, detail="Reset link is invalid or expired")

        # A password reset is a security boundary. Revoke every existing session.
        await db.user_sessions.delete_many({"user_id": user_id})
        await db.password_reset_tokens.delete_many({"user_id": user_id})
        return {"ok": True}

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
    await db.password_reset_tokens.create_index("token_hash", unique=True)
    await db.password_reset_tokens.create_index("user_id")
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.password_reset_requests.create_index("email_hash", unique=True)
    await db.password_reset_requests.create_index("expires_at", expireAfterSeconds=0)
