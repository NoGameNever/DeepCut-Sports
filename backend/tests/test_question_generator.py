import asyncio
import sys
from pathlib import Path

import httpx
import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import question_generator as qg


def sample_body(**overrides):
    values = {
        "sport": "basketball",
        "difficulty": "hard",
        "count": 2,
        "subcategory": "nba history",
        "tags": ["history"],
    }
    values.update(overrides)
    return qg.GenerateQuestionsBody(**values)


def sample_rows():
    return [
        {
            "sport": "basketball",
            "subcategory": "nba history",
            "difficulty": "hard",
            "question": "Who was the first player to win the NBA Finals MVP award?",
            "correct_answer": "Jerry West",
            "incorrect_answers": ["Bill Russell", "Wilt Chamberlain", "Elgin Baylor"],
            "explanation": "West won the inaugural award in 1969.",
            "tags": ["finals"],
            "source": "NBA history records",
        },
        {
            "sport": "basketball",
            "subcategory": "nba history",
            "difficulty": "hard",
            "question": "Which franchise selected Kobe Bryant in the 1996 NBA Draft?",
            "correct_answer": "Charlotte Hornets",
            "incorrect_answers": ["Los Angeles Lakers", "Philadelphia 76ers", "Boston Celtics"],
            "explanation": "Charlotte selected Bryant before trading him to Los Angeles.",
            "tags": ["draft"],
            "source": "1996 NBA Draft records",
        },
    ]


def test_prompt_contains_editorial_constraints():
    prompt = qg.build_generation_prompt(sample_body(era="1990s", notes="Avoid championship questions"))

    assert "exactly 2" in prompt
    assert "three distinct incorrect_answers" in prompt
    assert "1990s" in prompt
    assert "Avoid championship questions" in prompt
    assert "JSON only" in prompt


def test_extract_question_rows_accepts_fenced_json():
    raw = "```json\n{\"questions\": [{\"question\": \"Example question?\"}]}\n```"

    assert qg.extract_question_rows(raw) == [{"question": "Example question?"}]


def test_extract_question_rows_rejects_non_json():
    with pytest.raises(ValueError):
        qg.extract_question_rows("Here are your questions: none today")


def test_normalize_generated_rows_forces_requested_scope_and_deduplicates():
    rows = sample_rows()
    duplicate = dict(rows[0])
    duplicate["question"] = "Who was the first player to win the NBA Finals MVP award?!"
    rows.append(duplicate)

    normalized = qg.normalize_generated_rows(rows, sample_body(source="editorial-review"))

    assert len(normalized) == 2
    assert all(item["sport"] == "basketball" for item in normalized)
    assert all(item["difficulty"] == "hard" for item in normalized)
    assert all(item["status"] == "draft" for item in normalized)
    assert all(item["source"] == "editorial-review" for item in normalized)
    assert set(normalized[0]["tags"]) == {"finals", "history"}


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self.payload = payload
        self.status_code = status_code
        self.request = httpx.Request("POST", "https://generator.test")

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                "provider error",
                request=self.request,
                response=httpx.Response(self.status_code, request=self.request),
            )

    def json(self):
        return self.payload


class FakeClient:
    response = None
    last_request = None

    def __init__(self, **kwargs):
        self.kwargs = kwargs

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url, headers=None, json=None):
        type(self).last_request = {"url": url, "headers": headers, "json": json}
        return type(self).response


def test_call_generator_returns_normalized_drafts():
    FakeClient.response = FakeResponse(
        {"choices": [{"message": {"content": '{"questions": ' + __import__("json").dumps(sample_rows()) + "}"}}]}
    )
    config = qg.QuestionGeneratorConfig(api_key="secret", url="https://generator.test", model="test-model")

    result = asyncio.run(qg.call_generator(sample_body(), config, client_factory=FakeClient))

    assert len(result) == 2
    assert all(item["status"] == "draft" for item in result)
    assert FakeClient.last_request["json"]["model"] == "test-model"
    assert FakeClient.last_request["headers"]["Authorization"] == "Bearer secret"


def test_call_generator_maps_provider_errors_to_bad_gateway():
    FakeClient.response = FakeResponse({}, status_code=429)
    config = qg.QuestionGeneratorConfig(api_key="secret", url="https://generator.test")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(qg.call_generator(sample_body(), config, client_factory=FakeClient))

    assert exc.value.status_code == 502


def test_config_requires_api_key(monkeypatch):
    monkeypatch.delenv("QUESTION_GENERATOR_API_KEY", raising=False)

    with pytest.raises(HTTPException) as exc:
        qg.QuestionGeneratorConfig.from_env()

    assert exc.value.status_code == 503
