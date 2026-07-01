"""Tests for Friends + Multiplayer Lobbies + Invite Links."""
import os
from datetime import datetime, timezone, timedelta

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    from pathlib import Path
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
            break

API = f"{BASE_URL}/api"


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _cleanup_friendships(mongo_db, users_pool):
    ids = [u["user_id"] for u in users_pool]
    mongo_db.friendships.delete_many({"$or": [
        {"requester_user_id": {"$in": ids}},
        {"receiver_user_id": {"$in": ids}},
    ]})


def _cleanup_lobbies_for(mongo_db, users_pool):
    ids = [u["user_id"] for u in users_pool]
    lobby_ids = [l["id"] for l in mongo_db.lobbies.find({"creator_user_id": {"$in": ids}}, {"id": 1})]
    mongo_db.lobby_members.delete_many({"user_id": {"$in": ids}})
    if lobby_ids:
        mongo_db.lobbies.delete_many({"id": {"$in": lobby_ids}})
        mongo_db.lobby_members.delete_many({"lobby_id": {"$in": lobby_ids}})
        mongo_db.lobby_invites.delete_many({"lobby_id": {"$in": lobby_ids}})


# =========================
# FRIENDS
# =========================
class TestFriends:
    def test_search_self_excluded(self, api_client, users_pool):
        u0, u1 = users_pool[0], users_pool[1]
        # u1's email substring search from u0 should find u1, and never u0 itself
        q = u1["email"][:8]
        r = api_client.get(f"{API}/users/search?q={q}", headers=_h(u0["token"]))
        assert r.status_code == 200, r.text
        data = r.json()
        ids = [d["user_id"] for d in data]
        assert u0["user_id"] not in ids
        assert u1["user_id"] in ids

    def test_search_too_short_returns_empty(self, api_client, users_pool):
        r = api_client.get(f"{API}/users/search?q=a", headers=_h(users_pool[0]["token"]))
        assert r.status_code == 200
        assert r.json() == []

    def test_cannot_add_self(self, api_client, users_pool):
        u0 = users_pool[0]
        r = api_client.post(f"{API}/friends/request", json={"user_id": u0["user_id"]}, headers=_h(u0["token"]))
        assert r.status_code == 400

    def test_request_and_duplicate_and_accept_flow(self, api_client, users_pool, mongo_db):
        _cleanup_friendships(mongo_db, users_pool)
        u0, u1 = users_pool[0], users_pool[1]
        r = api_client.post(f"{API}/friends/request", json={"user_id": u1["user_id"]}, headers=_h(u0["token"]))
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "pending"
        # duplicate pending -> 400
        r2 = api_client.post(f"{API}/friends/request", json={"user_id": u1["user_id"]}, headers=_h(u0["token"]))
        assert r2.status_code == 400

        # reverse-pending from receiver auto-accepts
        _cleanup_friendships(mongo_db, users_pool)
        api_client.post(f"{API}/friends/request", json={"user_id": u1["user_id"]}, headers=_h(u0["token"]))
        r3 = api_client.post(f"{API}/friends/request", json={"user_id": u0["user_id"]}, headers=_h(u1["token"]))
        assert r3.status_code == 200 and r3.json()["status"] == "accepted"

    def test_accept_only_by_receiver(self, api_client, users_pool, mongo_db):
        _cleanup_friendships(mongo_db, users_pool)
        u0, u1, u2 = users_pool[0], users_pool[1], users_pool[2]
        api_client.post(f"{API}/friends/request", json={"user_id": u1["user_id"]}, headers=_h(u0["token"]))
        # fetch friendship id via u1's requests list
        reqs = api_client.get(f"{API}/friends/requests", headers=_h(u1["token"])).json()
        assert reqs and reqs[0]["friendship_id"]
        fid = reqs[0]["friendship_id"]
        # u2 (non-receiver) tries to accept -> 403
        r = api_client.post(f"{API}/friends/{fid}/accept", headers=_h(u2["token"]))
        assert r.status_code == 403
        # requester (u0) tries to accept -> 403
        r2 = api_client.post(f"{API}/friends/{fid}/accept", headers=_h(u0["token"]))
        assert r2.status_code == 403
        # receiver accepts -> 200
        r3 = api_client.post(f"{API}/friends/{fid}/accept", headers=_h(u1["token"]))
        assert r3.status_code == 200 and r3.json()["status"] == "accepted"

    def test_decline_and_remove(self, api_client, users_pool, mongo_db):
        _cleanup_friendships(mongo_db, users_pool)
        u0, u1 = users_pool[0], users_pool[1]
        # decline flow
        api_client.post(f"{API}/friends/request", json={"user_id": u1["user_id"]}, headers=_h(u0["token"]))
        reqs = api_client.get(f"{API}/friends/requests", headers=_h(u1["token"])).json()
        fid = reqs[0]["friendship_id"]
        r = api_client.post(f"{API}/friends/{fid}/decline", headers=_h(u1["token"]))
        assert r.status_code == 200
        # remove flow (must be friends first)
        api_client.post(f"{API}/friends/request", json={"user_id": u1["user_id"]}, headers=_h(u0["token"]))
        api_client.post(f"{API}/friends/request", json={"user_id": u0["user_id"]}, headers=_h(u1["token"]))
        rm = api_client.post(f"{API}/friends/remove", json={"user_id": u1["user_id"]}, headers=_h(u0["token"]))
        assert rm.status_code == 200
        # removing non-friend -> 404
        rm2 = api_client.post(f"{API}/friends/remove", json={"user_id": u1["user_id"]}, headers=_h(u0["token"]))
        assert rm2.status_code == 404

    def test_block_prevents_request(self, api_client, users_pool, mongo_db):
        _cleanup_friendships(mongo_db, users_pool)
        u0, u1 = users_pool[0], users_pool[1]
        # u0 blocks u1
        b = api_client.post(f"{API}/friends/block", json={"user_id": u1["user_id"]}, headers=_h(u0["token"]))
        assert b.status_code == 200
        # u1 can't send friend request to u0
        r = api_client.post(f"{API}/friends/request", json={"user_id": u0["user_id"]}, headers=_h(u1["token"]))
        assert r.status_code == 403
        # u0 also can't request u1 (blocked relationship)
        r2 = api_client.post(f"{API}/friends/request", json={"user_id": u1["user_id"]}, headers=_h(u0["token"]))
        assert r2.status_code == 403
        # unblock
        ub = api_client.post(f"{API}/friends/unblock", json={"user_id": u1["user_id"]}, headers=_h(u0["token"]))
        assert ub.status_code == 200

    def test_list_friends_and_requests(self, api_client, users_pool, mongo_db):
        _cleanup_friendships(mongo_db, users_pool)
        u0, u1 = users_pool[0], users_pool[1]
        api_client.post(f"{API}/friends/request", json={"user_id": u1["user_id"]}, headers=_h(u0["token"]))
        api_client.post(f"{API}/friends/request", json={"user_id": u0["user_id"]}, headers=_h(u1["token"]))
        friends = api_client.get(f"{API}/friends", headers=_h(u0["token"])).json()
        assert any(f["user_id"] == u1["user_id"] for f in friends)


