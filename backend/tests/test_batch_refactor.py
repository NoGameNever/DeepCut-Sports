"""Regression tests for the batch-loading refactor.

Endpoints under test (refactored to eliminate N+1 queries):
    - GET  /api/users/search        -> uses _relations_map
    - GET  /api/friends              -> uses _public_users_map (sorted online-first)
    - GET  /api/friends/requests     -> uses _public_users_map
    - GET  /api/lobbies/{id}         -> uses _lobby_detail (batch users)
    - GET  /api/lobby-invites        -> batch lobbies + hosts + aggregated member counts
"""
import os
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest


BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
            break

API = f"{BASE_URL}/api"


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _cleanup_all(mongo_db, users_pool):
    ids = [u["user_id"] for u in users_pool]
    mongo_db.friendships.delete_many({"$or": [
        {"requester_user_id": {"$in": ids}},
        {"receiver_user_id": {"$in": ids}},
    ]})
    lobby_ids = [l["id"] for l in mongo_db.lobbies.find({"creator_user_id": {"$in": ids}}, {"id": 1})]
    mongo_db.lobby_members.delete_many({"user_id": {"$in": ids}})
    if lobby_ids:
        mongo_db.lobbies.delete_many({"id": {"$in": lobby_ids}})
        mongo_db.lobby_members.delete_many({"lobby_id": {"$in": lobby_ids}})
        mongo_db.lobby_invites.delete_many({"lobby_id": {"$in": lobby_ids}})


def _make_friends(api_client, a, b):
    api_client.post(f"{API}/friends/request", json={"user_id": b["user_id"]}, headers=_h(a["token"]))
    api_client.post(f"{API}/friends/request", json={"user_id": a["user_id"]}, headers=_h(b["token"]))


