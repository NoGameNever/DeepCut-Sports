"""Tests for Knowledge XP, leveling, tiers, achievements, leaderboards, lobby match-win XP.
Reuses conftest fixtures (mongo_db, api_client, users_pool). All test data prefixed TEST_.
"""
import os
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or ""
for line in Path("/app/frontend/.env").read_text().splitlines():
    if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
        BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
        break


def _mk_user(mongo_db, name="TEST_P_user"):
    uid = f"user_TEST_{uuid.uuid4().hex[:10]}"
    tok = f"TEST_sess_{uuid.uuid4().hex}"
    now = datetime.now(timezone.utc)
    mongo_db.users.insert_one({
        "user_id": uid,
        "email": f"TEST_{uuid.uuid4().hex[:6]}@ex.com",
        "name": name,
        "picture": None,
        "total_score": 0, "matches": 0,
        "correct_answers": 0, "total_answers": 0,
        "best_sport": None, "sport_scores": {},
        "created_at": now,
    })
    mongo_db.user_sessions.insert_one({
        "session_token": tok, "user_id": uid,
        "expires_at": now + timedelta(days=1), "created_at": now,
    })
    return {"user_id": uid, "token": tok, "name": name}


def _cleanup(mongo_db, uid, tok):
    mongo_db.users.delete_one({"user_id": uid})
    mongo_db.user_sessions.delete_one({"session_token": tok})
    mongo_db.user_achievements.delete_many({"user_id": uid})
    mongo_db.xp_events.delete_many({"user_id": uid})
    mongo_db.friendships.delete_many({"$or": [{"requester_user_id": uid}, {"receiver_user_id": uid}]})