# =========================
# LOBBY CREATE / GET / INVITE LINK
# =========================
def _create_lobby(api_client, tok, sport="soccer"):
    r = api_client.post(f"{API}/lobbies", json={
        "sport": sport, "difficulty": "medium", "timer": "standard", "era": "modern"
    }, headers=_h(tok))
    assert r.status_code == 200, r.text
    return r.json()


class TestLobby:
    def test_create_lobby_waiting_with_host(self, api_client, users_pool, mongo_db):
        _cleanup_lobbies_for(mongo_db, users_pool)
        u0 = users_pool[0]
        lb = _create_lobby(api_client, u0["token"])
        assert lb["status"] == "waiting"
        assert lb["code"] and lb["invite_token"] and lb["invite_url"]
        assert lb["is_host"] is True
        assert lb["max_players"] == 4
        assert len(lb["members"]) == 1
        assert lb["members"][0]["user_id"] == u0["user_id"]
        assert lb["members"][0]["role"] == "host"

    def test_get_lobby_non_member_forbidden(self, api_client, users_pool, mongo_db):
        _cleanup_lobbies_for(mongo_db, users_pool)
        u0, u1 = users_pool[0], users_pool[1]
        lb = _create_lobby(api_client, u0["token"])
        r = api_client.get(f"{API}/lobbies/{lb['id']}", headers=_h(u1["token"]))
        assert r.status_code == 403

    def test_invite_link_host_only(self, api_client, users_pool, mongo_db):
        _cleanup_lobbies_for(mongo_db, users_pool)
        u0, u1 = users_pool[0], users_pool[1]
        lb = _create_lobby(api_client, u0["token"])
        # join u1 via token to make them a member (not host)
        api_client.post(f"{API}/join", json={"token": lb["invite_token"]}, headers=_h(u1["token"]))
        r = api_client.post(f"{API}/lobbies/{lb['id']}/invite", headers=_h(u1["token"]))
        assert r.status_code == 403
        # host succeeds
        r2 = api_client.post(f"{API}/lobbies/{lb['id']}/invite", headers=_h(u0["token"]))
        assert r2.status_code == 200
        body = r2.json()
        assert body["inviteToken"] and body["inviteUrl"] and body["expiresAt"]


