import asyncio
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import user_access


class FakeGrantCollection:
    def __init__(self, grant=None):
        self.grant = grant

    async def find_one(self, query, projection=None):
        if self.grant and self.grant.get("email") == query.get("email"):
            return dict(self.grant)
        return None


class FakeDb:
    def __init__(self, grant=None):
        self.grants = FakeGrantCollection(grant)

    def __getitem__(self, name):
        assert name == user_access.ACCESS_COLLECTION
        return self.grants


def test_parse_email_set_normalizes_and_deduplicates():
    assert user_access.parse_email_set(" A@Example.com; b@example.com\na@example.com ") == {
        "a@example.com",
        "b@example.com",
    }


def test_public_access_fields_default_to_restricted_beta():
    assert user_access.public_access_fields({"beta_cohort": "closed_alpha_1"}) == {
        "full_app_access": False,
        "beta_cohort": "closed_alpha_1",
    }


def test_missing_access_query_keeps_email_and_missing_field_checks():
    query = user_access.missing_access_user_query("Fan+One@Example.com")
    assert "$and" in query
    assert query["$and"][0]["$or"][0]["email_normalized"] == "fan+one@example.com"
    assert query["$and"][1]["$or"][0]["full_app_access"] == {"$exists": False}


def test_stored_revocation_overrides_bootstrap_env(monkeypatch):
    monkeypatch.setenv(user_access.BOOTSTRAP_ENV, "fan@example.com")
    db = FakeDb({"email": "fan@example.com", "enabled": False})
    assert asyncio.run(user_access.resolve_initial_access(db, "FAN@example.com")) is False


def test_bootstrap_email_grants_new_account_when_no_stored_decision(monkeypatch):
    monkeypatch.setenv(user_access.BOOTSTRAP_ENV, "fan@example.com")
    db = FakeDb()
    assert asyncio.run(user_access.resolve_initial_access(db, "FAN@example.com")) is True


def test_full_app_body_is_user_access_only():
    body = user_access.FullAppAccessBody(email="fan@example.com", full_app_access=True)
    assert body.full_app_access is True
    assert not hasattr(body, "is_admin")
