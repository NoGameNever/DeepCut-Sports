"""Admin-controlled registration modes and invite-only signup."""
from __future__ import annotations
import hashlib, os, secrets
from datetime import datetime, timedelta, timezone
from typing import Callable, Literal
from fastapi import Header, HTTPException
from pydantic import BaseModel, EmailStr, Field
import auth_native, user_access

SETTINGS_COLLECTION="app_settings"; INVITES_COLLECTION="registration_invites"; SETTING_ID="registration_access"
DEFAULT_MODE=os.environ.get("REGISTRATION_MODE","invite").strip().lower()
if DEFAULT_MODE not in {"open","invite","closed"}: DEFAULT_MODE="invite"

def now(): return datetime.now(timezone.utc)
def token_hash(v:str): return hashlib.sha256(v.encode()).hexdigest()
class ModeBody(BaseModel): mode: Literal["open","invite","closed"]
class InviteBody(BaseModel):
    max_uses:int=Field(default=1,ge=1,le=500)
    expires_hours:int=Field(default=168,ge=1,le=2160)
class ControlledRegisterRequest(BaseModel):
    email:EmailStr; password:str=Field(min_length=8,max_length=128)
    username:str|None=Field(default=None,min_length=3,max_length=20)
    invite:str|None=Field(default=None,max_length=512)

async def get_mode(db):
    d=await db[SETTINGS_COLLECTION].find_one({"id":SETTING_ID},{"_id":0,"mode":1})
    m=str((d or {}).get("mode") or DEFAULT_MODE).lower()
    return m if m in {"open","invite","closed"} else DEFAULT_MODE

async def validate_invite(db, raw):
    mode=await get_mode(db)
    if mode=="open": return None
    if mode=="closed": raise HTTPException(403,"New account registration is currently closed")
    token=str(raw or "").strip()
    if not token: raise HTTPException(403,"A valid signup invite is required")
    stamp=now()
    invite=await db[INVITES_COLLECTION].find_one({"token_hash":token_hash(token),"enabled":True,"expires_at":{"$gt":stamp}})
    if not invite or int(invite.get("uses",0))>=int(invite.get("max_uses",1)):
        raise HTTPException(403,"Signup invite is invalid, expired, or fully used")
    return invite

async def mark_invite_used(db, invite):
    if invite:
        await db[INVITES_COLLECTION].update_one({"id":invite["id"]},{"$inc":{"uses":1},"$set":{"last_used_at":now()}})

def register_routes(router,*,db,get_current_user:Callable,ensure_username:Callable,user_out:Callable,require_admin:Callable):
    @router.get("/registration/status")
    async def public_status(): return {"mode":await get_mode(db)}

    @router.post("/auth/register")
    async def controlled_register(body:ControlledRegisterRequest):
        invite=await validate_invite(db,body.invite)
        email=auth_native._email(str(body.email)); username=auth_native._validate_requested_username(body.username)
        if await db.users.find_one(auth_native._email_query(email),{"_id":0,"user_id":1}):
            raise HTTPException(409,"An account already exists for this email")
        full=await user_access.resolve_initial_access(db,email); uid=f"user_{secrets.token_hex(6)}"; stamp=now()
        await db.users.insert_one({"user_id":uid,"email":email,"email_normalized":email,"password_hash":auth_native._hash_password(body.password),"auth_provider":"deepcut_password","name":None,"picture":None,"username":None,"tagline":None,"avatar":None,"total_score":0,"matches":0,"correct_answers":0,"total_answers":0,"best_sport":None,"sport_scores":{},"full_app_access":full,"full_app_access_source":"preapproved_email" if full else "default","full_app_access_granted_at":stamp if full else None,"registration_source":"invite" if invite else "open","registration_invite_id":invite.get("id") if invite else None,"created_at":stamp})
        uname=await ensure_username(uid,username or email.split("@",1)[0]); await db.users.update_one({"user_id":uid},{"$set":{"username":uname}})
        await mark_invite_used(db,invite)
        user=await db.users.find_one({"user_id":uid},{"_id":0}); session=await auth_native._issue_session(db,uid)
        return {"session_token":session,"user":user_out(user)}

    @router.get("/admin/registration")
    async def admin_status(authorization:str|None=Header(None)):
        admin=await get_current_user(authorization); await require_admin(admin); stamp=now()
        invites=await db[INVITES_COLLECTION].find({"enabled":True,"expires_at":{"$gt":stamp}},{"_id":0,"token_hash":0}).sort("created_at",-1).limit(100).to_list(100)
        return {"mode":await get_mode(db),"invites":invites}
    @router.put("/admin/registration/mode")
    async def set_mode(body:ModeBody,authorization:str|None=Header(None)):
        admin=await get_current_user(authorization); await require_admin(admin)
        await db[SETTINGS_COLLECTION].update_one({"id":SETTING_ID},{"$set":{"id":SETTING_ID,"mode":body.mode,"updated_at":now(),"updated_by":admin.get("user_id")}},upsert=True)
        return {"mode":body.mode}
    @router.post("/admin/registration/invites")
    async def create_invite(body:InviteBody,authorization:str|None=Header(None)):
        admin=await get_current_user(authorization); await require_admin(admin); raw=secrets.token_urlsafe(32); stamp=now(); iid=f"invite_{secrets.token_hex(8)}"; exp=stamp+timedelta(hours=body.expires_hours)
        await db[INVITES_COLLECTION].insert_one({"id":iid,"token_hash":token_hash(raw),"enabled":True,"max_uses":body.max_uses,"uses":0,"created_at":stamp,"expires_at":exp,"created_by":admin.get("user_id")})
        return {"id":iid,"token":raw,"max_uses":body.max_uses,"uses":0,"expires_at":exp}
    @router.delete("/admin/registration/invites/{invite_id}")
    async def revoke(invite_id:str,authorization:str|None=Header(None)):
        admin=await get_current_user(authorization); await require_admin(admin)
        await db[INVITES_COLLECTION].update_one({"id":invite_id},{"$set":{"enabled":False,"revoked_at":now(),"revoked_by":admin.get("user_id")}}); return {"ok":True}

async def ensure_indexes(db):
    await db[INVITES_COLLECTION].create_index("id",unique=True); await db[INVITES_COLLECTION].create_index("token_hash",unique=True); await db[INVITES_COLLECTION].create_index("expires_at",expireAfterSeconds=0)