# =========================================================
# /api/users/search  — _relations_map correctness
# =========================================================
class TestSearchRelations:
    def test_relation_none(self, api_client, users_pool, mongo_db):
        _cleanup_all(mongo_db, users_pool)
        u0, u1 = users_pool[0], users_pool[1]
        q = u1["email"][:8]
        r = api_client.get(f"{API}/users/search?q={q}", headers=_h(u0["token"]))
        assert r.status_code == 200
        rec = next((x for x in r.json() if x["user_id"] == u1["user_id"]), None)
        assert rec is not None
        assert rec["relation"] == "none"
        # base public shape
        for k in ("user_id", "name", "picture", "online", "relation"):
            assert k in rec

    def test_relation_request_sent_and_received(self, api_client, users_pool, mongo_db):
        _cleanup_all(mongo_db, users_pool)
        u0, u1 = users_pool[0], users_pool[1]
        api_client.post(f"{API}/friends/request", json={"user_id": u1["user_id"]}, headers=_h(u0["token"]))
        # u0 sees u1 as request_sent
        r0 = api_client.get(f"{API}/users/search?q={u1['email'][:8]}", headers=_h(u0["token"])).json()
        rec0 = next(x for x in r0 if x["user_id"] == u1["user_id"])
        assert rec0["relation"] == "request_sent"
        # u1 sees u0 as request_received
        r1 = api_client.get(f"{API}/users/search?q={u0['email'][:8]}", headers=_h(u1["token"])).json()
        rec1 = next(x for x in r1 if x["user_id"] == u0["user_id"])
        assert rec1["relation"] == "request_received"

    def test_relation_friends(self, api_client, users_pool, mongo_db):
        _cleanup_all(mongo_db, users_pool)
        u0, u1 = users_pool[0], users_pool[1]
        _make_friends(api_client, u0, u1)
        r = api_client.get(f"{API}/users/search?q={u1['email'][:8]}", headers=_h(u0["token"])).json()
        rec = next(x for x in r if x["user_id"] == u1["user_id"])
        assert rec["relation"] == "friends"

    def test_relation_blocked_by_me_and_blocked_me(self, api_client, users_pool, mongo_db):
        _cleanup_all(mongo_db, users_pool)
        u0, u1 = users_pool[0], users_pool[1]
        # u0 blocks u1
        api_client.post(f"{API}/friends/block", json={"user_id": u1["user_id"]}, headers=_h(u0["token"]))
        r0 = api_client.get(f"{API}/users/search?q={u1['email'][:8]}", headers=_h(u0["token"])).json()
        rec0 = next(x for x in r0 if x["user_id"] == u1["user_id"])
        assert rec0["relation"] == "blocked_by_me"
        # u1's view of u0
        r1 = api_client.get(f"{API}/users/search?q={u0['email'][:8]}", headers=_h(u1["token"])).json()
        rec1 = next(x for x in r1 if x["user_id"] == u0["user_id"])
        assert rec1["relation"] == "blocked_me"
        # unblock -> back to none
        api_client.post(f"{API}/friends/unblock", json={"user_id": u1["user_id"]}, headers=_h(u0["token"]))
        r2 = api_client.get(f"{API}/users/search?q={u1['email'][:8]}", headers=_h(u0["token"])).json()
        rec2 = next(x for x in r2 if x["user_id"] == u1["user_id"])
        assert rec2["relation"] == "none"

    def test_batch_relations_multi(self, api_client, users_pool, mongo_db):
        """Search returning multiple docs must accurately label mixed relations in one batch call."""
        _cleanup_all(mongo_db, users_pool)
        u0, u1, u2, u3 = users_pool
        # u0 <-> u1 friends
        _make_friends(api_client, u0, u1)
        # u0 -> u2 pending
        api_client.post(f"{API}/friends/request", json={"user_id": u2["user_id"]}, headers=_h(u0["token"]))
        # u0 blocks u3
        api_client.post(f"{API}/friends/block", json={"user_id": u3["user_id"]}, headers=_h(u0["token"]))
        # Search by shared name prefix "TESTU_"
        r = api_client.get(f"{API}/users/search?q=TESTU_", headers=_h(u0["token"]))
        assert r.status_code == 200
        by_id = {x["user_id"]: x for x in r.json()}
        assert by_id[u1["user_id"]]["relation"] == "friends"
        assert by_id[u2["user_id"]]["relation"] == "request_sent"
        assert by_id[u3["user_id"]]["relation"] == "blocked_by_me"
        # self must be excluded
        assert u0["user_id"] not in by_id


# =========================================================
# /api/friends — _public_users_map, online-first sort
# =========================================================
class TestFriendsList:
    def test_friends_batch_and_sort(self, api_client, users_pool, mongo_db):
        _cleanup_all(mongo_db, users_pool)
        u0, u1, u2, u3 = users_pool
        _make_friends(api_client, u0, u1)
        _make_friends(api_client, u0, u2)
        _make_friends(api_client, u0, u3)
        # Make u2 online (last_seen now), leave u1/u3 offline (no last_seen)
        mongo_db.users.update_one({"user_id": u2["user_id"]}, {"$set": {"last_seen": datetime.now(timezone.utc)}})
        # Ensure u1/u3 offline (unset)
        mongo_db.users.update_many(
            {"user_id": {"$in": [u1["user_id"], u3["user_id"]]}},
            {"$unset": {"last_seen": ""}},
        )
        r = api_client.get(f"{API}/friends", headers=_h(u0["token"]))
        assert r.status_code == 200, r.text
        friends = r.json()
        got_ids = {f["user_id"] for f in friends}
        assert {u1["user_id"], u2["user_id"], u3["user_id"]}.issubset(got_ids)
        # shape check
        for f in friends:
            for k in ("user_id", "name", "picture", "online"):
                assert k in f, f"missing {k} in friends payload"
        # sort: online first, then alphabetical by name (case-insensitive)
        # find u2 index and ensure all online come first
        online_indexes = [i for i, f in enumerate(friends) if f["online"]]
        offline_indexes = [i for i, f in enumerate(friends) if not f["online"]]
        if online_indexes and offline_indexes:
            assert max(online_indexes) < min(offline_indexes), "online friends must be listed first"

    def test_friends_empty(self, api_client, users_pool, mongo_db):
        _cleanup_all(mongo_db, users_pool)
        u0 = users_pool[0]
        r = api_client.get(f"{API}/friends", headers=_h(u0["token"]))
        assert r.status_code == 200
        assert r.json() == []


