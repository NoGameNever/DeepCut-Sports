from pathlib import Path
import asyncio
import sys

from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import registration_access


class FakeSettings:
    def __init__(self, mode=None):
        self.mode = mode

    async def find_one(self, query, projection=None):
        if self.mode is None:
            return None
        return {"mode": self.mode}


class FakeDb:
    def __init__(self, mode=None):
        self.settings = FakeSettings(mode)

    def __getitem__(self, name):
        if name == registration_access.SETTINGS_COLLECTION:
            return self.settings
        raise AssertionError(name)


def test_default_registration_mode_is_invite(monkeypatch):
    monkeypatch.delenv("REGISTRATION_MODE", raising=False)
    assert registration_access.DEFAULT_MODE in {"open", "invite", "closed"}


def test_stored_mode_wins():
    assert asyncio.run(registration_access.get_mode(FakeDb("closed"))) == "closed"
    assert asyncio.run(registration_access.get_mode(FakeDb("open"))) == "open"


def test_signup_url_targets_login_and_keeps_token(monkeypatch):
    monkeypatch.setenv("APP_BASE_URL", "https://deepcut.example/")
    url = registration_access.signup_url("abc_123")
    assert url == "https://deepcut.example/login?invite=abc_123"


def test_closed_mode_rejects_registration():
    try:
        asyncio.run(registration_access.reserve_invite(FakeDb("closed"), None))
        assert False, "expected HTTPException"
    except HTTPException as exc:
        assert exc.status_code == 403
        assert "closed" in exc.detail.lower()


def test_invite_mode_requires_token():
    try:
        asyncio.run(registration_access.reserve_invite(FakeDb("invite"), None))
        assert False, "expected HTTPException"
    except HTTPException as exc:
        assert exc.status_code == 403
        assert "invite" in exc.detail.lower()
