import os
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

# Load backend .env for MONGO_URL / DB_NAME
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else None
if not BASE_URL:
    # Fallback to frontend .env
    fe_env = Path("/app/frontend/.env")
    if fe_env.exists():
        for line in fe_env.read_text().splitlines():
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                break

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


@pytest.fixture(scope="session")
def base_url():
    assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not set"
    return BASE_URL


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def mongo_db():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="session")
def test_user(mongo_db):
    """Insert a TEST_ user + valid session into MongoDB and return (user_id, token, email)."""
    user_id = f"user_TEST_{uuid.uuid4().hex[:10]}"
    email = f"TEST_{uuid.uuid4().hex[:8]}@example.com"
    session_token = f"TEST_sess_{uuid.uuid4().hex}"
    now = datetime.now(timezone.utc)
    mongo_db.users.insert_one({
        "user_id": user_id,
        "email": email,
        "name": "Test User",
        "picture": None,
        "total_score": 0,
        "matches": 0,
        "correct_answers": 0,
        "total_answers": 0,
        "best_sport": None,
        "sport_scores": {},
        "created_at": now,
    })
    mongo_db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user_id,
        "expires_at": now + timedelta(days=7),
        "created_at": now,
    })
    yield {"user_id": user_id, "email": email, "token": session_token}
    # cleanup
    mongo_db.users.delete_one({"user_id": user_id})
    mongo_db.user_sessions.delete_one({"session_token": session_token})


@pytest.fixture
def auth_headers(test_user):
    return {"Authorization": f"Bearer {test_user['token']}", "Content-Type": "application/json"}