# =========================================================
# /api/friends/requests — _public_users_map + friendship_id
# =========================================================
class TestFriendRequestsList:
    def test_requests_batch(self, api_client, users_pool, mongo_db):
        _cleanup_all(mongo_db, users_pool)
        u0, u1, u2, u3 = users_pool
        # u1, u2, u3 all send requests to u0
        api_client.post(f"{API}/friends/request", json={"user_id": u0["user_id"]}, headers=_h(u1["token"]))
        api_client.post(f"{API}/friends/request", json={"user_id": u0["user_id"]}, headers=_h(u2["token"]))
        api_client.post(f"{API}/friends/request", json={"user_id": u0["user_id"]}, headers=_h(u3["token"]))
        r = api_client.get(f"{API}/friends/requests", headers=_h(u0["token"]))
        assert r.status_code == 200
        reqs = r.json()
        assert len(reqs) == 3
        for req in reqs:
            for k in ("user_id", "name", "picture", "online", "friendship_id"):
                assert k in req, f"missing {k}"
            assert req["friendship_id"]
        got = {r["user_id"] for r in reqs}
        assert got == {u1["user_id"], u2["user_id"], u3["user_id"]}


# =========================================================
# /api/lobbies/{id} — _lobby_detail batch
# =========================================================
class TestLobbyDetailBatch:
    def test_detail_with_members_and_invites(self, api_client, users_pool, mongo_db):
        _cleanup_all(mongo_db, users_pool)
        u0, u1, u2, u3 = users_pool
        # host u0 creates lobby
        lb = api_client.post(f"{API}/lobbies", json={
            "settings": {"selected_categories": ["soccer"], "difficulty": "normal", "timer_seconds": 20, "era_filter": "all"}
        }, headers=_h(u0["token"])).json()
        assert "invite_token" in lb, f"create_lobby failed: {lb}"
        # u1 joins via token
        api_client.post(f"{API}/join", json={"token": lb["invite_token"]}, headers=_h(u1["token"]))
        # host invites friends u2 & u3 (must be friends first)
        _make_friends(api_client, u0, u2)
        _make_friends(api_client, u0, u3)
        api_client.post(f"{API}/lobbies/{lb['id']}/invite/friend", json={"user_id": u2["user_id"]}, headers=_h(u0["token"]))
        api_client.post(f"{API}/lobbies/{lb['id']}/invite/friend", json={"user_id": u3["user_id"]}, headers=_h(u0["token"]))

        det = api_client.get(f"{API}/lobbies/{lb['id']}", headers=_h(u0["token"]))
        assert det.status_code == 200
        d = det.json()
        # members batch
        assert d["member_count"] == 2
        assert len(d["members"]) == 2
        by_id = {m["user_id"]: m for m in d["members"]}
        assert u0["user_id"] in by_id and by_id[u0["user_id"]]["role"] == "host"
        assert u1["user_id"] in by_id and by_id[u1["user_id"]]["role"] == "player"
        for m in d["members"]:
            for k in ("user_id", "name", "picture", "online", "role", "score", "finished"):
                assert k in m, f"member missing {k}"
        # pending friend invites batch
        assert len(d["pending_friend_invites"]) == 2
        by_pid = {p["user_id"]: p for p in d["pending_friend_invites"]}
        assert u2["user_id"] in by_pid and u3["user_id"] in by_pid
        for pi in d["pending_friend_invites"]:
            for k in ("user_id", "name", "picture", "online", "invite_id"):
                assert k in pi, f"invite missing {k}"
            assert pi["invite_id"]

    def test_detail_score_and_finished_reflected(self, api_client, users_pool, mongo_db):
        _cleanup_all(mongo_db, users_pool)
        u0, u1 = users_pool[0], users_pool[1]
        lb = api_client.post(f"{API}/lobbies", json={}, headers=_h(u0["token"])).json()
        api_client.post(f"{API}/join", json={"token": lb["invite_token"]}, headers=_h(u1["token"]))
        # Force lobby active + mutate a member score directly to test _lobby_detail projection
        mongo_db.lobbies.update_one({"id": lb["id"]}, {"$set": {"status": "active"}})
        mongo_db.lobby_members.update_one(
            {"lobby_id": lb["id"], "user_id": u1["user_id"]},
            {"$set": {"score": 42, "finished": True}},
        )
        d = api_client.get(f"{API}/lobbies/{lb['id']}", headers=_h(u0["token"])).json()
        m1 = next(m for m in d["members"] if m["user_id"] == u1["user_id"])
        assert m1["score"] == 42
        assert m1["finished"] is True