# =========================
# INVITE VALIDATE + JOIN
# =========================
class TestInviteAndJoin:
    def test_validate_valid(self, api_client, users_pool, mongo_db):
        _cleanup_lobbies_for(mongo_db, users_pool)
        u0 = users_pool[0]
        lb = _create_lobby(api_client, u0["token"])
        r = api_client.get(f"{API}/join/{lb['invite_token']}")
        assert r.status_code == 200
        d = r.json()
        assert d["valid"] is True
        assert d["lobby_id"] == lb["id"]
        assert d["max_players"] == 4

    def test_validate_invalid_token(self, api_client):
        r = api_client.get(f"{API}/join/not-a-real-token")
        assert r.status_code == 200
        assert r.json()["valid"] is False
        assert r.json()["reason"] == "invalid"

    def test_validate_expired(self, api_client, users_pool, mongo_db):
        _cleanup_lobbies_for(mongo_db, users_pool)
        u0 = users_pool[0]
        lb = _create_lobby(api_client, u0["token"])
        # push expiry into the past
        mongo_db.lobbies.update_one(
            {"id": lb["id"]},
            {"$set": {"expires_at": datetime.now(timezone.utc) - timedelta(hours=1)}},
        )
        r = api_client.get(f"{API}/join/{lb['invite_token']}").json()
        assert r["valid"] is False and r["reason"] == "expired"

    def test_join_idempotent_and_full_and_started(self, api_client, users_pool, mongo_db):
        _cleanup_lobbies_for(mongo_db, users_pool)
        u0, u1, u2, u3 = users_pool
        lb = _create_lobby(api_client, u0["token"])
        tok = lb["invite_token"]
        # u1 joins
        r1 = api_client.post(f"{API}/join", json={"token": tok}, headers=_h(u1["token"]))
        assert r1.status_code == 200
        # duplicate join = idempotent 200 (no error)
        r1b = api_client.post(f"{API}/join", json={"token": tok}, headers=_h(u1["token"]))
        assert r1b.status_code == 200
        # u2, u3 join -> lobby full at 4
        api_client.post(f"{API}/join", json={"token": tok}, headers=_h(u2["token"]))
        api_client.post(f"{API}/join", json={"token": tok}, headers=_h(u3["token"]))
        # 5th distinct user would be full — create ephemeral 5th user
        import uuid as _uuid
        _uid = f"user_TEST_{_uuid.uuid4().hex[:10]}"
        _tok = f"TEST_sess_{_uuid.uuid4().hex}"
        _now = datetime.now(timezone.utc)
        mongo_db.users.insert_one({
            "user_id": _uid, "email": f"TEST_{_uuid.uuid4().hex[:8]}@example.com",
            "name": "TESTU_4", "picture": None, "total_score": 0, "matches": 0,
            "correct_answers": 0, "total_answers": 0, "best_sport": None,
            "sport_scores": {}, "created_at": _now,
        })
        mongo_db.user_sessions.insert_one({
            "session_token": _tok, "user_id": _uid,
            "expires_at": _now + timedelta(days=1), "created_at": _now,
        })
        u4 = {"user_id": _uid, "token": _tok}
        try:
            r_full = api_client.post(f"{API}/join", json={"token": tok}, headers=_h(u4["token"]))
            assert r_full.status_code == 409
            # validate reports full
            v = api_client.get(f"{API}/join/{tok}").json()
            assert v["valid"] is False and v["reason"] == "full"
        finally:
            mongo_db.users.delete_one({"user_id": u4["user_id"]})
            mongo_db.user_sessions.delete_one({"session_token": u4["token"]})
            mongo_db.lobby_members.delete_one({"lobby_id": lb["id"], "user_id": u4["user_id"]})

        # start lobby (>=2 members) — will attempt LLM. If LLM fails, force status to active in DB to test 'started' branch.
        start = api_client.post(f"{API}/lobbies/{lb['id']}/start", headers=_h(u0["token"]))
        if start.status_code != 200:
            mongo_db.lobbies.update_one({"id": lb["id"]}, {"$set": {"status": "active", "questions": [{"id": "q1", "question": "?", "options": ["a", "b", "c", "d"], "correct_index": 0}]}})
        v2 = api_client.get(f"{API}/join/{tok}").json()
        assert v2["valid"] is False and v2["reason"] == "started"


