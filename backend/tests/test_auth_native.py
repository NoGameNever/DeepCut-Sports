from pathlib import Path
import sys
from urllib.parse import parse_qs, urlsplit

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


def test_password_reset_token_hash_is_stable_and_one_way():
    token = "reset-token-value"
    digest = auth_native._sha256(token)
    assert digest == auth_native._sha256(token)
    assert digest != token
    assert len(digest) == 64


def test_password_reset_url_preserves_query_and_replaces_token():
    result = auth_native._build_password_reset_url(
        "new token/+",
        "https://play.deepcutsports.com/reset-password?campaign=alpha&token=old",
    )
    parsed = urlsplit(result)
    query = parse_qs(parsed.query)
    assert query["campaign"] == ["alpha"]
    assert query["token"] == ["new token/+"]


def test_password_reset_config_uses_app_base_url(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("EMAIL_FROM", "DeepCut Sports <accounts@example.com>")
    monkeypatch.delenv("PASSWORD_RESET_URL", raising=False)
    monkeypatch.setenv("APP_BASE_URL", "https://play.deepcutsports.com/")

    config = auth_native._password_reset_config()

    assert config is not None
    assert config["reset_url"] == "https://play.deepcutsports.com/reset-password"


def test_password_reset_config_requires_delivery_settings(monkeypatch):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.delenv("EMAIL_FROM", raising=False)
    monkeypatch.delenv("PASSWORD_RESET_URL", raising=False)
    monkeypatch.delenv("APP_BASE_URL", raising=False)
    assert auth_native._password_reset_config() is None


def test_password_reset_email_escapes_link_in_html():
    subject, text, email_html = auth_native._password_reset_email(
        'https://example.com/reset?token=abc"<script>'
    )
    assert subject == "Reset your DeepCut Sports password"
    assert "expires in 30 minutes" in text
    assert 'abc"<script>' not in email_html
    assert "abc&quot;&lt;script&gt;" in email_html