# =========================================================
# /api/lobby-invites — batch lobbies+hosts+aggregation
# =========================================================
class TestLobbyInvitesList:
    def test_list_shape_and_batch_counts(self, api_client, users_pool, mongo_db):
        _cleanup_all(mongo_db, users_pool)
        u0, u1, u2, u3 = users_pool
        # friendships: u3 <-> u0, u3 <-> u1 (so both hosts can invite u3)
        _make_friends(api_client, u0, u3)
        _make_friends(api_client, u1, u3)

        # Host u0's lobby (2 members: u0 + u2 joins)
        lb_a = api_client.post(f"{API}/lobbies", json={
            "settings": {"selected_categories": ["nba"]}
        }, headers=_h(u0["token"])).json()
        assert "invite_token" in lb_a, f"create_lobby A failed: {lb_a}"
        api_client.post(f"{API}/join", json={"token": lb_a["invite_token"]}, headers=_h(u2["token"]))

        # Host u1's lobby (1 member: u1 only)
        lb_b = api_client.post(f"{API}/lobbies", json={
            "settings": {"selected_categories": ["mlb"]}
        }, headers=_h(u1["token"])).json()
        assert "invite_token" in lb_b, f"create_lobby B failed: {lb_b}"

        # Both hosts invite u3
        r_a = api_client.post(f"{API}/lobbies/{lb_a['id']}/invite/friend",
                              json={"user_id": u3["user_id"]}, headers=_h(u0["token"]))
        r_b = api_client.post(f"{API}/lobbies/{lb_b['id']}/invite/friend",
                              json={"user_id": u3["user_id"]}, headers=_h(u1["token"]))
        assert r_a.status_code == 200 and r_b.status_code == 200

        invs = api_client.get(f"{API}/lobby-invites", headers=_h(u3["token"]))
        assert invs.status_code == 200, invs.text
        data = invs.json()
        assert isinstance(data, list) and len(data) >= 2
        # Locate each by lobby_id
        by_lobby = {i["lobby_id"]: i for i in data}
        assert lb_a["id"] in by_lobby and lb_b["id"] in by_lobby

        inv_a = by_lobby[lb_a["id"]]
        inv_b = by_lobby[lb_b["id"]]

        # Shape checks
        for inv in (inv_a, inv_b):
            for k in ("invite_id", "lobby_id", "sport", "host_name", "host_picture", "member_count", "max_players"):
                assert k in inv, f"missing {k} in {inv}"

        # Host info batched correctly
        assert inv_a["host_name"] == u0["name"]
        assert inv_b["host_name"] == u1["name"]

        # Sport pulled from settings.selected_categories[0]
        assert inv_a["sport"] == "nba"
        assert inv_b["sport"] == "mlb"

        # Member count aggregated
        assert inv_a["member_count"] == 2   # u0 + u2
        assert inv_b["member_count"] == 1   # u1

        # max_players is 4 by default
        assert inv_a["max_players"] == 4
        assert inv_b["max_players"] == 4

    def test_list_hides_non_waiting_lobbies(self, api_client, users_pool, mongo_db):
        _cleanup_all(mongo_db, users_pool)
        u0, u1 = users_pool[0], users_pool[1]
        _make_friends(api_client, u0, u1)
        lb = api_client.post(f"{API}/lobbies", json={}, headers=_h(u0["token"])).json()
        api_client.post(f"{API}/lobbies/{lb['id']}/invite/friend",
                        json={"user_id": u1["user_id"]}, headers=_h(u0["token"]))
        # Flip lobby to 'active' -> invite list should exclude it
        mongo_db.lobbies.update_one({"id": lb["id"]}, {"$set": {"status": "active"}})
        r = api_client.get(f"{API}/lobby-invites", headers=_h(u1["token"]))
        assert r.status_code == 200
        assert not any(i["lobby_id"] == lb["id"] for i in r.json())


