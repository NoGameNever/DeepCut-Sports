import asyncio
import json
import sys
from datetime import timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import question_bank as qb


@pytest.fixture(autouse=True)
def clear_question_cache():
    qb.clear_cache()
    yield
    qb.clear_cache()


class FakeCursor:
    def __init__(self, docs):
        self.docs = list(docs)

    def sort(self, *args, **kwargs):
        return self

    def limit(self, n):
        self.docs = self.docs[:n]
        return self

    async def to_list(self, n):
        return self.docs[:n]


class FakeCollection:
    def __init__(self):
        self.docs = []

    async def create_index(self, *args, **kwargs):
        return None

    def find(self, query=None, projection=None):
        return FakeCursor([d for d in self.docs if matches(d, query or {})])

    def aggregate(self, pipeline):
        docs = list(self.docs)
        for stage in pipeline:
            if "$match" in stage:
                docs = [d for d in docs if matches(d, stage["$match"])]
            if "$sample" in stage:
                docs = docs[: stage["$sample"]["size"]]
        return FakeCursor(docs)

    async def insert_many(self, docs):
        self.docs.extend(dict(d) for d in docs)

    async def update_many(self, query, update):
        for doc in self.docs:
            if matches(doc, query):
                apply_update(doc, update)

    async def update_one(self, query, update, upsert=False):
        for doc in self.docs:
            if matches(doc, query):
                apply_update(doc, update)
                return
        if upsert:
            doc = dict(query)
            if "$setOnInsert" in update:
                doc.update(update["$setOnInsert"])
            if "$set" in update:
                doc.update(update["$set"])
            self.docs.append(doc)


class FakeDb:
    def __init__(self):
        self.question_bank = FakeCollection()
        self.question_serves = FakeCollection()


class FakeRouter:
    def __init__(self):
        self.routes = {}

    def post(self, path):
        def decorator(handler):
            self.routes[("POST", path)] = handler
            return handler

        return decorator

    def get(self, path):
        def decorator(handler):
            self.routes[("GET", path)] = handler
            return handler

        return decorator


def matches(doc, query):
    for key, expected in query.items():
        if key == "$or":
            if not any(matches(doc, branch) for branch in expected):
                return False
            continue
        actual = doc.get(key)
        if isinstance(expected, dict):
            if "$in" in expected and actual not in expected["$in"]:
                return False
            if "$gte" in expected and actual < expected["$gte"]:
                return False
        elif actual != expected:
            return False
    return True


def apply_update(doc, update):
    if "$set" in update:
        doc.update(update["$set"])
    if "$inc" in update:
        for key, value in update["$inc"].items():
            doc[key] = doc.get(key, 0) + value


def make_question(i, sport="basketball", difficulty="medium", status="approved"):
    return qb.QuestionBankInput(
        sport=sport,
        subcategory="history",
        difficulty=difficulty,
        question=f"Which player made trivia history number {i}?",
        correct_answer=f"Correct {i}",
        incorrect_answers=[f"Wrong {i}A", f"Wrong {i}B", f"Wrong {i}C"],
        explanation="Because the record book says so.",
        tags=["history"],
        source="unit-test",
        status=status,
    ).to_doc()


def test_import_rejects_bad_questions_and_keeps_good_rows():
    db = FakeDb()
    rows = [
        make_question(1),
        {"sport": "basketball", "difficulty": "medium", "question": "Too short", "correct_answer": "A", "incorrect_answers": []},
    ]

    result = asyncio.run(qb.import_question_docs(db, rows, default_status="draft"))

    assert result["imported"] == 1
    assert len(result["rejected"]) == 1
    assert db.question_bank.docs[0]["status"] == "approved"


def test_retrieval_returns_only_approved_questions():
    db = FakeDb()
    db.question_bank.docs = [make_question(1, status="approved"), make_question(2, status="draft")]
    query = qb.QuestionBankQuery(sports=["basketball"], difficulty="medium", count=3)

    result = asyncio.run(qb.fetch_approved_questions(db, query, user_id="user_1"))

    assert [q["id"] for q in result] == [db.question_bank.docs[0]["id"]]