# =========================
# FRIEND LOBBY INVITE
# =========================
class TestFriendLobbyInvite:
    def test_invite_friend_flow(self, api_client, users_pool, mongo_db):
        _cleanup_lobbies_for(mongo_db, users_pool)
        _cleanup_friendships(mongo_db, users_pool)
        u0, u1, u2 = users_pool[0], users_pool[1], users_pool[2]
        lb = _create_lobby(api_client, u0["token"])
        # not friends -> 403
        r = api_client.post(f"{API}/lobbies/{lb['id']}/invite/friend", json={"user_id": u1["user_id"]}, headers=_h(u0["token"]))
        assert r.status_code == 403
        # make friends
        api_client.post(f"{API}/friends/request", json={"user_id": u1["user_id"]}, headers=_h(u0["token"]))
        api_client.post(f"{API}/friends/request", json={"user_id": u0["user_id"]}, headers=_h(u1["token"]))
        # invite friend ok
        r2 = api_client.post(f"{API}/lobbies/{lb['id']}/invite/friend", json={"user_id": u1["user_id"]}, headers=_h(u0["token"]))
        assert r2.status_code == 200 and r2.json()["status"] == "invited"
        # duplicate -> 400
        r3 = api_client.post(f"{API}/lobbies/{lb['id']}/invite/friend", json={"user_id": u1["user_id"]}, headers=_h(u0["token"]))
        assert r3.status_code == 400
        # invite already-member -> 400
        api_client.post(f"{API}/join", json={"token": lb["invite_token"]}, headers=_h(u2["token"]))
        api_client.post(f"{API}/friends/request", json={"user_id": u2["user_id"]}, headers=_h(u0["token"]))
        api_client.post(f"{API}/friends/request", json={"user_id": u0["user_id"]}, headers=_h(u2["token"]))
        r4 = api_client.post(f"{API}/lobbies/{lb['id']}/invite/friend", json={"user_id": u2["user_id"]}, headers=_h(u0["token"]))
        assert r4.status_code == 400

    def test_lobby_invites_list_accept_decline(self, api_client, users_pool, mongo_db):
        _cleanup_lobbies_for(mongo_db, users_pool)
        _cleanup_friendships(mongo_db, users_pool)
        u0, u1, u2 = users_pool[0], users_pool[1], users_pool[2]
        # friendships
        api_client.post(f"{API}/friends/request", json={"user_id": u1["user_id"]}, headers=_h(u0["token"]))
        api_client.post(f"{API}/friends/request", json={"user_id": u0["user_id"]}, headers=_h(u1["token"]))
        api_client.post(f"{API}/friends/request", json={"user_id": u2["user_id"]}, headers=_h(u0["token"]))
        api_client.post(f"{API}/friends/request", json={"user_id": u0["user_id"]}, headers=_h(u2["token"]))

        lb = _create_lobby(api_client, u0["token"])
        api_client.post(f"{API}/lobbies/{lb['id']}/invite/friend", json={"user_id": u1["user_id"]}, headers=_h(u0["token"]))
        api_client.post(f"{API}/lobbies/{lb['id']}/invite/friend", json={"user_id": u2["user_id"]}, headers=_h(u0["token"]))

        # u1 lists invites -> has 1
        invs = api_client.get(f"{API}/lobby-invites", headers=_h(u1["token"])).json()
        assert len(invs) >= 1
        inv_id = invs[0]["invite_id"]
        # accept
        acc = api_client.post(f"{API}/lobby-invites/{inv_id}/accept", headers=_h(u1["token"]))
        assert acc.status_code == 200
        # u1 should now be a member
        det = api_client.get(f"{API}/lobbies/{lb['id']}", headers=_h(u1["token"])).json()
        assert any(m["user_id"] == u1["user_id"] for m in det["members"])
        # u2 declines
        invs2 = api_client.get(f"{API}/lobby-invites", headers=_h(u2["token"])).json()
        assert len(invs2) >= 1
        dec = api_client.post(f"{API}/lobby-invites/{invs2[0]['invite_id']}/decline", headers=_h(u2["token"]))
        assert dec.status_code == 200


