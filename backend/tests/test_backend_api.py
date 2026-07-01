"""Backend tests for Sports Trivia Blitz API."""
import pytest


# ---------- Health / public endpoints ----------
class TestPublic:
    def test_root(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/")
        assert r.status_code == 200, r.text
        assert r.json() == {"message": "Sports Trivia Blitz API"}

    def test_sports_list(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/sports")
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        keys = {s["key"] for s in data}
        expected = {"soccer", "basketball", "cricket", "tennis", "f1", "nfl", "baseball"}
        assert keys == expected, f"Got {keys}"
        assert len(data) == 7
        for s in data:
            assert "name" in s and isinstance(s["name"], str) and s["name"]


# ---------- Auth gating (401) ----------
class TestAuthGate:
    @pytest.mark.parametrize("method,path,body", [
        ("get", "/api/auth/me", None),
        ("post", "/api/quiz/generate", {"sport": "soccer", "difficulty": "easy", "count": 3}),
        ("post", "/api/quiz/submit", {"sport": "soccer", "difficulty": "easy", "score": 10, "correct": 1, "total": 1}),
        ("get", "/api/leaderboard", None),
    ])
    def test_requires_bearer(self, api_client, base_url, method, path, body):
        fn = getattr(api_client, method)
        r = fn(f"{base_url}{path}", json=body) if body is not None else fn(f"{base_url}{path}")
        assert r.status_code == 401, f"{method.upper()} {path} -> {r.status_code} {r.text}"

    def test_invalid_bearer(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
        assert r.status_code == 401


# ---------- auth/me with a real DB session ----------
class TestAuthMe:
    def test_me_returns_user(self, api_client, base_url, auth_headers, test_user):
        r = api_client.get(f"{base_url}/api/auth/me", headers=auth_headers)
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["user_id"] == test_user["user_id"]
        assert u["email"] == test_user["email"]
        assert u["total_score"] == 0
        assert u["matches"] == 0


# ---------- Quiz generate (LLM) ----------
class TestQuizGenerate:
    def test_invalid_sport(self, api_client, base_url, auth_headers):
        r = api_client.post(f"{base_url}/api/quiz/generate", headers=auth_headers,
                            json={"sport": "kabaddi", "difficulty": "easy", "count": 3})
        assert r.status_code == 400, r.text

    def test_invalid_difficulty(self, api_client, base_url, auth_headers):
        r = api_client.post(f"{base_url}/api/quiz/generate", headers=auth_headers,
                            json={"sport": "soccer", "difficulty": "insane", "count": 3})
        assert r.status_code == 400, r.text

    def test_generates_questions(self, api_client, base_url, auth_headers):
        r = api_client.post(f"{base_url}/api/quiz/generate", headers=auth_headers,
                            json={"sport": "soccer", "difficulty": "easy", "count": 3},
                            timeout=90)
        assert r.status_code == 200, r.text
        questions = r.json()
        assert isinstance(questions, list) and len(questions) >= 3
        for q in questions:
            assert isinstance(q["question"], str) and q["question"]
            assert isinstance(q["options"], list) and len(q["options"]) == 4
            assert all(isinstance(o, str) and o for o in q["options"])
            assert isinstance(q["correct_index"], int) and 0 <= q["correct_index"] <= 3
            assert isinstance(q["id"], str) and q["id"]


# ---------- Quiz submit ----------
class TestQuizSubmit:
    def test_submit_updates_and_returns_rank(self, api_client, base_url, auth_headers, test_user, mongo_db):
        payload = {"sport": "basketball", "difficulty": "medium", "score": 42, "correct": 5, "total": 7}
        r = api_client.post(f"{base_url}/api/quiz/submit", headers=auth_headers, json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "user" in data and "rank" in data
        assert data["gained"] == 42
        u = data["user"]
        assert u["user_id"] == test_user["user_id"]
        assert u["total_score"] == 42
        assert u["matches"] == 1
        assert u["correct_answers"] == 5
        assert u["total_answers"] == 7
        assert u["sport_scores"]["basketball"] == 42
        assert u["best_sport"] == "basketball"
        assert isinstance(data["rank"], int) and data["rank"] >= 1

        # verify persistence via /auth/me
        r2 = api_client.get(f"{base_url}/api/auth/me", headers=auth_headers)
        assert r2.status_code == 200
        u2 = r2.json()
        assert u2["total_score"] == 42
        assert u2["matches"] == 1

        # second submit accumulates
        r3 = api_client.post(f"{base_url}/api/quiz/submit", headers=auth_headers,
                             json={"sport": "basketball", "difficulty": "hard", "score": 8, "correct": 1, "total": 3})
        assert r3.status_code == 200
        u3 = r3.json()["user"]
        assert u3["total_score"] == 50
        assert u3["matches"] == 2
        assert u3["sport_scores"]["basketball"] == 50


# ---------- Leaderboard ----------
class TestLeaderboard:
    def test_leaderboard_shape(self, api_client, base_url, auth_headers, test_user):
        r = api_client.get(f"{base_url}/api/leaderboard", headers=auth_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "top" in data and "me" in data
        assert isinstance(data["top"], list)
        for entry in data["top"]:
            for k in ["rank", "user_id", "name", "total_score", "matches"]:
                assert k in entry
            assert isinstance(entry["rank"], int)
        me = data["me"]
        assert me["user_id"] == test_user["user_id"]
        assert isinstance(me["rank"], int) and me["rank"] >= 1
