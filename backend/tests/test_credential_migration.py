from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import credential_migration


def test_native_account_is_active():
    fields = credential_migration.credential_fields({"password_hash": "$2b$12$abc"})
    assert fields == {
        "credential_provider": "deepcut_password",
        "credential_status": "active",
        "credential_migration_required": False,
    }


def test_legacy_account_requires_activation():
    fields = credential_migration.credential_fields({})
    assert fields == {
        "credential_provider": "legacy_migration_pending",
        "credential_status": "activation_required",
        "credential_migration_required": True,
    }


def test_conflict_status_is_preserved_until_admin_resolves_it():
    fields = credential_migration.credential_fields({"credential_status": "email_conflict"})
    assert fields["credential_status"] == "email_conflict"
    assert fields["credential_migration_required"] is True


def test_email_query_normalizes_and_excludes_current_user():
    query = credential_migration.email_query("  FAN+One@Example.COM ", exclude_user_id="user_1")
    assert query["$or"][0]["email_normalized"] == "fan+one@example.com"
    assert query["$or"][1]["email"]["$regex"] == r"^fan\+one@example\.com$"
    assert query["user_id"] == {"$ne": "user_1"}


def test_password_hash_roundtrip():
    password = "a-new-deepcut-password"
    hashed = credential_migration.hash_password(password)
    assert hashed != password
    assert credential_migration.bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