# =========================
# START / GAME / SCORE / LEAVE
# =========================
class TestGameFlow:
    def test_start_permissions_and_min_players(self, api_client, users_pool, mongo_db):
        _cleanup_lobbies_for(mongo_db, users_pool)
        u0, u1 = users_pool[0], users_pool[1]
        lb = _create_lobby(api_client, u0["token"])
        # only host: u1 not a member => 403 from _require_member
        r_nm = api_client.post(f"{API}/lobbies/{lb['id']}/start", headers=_h(u1["token"]))
        assert r_nm.status_code == 403
        # need >=2 members: only host present -> 400
        r_solo = api_client.post(f"{API}/lobbies/{lb['id']}/start", headers=_h(u0["token"]))
        assert r_solo.status_code == 400
        # u1 joins; non-host tries to start -> 403
        api_client.post(f"{API}/join", json={"token": lb["invite_token"]}, headers=_h(u1["token"]))
        r_nh = api_client.post(f"{API}/lobbies/{lb['id']}/start", headers=_h(u1["token"]))
        assert r_nh.status_code == 403

    def test_start_and_game_and_score_and_completion(self, api_client, users_pool, mongo_db):
        _cleanup_lobbies_for(mongo_db, users_pool)
        u0, u1 = users_pool[0], users_pool[1]
        lb = _create_lobby(api_client, u0["token"])
        api_client.post(f"{API}/join", json={"token": lb["invite_token"]}, headers=_h(u1["token"]))
        start = api_client.post(f"{API}/lobbies/{lb['id']}/start", headers=_h(u0["token"]))
        if start.status_code != 200:
            # LLM budget-limited; simulate active status with a minimal question set
            pytest.skip(f"Start requires LLM; got {start.status_code}: {start.text}")
        # game
        g = api_client.get(f"{API}/lobbies/{lb['id']}/game", headers=_h(u0["token"]))
        assert g.status_code == 200
        assert isinstance(g.json()["questions"], list) and len(g.json()["questions"]) >= 3
        # scores
        s0 = api_client.post(f"{API}/lobbies/{lb['id']}/score",
                             json={"score": 40, "correct": 4, "total": 7}, headers=_h(u0["token"]))
        assert s0.status_code == 200
        s1 = api_client.post(f"{API}/lobbies/{lb['id']}/score",
                             json={"score": 60, "correct": 6, "total": 7}, headers=_h(u1["token"]))
        assert s1.status_code == 200
        det = s1.json()
        # both finished -> completed
        assert det["status"] == "completed"

    def test_leave_by_host_expires_lobby(self, api_client, users_pool, mongo_db):
        _cleanup_lobbies_for(mongo_db, users_pool)
        u0, u1 = users_pool[0], users_pool[1]
        lb = _create_lobby(api_client, u0["token"])
        api_client.post(f"{API}/join", json={"token": lb["invite_token"]}, headers=_h(u1["token"]))
        r = api_client.post(f"{API}/lobbies/{lb['id']}/leave", headers=_h(u0["token"]))
        assert r.status_code == 200
        # u1 tries to fetch lobby -> not a member anymore (host left triggers delete_many)
        r2 = api_client.get(f"{API}/lobbies/{lb['id']}", headers=_h(u1["token"]))
        assert r2.status_code == 403
        # DB: lobby marked expired
        doc = mongo_db.lobbies.find_one({"id": lb["id"]}, {"_id": 0})
        assert doc and doc["status"] == "expired"