def test_no_repeat_logic_prefers_questions_not_recently_served():
    db = FakeDb()
    db.question_bank.docs = [make_question(1), make_question(2), make_question(3)]
    db.question_serves.docs = [{"user_id": "user_1", "question_id": db.question_bank.docs[0]["id"], "served_at": qb.utcnow()}]
    query = qb.QuestionBankQuery(sports=["basketball"], difficulty="medium", count=2)

    result = asyncio.run(qb.fetch_approved_questions(db, query, user_id="user_1"))

    assert db.question_bank.docs[0]["id"] not in {q["id"] for q in result}
    assert len(result) == 2


def test_category_filtering_supports_requested_sport():
    db = FakeDb()
    db.question_bank.docs = [make_question(1, sport="basketball"), make_question(2, sport="soccer")]
    query = qb.QuestionBankQuery(sports=["soccer"], difficulty="medium", count=3)

    result = asyncio.run(qb.fetch_approved_questions(db, query, user_id="user_1"))

    assert len(result) == 1
    assert result[0]["id"] == db.question_bank.docs[1]["id"]


def test_old_question_serves_do_not_block_reuse():
    db = FakeDb()
    db.question_bank.docs = [make_question(1), make_question(2), make_question(3)]
    db.question_serves.docs = [{
        "user_id": "user_1",
        "question_id": db.question_bank.docs[0]["id"],
        "served_at": qb.utcnow() - timedelta(days=30),
    }]
    query = qb.QuestionBankQuery(sports=["basketball"], difficulty="medium", count=3)

    result = asyncio.run(qb.fetch_approved_questions(db, query, user_id="user_1"))

    assert db.question_bank.docs[0]["id"] in {q["id"] for q in result}


def test_adalo_api_key_authorizes_without_a_user_session(monkeypatch):
    monkeypatch.setenv("ADALO_API_KEY", "adalo-test-key")

    async def should_not_load_user(_authorization):
        raise AssertionError("A valid Adalo key should not use session authentication")

    principal = asyncio.run(
        qb.authorize_generation_request(
            should_not_load_user,
            authorization=None,
            x_api_key="adalo-test-key",
        )
    )

    assert principal["user_id"] == "adalo_admin_api"


def test_invalid_adalo_api_key_does_not_bypass_admin_auth(monkeypatch):
    monkeypatch.setenv("ADALO_API_KEY", "adalo-test-key")

    async def reject_user(_authorization):
        raise HTTPException(status_code=401, detail="Not authenticated")

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            qb.authorize_generation_request(
                reject_user,
                authorization=None,
                x_api_key="wrong-key",
            )
        )

    assert exc_info.value.status_code == 401


def test_adalo_generation_creates_drafts_and_disables_response_storage(monkeypatch):
    monkeypatch.setenv("ADALO_API_KEY", "adalo-test-key")
    db = FakeDb()
    router = FakeRouter()
    captured_request = {}

    class FakeResponses:
        async def create(self, **kwargs):
            captured_request.update(kwargs)
            return SimpleNamespace(
                output_text=json.dumps(
                    {
                        "questions": [
                            {
                                "sport": "basketball",
                                "subcategory": "bench legends",
                                "difficulty": "deepcut",
                                "question": "Which reserve made this fictional unit-test moment?",
                                "correct_answer": "Correct Player",
                                "incorrect_answers": ["Wrong One", "Wrong Two", "Wrong Three"],
                                "explanation": "This is deterministic test data.",
                                "tags": ["nba"],
                                "source": "unit-test",
                            }
                        ]
                    }
                )
            )

    async def should_not_load_user(_authorization):
        raise AssertionError("A valid Adalo key should not use session authentication")

    qb.register_routes(
        router,
        db=db,
        get_current_user=should_not_load_user,
        openai_client=SimpleNamespace(responses=FakeResponses()),
        openai_model="gpt-5.6-luna",
    )
    handler = router.routes[("POST", "/admin/questions/generate-drafts")]
    result = asyncio.run(
        handler(
            body=qb.DraftGenerationBody(
                sport="basketball",
                difficulty="deepcut",
                count=1,
                subcategory="bench legends",
            ),
            authorization=None,
            x_api_key="adalo-test-key",
        )
    )

    assert captured_request["store"] is False
    assert result["generated"] == 1
    assert result["rejected_count"] == 0
    assert result["status"] == "draft"
    assert db.question_bank.docs[0]["status"] == "draft"