# =========================================================
# Regression sanity: friend request lifecycle end-to-end
# reflected in search relation + friends list
# =========================================================
class TestFriendLifecycleRegression:
    def test_full_lifecycle_reflection(self, api_client, users_pool, mongo_db):
        _cleanup_all(mongo_db, users_pool)
        u0, u1 = users_pool[0], users_pool[1]

        def rel_of(viewer, target):
            r = api_client.get(f"{API}/users/search?q={target['email'][:8]}", headers=_h(viewer["token"])).json()
            rec = next((x for x in r if x["user_id"] == target["user_id"]), None)
            return rec["relation"] if rec else "missing"

        # Initial: none
        assert rel_of(u0, u1) == "none"
        assert rel_of(u1, u0) == "none"

        # Send request: sent/received
        api_client.post(f"{API}/friends/request", json={"user_id": u1["user_id"]}, headers=_h(u0["token"]))
        assert rel_of(u0, u1) == "request_sent"
        assert rel_of(u1, u0) == "request_received"

        # Accept via u1
        reqs = api_client.get(f"{API}/friends/requests", headers=_h(u1["token"])).json()
        fid = next(r["friendship_id"] for r in reqs if r["user_id"] == u0["user_id"])
        api_client.post(f"{API}/friends/{fid}/accept", headers=_h(u1["token"]))
        assert rel_of(u0, u1) == "friends"
        assert rel_of(u1, u0) == "friends"

        # /friends should show u1 for u0
        fl = api_client.get(f"{API}/friends", headers=_h(u0["token"])).json()
        assert any(f["user_id"] == u1["user_id"] for f in fl)

        # Remove
        api_client.post(f"{API}/friends/remove", json={"user_id": u1["user_id"]}, headers=_h(u0["token"]))
        assert rel_of(u0, u1) == "none"
        fl2 = api_client.get(f"{API}/friends", headers=_h(u0["token"])).json()
        assert not any(f["user_id"] == u1["user_id"] for f in fl2)

        # Send + Decline
        api_client.post(f"{API}/friends/request", json={"user_id": u1["user_id"]}, headers=_h(u0["token"]))
        reqs2 = api_client.get(f"{API}/friends/requests", headers=_h(u1["token"])).json()
        fid2 = next(r["friendship_id"] for r in reqs2 if r["user_id"] == u0["user_id"])
        api_client.post(f"{API}/friends/{fid2}/decline", headers=_h(u1["token"]))
        assert rel_of(u0, u1) == "none"

        # Block / Unblock
        api_client.post(f"{API}/friends/block", json={"user_id": u1["user_id"]}, headers=_h(u0["token"]))
        assert rel_of(u0, u1) == "blocked_by_me"
        assert rel_of(u1, u0) == "blocked_me"
        api_client.post(f"{API}/friends/unblock", json={"user_id": u1["user_id"]}, headers=_h(u0["token"]))
        assert rel_of(u0, u1) == "none"