def _auth(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


# ---------- /api/progression payload ----------
class TestProgressionEndpoint:
    def test_default_progression_for_new_user(self, mongo_db):
        u = _mk_user(mongo_db)
        try:
            r = requests.get(f"{BASE_URL}/api/progression", headers=_auth(u["token"]))
            assert r.status_code == 200, r.text
            d = r.json()
            # required keys
            for k in ["level", "lifetime_xp", "weekly_xp", "current_level_xp",
                      "xp_to_next_level", "level_progress", "tier", "next_tier",
                      "tier_progress", "accuracy", "current_streak", "best_streak",
                      "level_rewards", "achievements"]:
                assert k in d, f"missing {k}"
            assert d["level"] == 1
            assert d["lifetime_xp"] == 0
            assert d["tier"]["key"] == "casual"
            assert d["tier"]["name"] == "Casual"
            assert d["next_tier"]["key"] == "ball_watcher"
            assert len(d["level_rewards"]) == 7
            assert all("unlocked" in r for r in d["level_rewards"])
            assert not any(r["unlocked"] for r in d["level_rewards"])
            assert len(d["achievements"]) == 8
            # Nostradamus is coming soon
            nostra = next(a for a in d["achievements"] if a["id"] == "nostradamus")
            assert nostra["coming_soon"] is True
            # Achievement structure
            for a in d["achievements"]:
                assert "progress" in a and "current" in a and "target" in a and "unlocked" in a
        finally:
            _cleanup(mongo_db, u["user_id"], u["token"])


# ---------- XP math via /api/quiz/submit ----------
class TestQuizSubmitXP:
    def test_easy_medium_hard_deepcut_xp(self, mongo_db):
        u = _mk_user(mongo_db)
        try:
            answers = [
                {"correct": True, "difficulty": "easy"},           # 10
                {"correct": True, "difficulty": "medium"},         # 15
                {"correct": True, "difficulty": "hard"},           # 25
                {"correct": True, "difficulty": "hard", "deep_cut": True},  # 40
                {"correct": False, "difficulty": "easy"},          # 0
            ]
            r = requests.post(f"{BASE_URL}/api/quiz/submit", headers=_auth(u["token"]),
                              json={"sport": "basketball", "difficulty": "medium",
                                    "score": 0, "correct": 4, "total": 5, "answers": answers})
            assert r.status_code == 200, r.text
            prog = r.json()["progression"]
            # 10+15+25+40 = 90; streak of 4 gives one +10 bonus at streak=3; then wrong resets
            # so gain: 90 + 10 = 100
            assert prog["xp_gained"] == 100, prog
            assert prog["lifetime_xp"] == 100
            assert prog["level"] == 2  # 100 XP == L2
            assert prog["leveled_up"] is True
        finally:
            _cleanup(mongo_db, u["user_id"], u["token"])

    def test_aura_100_unlocks_once_at_7_streak(self, mongo_db):
        u = _mk_user(mongo_db)
        try:
            answers = [{"correct": True, "difficulty": "medium"} for _ in range(7)]
            # 7*15 = 105 + streak bonuses at 3(+10), 5(+25) = 140; +250 aura_100 = 390
            r = requests.post(f"{BASE_URL}/api/quiz/submit", headers=_auth(u["token"]),
                              json={"sport": "basketball", "difficulty": "medium",
                                    "score": 0, "correct": 7, "total": 7, "answers": answers})
            assert r.status_code == 200, r.text
            prog = r.json()["progression"]
            unlocked_ids = [a["id"] for a in prog["unlocked_achievements"]]
            assert "aura_100" in unlocked_ids
            assert prog["xp_gained"] == 105 + 10 + 25 + 250, prog["xp_gained"]

            # Repeat submit - no duplicate unlock
            r2 = requests.post(f"{BASE_URL}/api/quiz/submit", headers=_auth(u["token"]),
                               json={"sport": "basketball", "difficulty": "medium",
                                     "score": 0, "correct": 7, "total": 7, "answers": answers})
            prog2 = r2.json()["progression"]
            unlocked2 = [a["id"] for a in prog2["unlocked_achievements"]]
            assert "aura_100" not in unlocked2
        finally:
            _cleanup(mongo_db, u["user_id"], u["token"])

    def test_streak_persistence_across_submits(self, mongo_db):
        u = _mk_user(mongo_db)
        try:
            # submit 2 correct then next call 2 more correct -> continues streak
            answers1 = [{"correct": True, "difficulty": "medium"}] * 2
            requests.post(f"{BASE_URL}/api/quiz/submit", headers=_auth(u["token"]),
                          json={"sport": "basketball", "difficulty": "medium",
                                "score": 0, "correct": 2, "total": 2, "answers": answers1})
            p = requests.get(f"{BASE_URL}/api/progression", headers=_auth(u["token"])).json()
            assert p["current_streak"] == 2 and p["best_streak"] == 2

            answers2 = [{"correct": True, "difficulty": "medium"}] * 2
            r = requests.post(f"{BASE_URL}/api/quiz/submit", headers=_auth(u["token"]),
                              json={"sport": "basketball", "difficulty": "medium",
                                    "score": 0, "correct": 2, "total": 2, "answers": answers2})
            prog = r.json()["progression"]
            # current_streak now 4 (3 triggers +10 bonus)
            assert prog["current_streak"] == 4, prog
            # verify best_streak persisted via /progression
            p2 = requests.get(f"{BASE_URL}/api/progression", headers=_auth(u["token"])).json()
            assert p2["best_streak"] == 4
        finally:
            _cleanup(mongo_db, u["user_id"], u["token"])

    def test_xp_events_logged(self, mongo_db):
        u = _mk_user(mongo_db)
        try:
            answers = [{"correct": True, "difficulty": "medium"}] * 3  # 45 + 10 streak bonus
            requests.post(f"{BASE_URL}/api/quiz/submit", headers=_auth(u["token"]),
                          json={"sport": "basketball", "difficulty": "medium",
                                "score": 0, "correct": 3, "total": 3, "answers": answers})
            events = list(mongo_db.xp_events.find({"user_id": u["user_id"]}))
            sources = {e["source"] for e in events}
            assert "correct_answer" in sources
            assert "streak_bonus" in sources
            total_amt = sum(e["amount"] for e in events)
            assert total_amt == 55
        finally:
            _cleanup(mongo_db, u["user_id"], u["token"])


# ---------- Level thresholds ----------
class TestLevelThresholds:
    def test_l5_reward_unlocks_at_850_xp(self, mongo_db):
        u = _mk_user(mongo_db)
        try:
            # Bump XP directly to 850 by inserting; then trigger a submit that awards 0 to normalize
            mongo_db.users.update_one({"user_id": u["user_id"]},
                                      {"$set": {"lifetime_xp": 0, "level": 1}})
            # 850 XP via 34 hard corrects (34*25=850). streak bonuses at 3,5,10 = 10+25+75 = 110
            # For clean, use 85 easy corrects (85*10=850) + streak bonuses. Simpler: use direct XP via many hards
            # But answers list of 85 items is fine; total XP = 850 + streak bonuses (10+25+75=110) = 960
            answers = [{"correct": True, "difficulty": "hard"} for _ in range(34)]
            r = requests.post(f"{BASE_URL}/api/quiz/submit", headers=_auth(u["token"]),
                              json={"sport": "basketball", "difficulty": "hard",
                                    "score": 0, "correct": 34, "total": 34, "answers": answers})
            prog = r.json()["progression"]
            assert prog["lifetime_xp"] >= 850
            assert prog["level"] >= 5
            reward_ids = [r["id"] for r in prog["new_rewards"]]
            assert "profile_border" in reward_ids
            # verify via /progression that level_rewards profile_border unlocked
            p = requests.get(f"{BASE_URL}/api/progression", headers=_auth(u["token"])).json()
            pb = next(r for r in p["level_rewards"] if r["id"] == "profile_border")
            assert pb["unlocked"] is True
        finally:
            _cleanup(mongo_db, u["user_id"], u["token"])


# ---------- Leaderboard ----------
class TestLeaderboard:
    def test_all_four_boards(self, mongo_db):
        u = _mk_user(mongo_db)
        try:
            for board in ("global_alltime", "global_weekly", "friends_alltime", "friends_weekly"):
                r = requests.get(f"{BASE_URL}/api/leaderboard?board={board}", headers=_auth(u["token"]))
                assert r.status_code == 200, f"{board}: {r.text}"
                d = r.json()
                assert d["board"] == board
                assert "top" in d and "me" in d
                for row in d["top"]:
                    for k in ("rank", "user_id", "name", "level", "tier", "xp", "accuracy",
                              "streak", "badge_count"):
                        assert k in row
                    assert "key" in row["tier"] and "name" in row["tier"] and "icon" in row["tier"]
        finally:
            _cleanup(mongo_db, u["user_id"], u["token"])

    def test_invalid_board_400(self, mongo_db):
        u = _mk_user(mongo_db)
        try:
            r = requests.get(f"{BASE_URL}/api/leaderboard?board=bogus", headers=_auth(u["token"]))
            assert r.status_code == 400
        finally:
            _cleanup(mongo_db, u["user_id"], u["token"])

    def test_global_alltime_has_seed_goated_top(self, mongo_db):
        u = _mk_user(mongo_db)
        try:
            r = requests.get(f"{BASE_URL}/api/leaderboard?board=global_alltime", headers=_auth(u["token"]))
            d = r.json()
            top_names = [row["name"] for row in d["top"]]
            assert any("Goated" in n for n in top_names)
            # GoatedGreg first
            assert d["top"][0]["xp"] == 52000
        finally:
            _cleanup(mongo_db, u["user_id"], u["token"])

    def test_friends_board_only_shows_me_when_no_friends(self, mongo_db):
        u = _mk_user(mongo_db)
        try:
            r = requests.get(f"{BASE_URL}/api/leaderboard?board=friends_alltime", headers=_auth(u["token"]))
            d = r.json()
            # only me present
            assert len(d["top"]) == 1
            assert d["top"][0]["user_id"] == u["user_id"]
        finally:
            _cleanup(mongo_db, u["user_id"], u["token"])


# ---------- Regressions ----------
class TestRegressions:
    def test_auth_me(self, mongo_db):
        u = _mk_user(mongo_db)
        try:
            r = requests.get(f"{BASE_URL}/api/auth/me", headers=_auth(u["token"]))
            assert r.status_code == 200
            body = r.json()
            assert body["user_id"] == u["user_id"]
            # ensure new progression fields on user_out
            for k in ("level", "lifetime_xp", "weekly_xp", "rank_tier", "current_streak", "best_streak"):
                assert k in body
        finally:
            _cleanup(mongo_db, u["user_id"], u["token"])

    def test_sports_list(self):
        r = requests.get(f"{BASE_URL}/api/sports")
        assert r.status_code == 200
        assert len(r.json()) >= 5

    def test_friends_list_empty(self, mongo_db):
        u = _mk_user(mongo_db)
        try:
            r = requests.get(f"{BASE_URL}/api/friends", headers=_auth(u["token"]))
            assert r.status_code == 200
            assert r.json() == []
        finally:
            _cleanup(mongo_db, u["user_id"], u["token"])

    def test_create_lobby(self, mongo_db):
        u = _mk_user(mongo_db)
        try:
            r = requests.post(f"{BASE_URL}/api/lobbies", headers=_auth(u["token"]), json={})
            assert r.status_code == 200, r.text
            d = r.json()
            assert d["status"] == "waiting"
            assert d["is_host"] is True
            lobby_id = d["id"]
            live = requests.get(f"{BASE_URL}/api/lobbies/{lobby_id}/live", headers=_auth(u["token"]))
            assert live.status_code == 200
            mongo_db.lobbies.delete_one({"id": lobby_id})
            mongo_db.lobby_members.delete_many({"lobby_id": lobby_id})
        finally:
            _cleanup(mongo_db, u["user_id"], u["token"])


# ---------- Lobby match-win XP flow ----------
class TestLobbyMatchWin:
    def test_winner_gets_match_win_xp_and_counter(self, mongo_db):
        """Seed an active lobby with 2 members + fake questions; both submit scores;
        higher scorer gets +100 match_win XP and counters.match_wins++."""
        u1 = _mk_user(mongo_db, name="TEST_M1")
        u2 = _mk_user(mongo_db, name="TEST_M2")
        try:
            lobby_id = uuid.uuid4().hex
            now = datetime.now(timezone.utc)
            settings = {
                "game_type": "classic", "question_count": 3, "difficulty": "normal",
                "selected_categories": ["general"], "selected_subcategories": [],
                "era_filter": "all", "answer_format": "multiple_choice",
                "timer_seconds": 15, "speed_bonus_enabled": True,
                "streak_bonus_enabled": True, "wrong_answer_penalty_enabled": False,
                "final_question_multiplier_enabled": False, "max_players": 4,
                "friends_only": False, "invite_only": True, "allow_rematch": True,
                "allow_spectators": False, "settings_locked": True,
            }
            fake_qs = [{"id": uuid.uuid4().hex, "question": "q?", "options": ["a", "b", "c", "d"],
                        "correct_index": 0, "difficulty": "medium", "tags": [], "deep_cut": False}
                       for _ in range(3)]
            mongo_db.lobbies.insert_one({
                "id": lobby_id, "creator_user_id": u1["user_id"], "code": "TESTLB",
                "invite_token": "tk_test_" + uuid.uuid4().hex[:6],
                "status": "active", "settings": settings, "questions": fake_qs,
                "created_at": now, "updated_at": now, "started_at": now,
                "expires_at": now + timedelta(hours=2),
            })
            for uid, role in [(u1["user_id"], "host"), (u2["user_id"], "player")]:
                mongo_db.lobby_members.insert_one({
                    "id": uuid.uuid4().hex, "lobby_id": lobby_id, "user_id": uid,
                    "role": role, "score": None, "finished": False, "joined_at": now,
                })

            # u1 submits lower score (2 correct)
            answers1 = [{"correct": True, "difficulty": "medium"}] * 2 + [{"correct": False, "difficulty": "medium"}]
            r1 = requests.post(f"{BASE_URL}/api/lobbies/{lobby_id}/score",
                               headers=_auth(u1["token"]),
                               json={"score": 200, "correct": 2, "total": 3, "answers": answers1})
            assert r1.status_code == 200, r1.text

            # u2 submits higher score (3 correct) -> should win
            answers2 = [{"correct": True, "difficulty": "medium"}] * 3
            r2 = requests.post(f"{BASE_URL}/api/lobbies/{lobby_id}/score",
                               headers=_auth(u2["token"]),
                               json={"score": 500, "correct": 3, "total": 3, "answers": answers2})
            assert r2.status_code == 200, r2.text
            d2 = r2.json()
            assert d2["status"] == "completed"
            prog2 = d2["progression"]
            # u2 answers: 3*15 = 45 + streak bonus at 3 (+10) = 55; +100 match_win = 155
            assert prog2["xp_gained"] == 155, prog2
            breakdown_sources = [b["source"] for b in prog2["breakdown"]]
            assert "match_win" in breakdown_sources

            # counters.match_wins for u2 == 1, for u1 == 0
            u2_doc = mongo_db.users.find_one({"user_id": u2["user_id"]})
            u1_doc = mongo_db.users.find_one({"user_id": u1["user_id"]})
            assert (u2_doc.get("counters") or {}).get("match_wins", 0) == 1
            assert (u1_doc.get("counters") or {}).get("match_wins", 0) == 0

            # match_win xp_event logged for u2
            evts = list(mongo_db.xp_events.find({"user_id": u2["user_id"], "source": "match_win"}))
            assert len(evts) == 1

            # Idempotency: re-submit by u2 should NOT double-count match_wins
            r3 = requests.post(f"{BASE_URL}/api/lobbies/{lobby_id}/score",
                               headers=_auth(u2["token"]),
                               json={"score": 500, "correct": 3, "total": 3, "answers": answers2})
            assert r3.status_code == 200
            u2_doc2 = mongo_db.users.find_one({"user_id": u2["user_id"]})
            assert (u2_doc2.get("counters") or {}).get("match_wins", 0) == 1  # still 1

            mongo_db.lobbies.delete_one({"id": lobby_id})
            mongo_db.lobby_members.delete_many({"lobby_id": lobby_id})
        finally:
            _cleanup(mongo_db, u1["user_id"], u1["token"])
            _cleanup(mongo_db, u2["user_id"], u2["token"])
