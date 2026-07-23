import json
import os
import re
from typing import Any, Awaitable, Callable, Optional

import httpx
from fastapi import Header, HTTPException
from pydantic import BaseModel, Field, field_validator


DEFAULT_GENERATOR_URL = "https://api.openai.com/v1/chat/completions"
DEFAULT_GENERATOR_MODEL = "gpt-4.1-mini"
MAX_GENERATION_COUNT = 50


class GenerateQuestionsBody(BaseModel):
    sport: str = Field(..., min_length=1)
    difficulty: str = "medium"
    count: int = Field(default=10, ge=1, le=MAX_GENERATION_COUNT)
    subcategory: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    source: Optional[str] = None
    era: Optional[str] = None
    notes: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("sport", "difficulty", mode="before")
    @classmethod
    def normalize_required_text(cls, value: Any) -> str:
        return str(value or "").strip().lower()

    @field_validator("subcategory", "source", "era", "notes", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: Any) -> Optional[str]:
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    @field_validator("tags", mode="before")
    @classmethod
    def normalize_tags(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            return [part.strip().lower() for part in re.split(r"[,;|]", value) if part.strip()]
        return [str(part).strip().lower() for part in value if str(part).strip()]


class QuestionGeneratorConfig(BaseModel):
    api_key: str
    url: str = DEFAULT_GENERATOR_URL
    model: str = DEFAULT_GENERATOR_MODEL
    timeout_seconds: float = 45.0

    @classmethod
    def from_env(cls) -> "QuestionGeneratorConfig":
        api_key = os.environ.get("QUESTION_GENERATOR_API_KEY", "").strip()
        if not api_key:
            raise HTTPException(
                status_code=503,
                detail="Question generation is not configured. Set QUESTION_GENERATOR_API_KEY.",
            )
        return cls(
            api_key=api_key,
            url=os.environ.get("QUESTION_GENERATOR_URL", DEFAULT_GENERATOR_URL).strip(),
            model=os.environ.get("QUESTION_GENERATOR_MODEL", DEFAULT_GENERATOR_MODEL).strip(),
            timeout_seconds=float(os.environ.get("QUESTION_GENERATOR_TIMEOUT_SECONDS", "45")),
        )


def build_generation_prompt(body: GenerateQuestionsBody) -> str:
    constraints = [
        f"Create exactly {body.count} original sports trivia questions about {body.sport}.",
        f"Difficulty must be {body.difficulty}.",
        "Each item must contain exactly four plausible answer choices: one correct_answer and three distinct incorrect_answers.",
        "Questions must be factual, unambiguous, concise, and suitable for a competitive mobile trivia game.",
        "Do not include trick wording, opinion questions, future predictions, or facts that are likely to change quickly.",
        "Include a short explanation and a source field naming the factual reference or publication to verify during review.",
        "Return JSON only, as an object with a single key named questions containing an array.",
        "Each question object must include: sport, subcategory, difficulty, question, correct_answer, incorrect_answers, explanation, tags, source.",
    ]
    if body.subcategory:
        constraints.append(f"Use the subcategory {body.subcategory}.")
    if body.era:
        constraints.append(f"Focus on the era {body.era}.")
    if body.tags:
        constraints.append(f"Apply these tags when relevant: {', '.join(body.tags)}.")
    if body.notes:
        constraints.append(f"Additional editorial direction: {body.notes}")
    return "\n".join(constraints)


def extract_question_rows(raw: Any) -> list[dict[str, Any]]:
    if isinstance(raw, list):
        rows = raw
    elif isinstance(raw, dict):
        rows = raw.get("questions")
    else:
        text = str(raw or "").strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
            text = re.sub(r"\s*```$", "", text)
        try:
            decoded = json.loads(text)
        except json.JSONDecodeError:
            object_start, object_end = text.find("{"), text.rfind("}")
            array_start, array_end = text.find("["), text.rfind("]")
            candidates = []
            if object_start >= 0 and object_end > object_start:
                candidates.append(text[object_start : object_end + 1])
            if array_start >= 0 and array_end > array_start:
                candidates.append(text[array_start : array_end + 1])
            decoded = None
            for candidate in candidates:
                try:
                    decoded = json.loads(candidate)
                    break
                except json.JSONDecodeError:
                    continue
            if decoded is None:
                raise ValueError("Generator response did not contain valid JSON")
        return extract_question_rows(decoded)

    if not isinstance(rows, list):
        raise ValueError("Generator response must contain a questions array")
    if not all(isinstance(row, dict) for row in rows):
        raise ValueError("Every generated question must be a JSON object")
    return rows


def normalize_generated_rows(rows: list[dict[str, Any]], body: GenerateQuestionsBody) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in rows[: body.count]:
        item = dict(row)
        item["sport"] = body.sport
        item["difficulty"] = body.difficulty
        item["subcategory"] = body.subcategory or item.get("subcategory") or "general"
        item["tags"] = sorted(set(body.tags + list(item.get("tags") or [])))
        item["source"] = body.source or item.get("source") or "ai_generated_draft"
        item["status"] = "draft"
        fingerprint = re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", str(item.get("question", "")).lower())).strip()
        if fingerprint and fingerprint not in seen:
            seen.add(fingerprint)
            normalized.append(item)
    return normalized


async def call_generator(
    body: GenerateQuestionsBody,
    config: QuestionGeneratorConfig,
    *,
    client_factory: Callable[..., httpx.AsyncClient] = httpx.AsyncClient,
) -> list[dict[str, Any]]:
    payload = {
        "model": config.model,
        "temperature": 0.4,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": "You are a meticulous sports trivia editor. Output valid JSON only. Never invent citations or unverifiable statistics.",
            },
            {"role": "user", "content": build_generation_prompt(body)},
        ],
    }
    headers = {"Authorization": f"Bearer {config.api_key}", "Content-Type": "application/json"}
    try:
        async with client_factory(timeout=config.timeout_seconds) as client:
            response = await client.post(config.url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="Question generator timed out") from exc
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        detail = "Question generator rejected the request" if status < 500 else "Question generator is unavailable"
        raise HTTPException(status_code=502, detail=detail) from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Question generator returned an invalid response") from exc

    try:
        content = data["choices"][0]["message"]["content"]
        rows = extract_question_rows(content)
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Question generator returned invalid question data") from exc
    return normalize_generated_rows(rows, body)


def register_routes(
    api_router,
    *,
    db,
    get_current_user: Callable[..., Awaitable[dict[str, Any]]],
    require_admin: Callable[[dict[str, Any]], Awaitable[dict[str, Any]]],
    import_question_docs: Callable[..., Awaitable[dict[str, Any]]],
    config_factory: Callable[[], QuestionGeneratorConfig] = QuestionGeneratorConfig.from_env,
    generator: Callable[..., Awaitable[list[dict[str, Any]]]] = call_generator,
):
    @api_router.post("/admin/questions/generate")
    async def generate_questions(body: GenerateQuestionsBody, authorization: Optional[str] = Header(None)):
        user = await get_current_user(authorization)
        await require_admin(user)
        config = config_factory()
        rows = await generator(body, config)
        if not rows:
            raise HTTPException(status_code=502, detail="Question generator returned no usable questions")
        result = await import_question_docs(db, rows, default_status="draft")
        return {
            "requested": body.count,
            "generated": len(rows),
            "imported": result["imported"],
            "rejected": result["rejected"],
            "status": "draft",
        }
