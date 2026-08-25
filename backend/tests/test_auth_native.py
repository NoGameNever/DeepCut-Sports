from pathlib import Path
import sys

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import auth_native


def test_password_hash_roundtrip():
    password = "deepcut-test-password"
    hashed = auth_native._hash_password(password)
    assert hashed != password
    assert auth_native._verify_password(password, hashed)
    assert not auth_native._verify_password("wrong-password", hashed)


def test_email_normalization():
    assert auth_native._email("  FAN@Example.COM ") == "fan@example.com"


def test_requested_username_accepts_valid_value():
    assert auth_native._validate_requested_username("BackupFan_12") == "BackupFan_12"


@pytest.mark.parametrize("value", ["ab", "bad-name", "contains space", "adminGuy"])
def test_requested_username_rejects_invalid_or_reserved_value(value):
    with pytest.raises(HTTPException):
        auth_native._validate_requested_username(value)


def test_email_query_escapes_regex_characters():
    query = auth_native._email_query("fan+test@example.com")
    regex = query["$or"][1]["email"]["$regex"]
    assert regex == r"^fan\+test@example\.com$"


def test_beta_access_is_open_when_no_code_is_configured():
    auth_native._require_beta_access(None, configured="")


def test_beta_access_accepts_trimmed_case_insensitive_code():
    auth_native._require_beta_access("  deepcut-alpha  ", configured="DEEPCUT-ALPHA")


def test_beta_access_rejects_missing_or_wrong_code():
    with pytest.raises(HTTPException) as missing:
        auth_native._require_beta_access(None, configured="DEEPCUT-ALPHA")
    assert missing.value.status_code == 403

    with pytest.raises(HTTPException) as wrong:
        auth_native._require_beta_access("WRONG", configured="DEEPCUT-ALPHA")
    assert wrong.value.status_code == 403
