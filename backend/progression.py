"""Knowledge XP, leveling, rank tiers and achievements engine.

Pure helpers + async DB helpers (db handle passed in). Used by server.py.
All user progression fields are lazily defaulted so legacy users work untouched:
  level, lifetime_xp, weekly_xp, week_key, weekly_history, rank_tier,
  current_streak, best_streak, counters{}, unlocked_level_rewards[], last_level_up_at
Collections: xp_events, user_achievements.
"""
import uuid
from datetime import datetime, timezone

# ---------- Rank tiers ----------
RANK_TIERS = [
    {"key": "casual", "name": "Casual", "icon": "🟢", "min_xp": 0, "max_xp": 499,
     "tagline": "Knows the stars. Still learning the bench mob."},
    {"key": "ball_watcher", "name": "Ball Watcher", "icon": "🔵", "min_xp": 500, "max_xp": 1999,
     "tagline": "Actually watches the games, not just the box score."},
    {"key": "ball_knower", "name": "Ball Knower", "icon": "🟣", "min_xp": 2000, "max_xp": 4999,
     "tagline": "Can name the rotation guy who cooked once in 2017."},
    {"key": "film_grinder", "name": "Film Grinder", "icon": "🟠", "min_xp": 5000, "max_xp": 11999,
     "tagline": "Pauses highlights to study weak-side help defense."},
    {"key": "elite_ball_knower", "name": "Elite Ball Knower", "icon": "🔴", "min_xp": 12000, "max_xp": 24999,
     "tagline": "Knows ball at an uncomfortable level."},
    {"key": "hall_of_ball", "name": "Hall of Ball", "icon": "👑", "min_xp": 25000, "max_xp": 49999,
     "tagline": "A walking archive with dangerous recall."},
    {"key": "goat_status", "name": "GOAT Status", "icon": "💎", "min_xp": 50000, "max_xp": None,
     "tagline": "Final boss of unnecessary sports knowledge."},
]


def rank_tier_for_xp(xp: int) -> dict:
    for tier in reversed(RANK_TIERS):
        if xp >= tier["min_xp"]:
            return tier
    return RANK_TIERS[0]


def next_rank_tier(tier: dict):
    idx = next(i for i, t in enumerate(RANK_TIERS) if t["key"] == tier["key"])
    return RANK_TIERS[idx + 1] if idx + 1 < len(RANK_TIERS) else None


# ---------- Leveling curve ----------
# Total lifetime XP required to BE at a given level (index = level).
_LEVEL_TOTALS = {1: 0, 2: 100, 3: 250, 4: 500, 5: 850, 6: 1300, 7: 1850, 8: 2500, 9: 3250, 10: 4100}


def total_xp_for_level(level: int) -> int:
    if level <= 1:
        return 0
    if level <= 10:
        return _LEVEL_TOTALS[level]
    total = _LEVEL_TOTALS[10]
    # increment matches spec examples: L11=6600, L12=9350, L13=12350
    for lv in range(10, level):
        total += 1000 + (lv - 4) * 250
    return total


def calculate_level_from_xp(total_xp: int) -> int:
    level = 1
    while total_xp >= total_xp_for_level(level + 1):
        level += 1
        if level >= 200:  # sanity cap
            break
    return level


def get_xp_to_next_level(current_level: int, total_xp: int) -> dict:
    """Returns progress within the current level."""
    floor = total_xp_for_level(current_level)
    ceiling = total_xp_for_level(current_level + 1)
    span = max(ceiling - floor, 1)
    in_level = total_xp - floor
    return {
        "current_level_xp": in_level,
        "level_span": span,
        "xp_to_next_level": max(ceiling - total_xp, 0),
        "level_progress": min(in_level / span, 1.0),
        "next_level_total_xp": ceiling,
    }


# ---------- Level rewards ----------
LEVEL_REWARDS = [
    {"level": 5, "id": "profile_border", "name": "Profile Border", "reward_type": "cosmetic",
     "description": "Unlock profile border customization", "icon": "🖼️"},
    {"level": 10, "id": "featured_achievement", "name": "Featured Achievement", "reward_type": "profile",
     "description": "Unlock featured achievement display", "icon": "🏅"},
    {"level": 15, "id": "custom_title", "name": "Custom Title", "reward_type": "leaderboard",
     "description": "Unlock custom leaderboard title", "icon": "🏷️"},
    {"level": 20, "id": "rare_frame", "name": "Rare Avatar Frame", "reward_type": "cosmetic",
     "description": "Unlock rare avatar frame", "icon": "🖤"},
    {"level": 30, "id": "animated_badge", "name": "Animated Rank Badge", "reward_type": "cosmetic",
     "description": "Unlock animated rank badge", "icon": "✨"},
    {"level": 40, "id": "hall_flair", "name": "Hall of Ball Flair", "reward_type": "cosmetic",
     "description": "Unlock Hall of Ball profile flair", "icon": "👑"},
    {"level": 50, "id": "goat_effect", "name": "GOAT Status Effect", "reward_type": "cosmetic",
     "description": "Unlock GOAT Status profile effect", "icon": "💎"},
]


# ---------- XP values ----------
XP_CORRECT = {"easy": 10, "medium": 15, "normal": 15, "hard": 25}
XP_DEEP_CUT = 40
STREAK_BONUSES = {3: 10, 5: 25, 10: 75}
XP_MATCH_WIN = 100
XP_DAILY_CHALLENGE = 50   # wired for future daily challenge feature
XP_PERFECT_DAILY = 150    # wired for future daily challenge feature

RARITY_ORDER = {"common": 1, "rare": 2, "epic": 3, "legendary": 4, "mythic": 5}

# ---------- Achievements ----------
ACHIEVEMENTS = [
    {"id": "elite_ball_knower", "name": "Elite Ball Knower", "icon": "🧠", "rarity": "epic", "reward_xp": 500,
     "description": "Reach the Elite Ball Knower rank or answer 250 hard/deep-cut questions correctly"},
    {"id": "certified", "name": "Certified", "icon": "🔥", "rarity": "rare", "reward_xp": 300,
     "description": "Win 10 head-to-head matches"},
    {"id": "film_merchant", "name": "Film Merchant", "icon": "📼", "rarity": "rare", "reward_xp": 300,
     "description": "Correctly answer 100 film, play-style or roster questions"},
    {"id": "aura_100", "name": "Aura +100", "icon": "👁️", "rarity": "common", "reward_xp": 250,
     "description": "Get a 7-question streak in any mode"},
    {"id": "nostradamus", "name": "Nostradamus", "icon": "🎯", "rarity": "legendary", "reward_xp": 500,
     "description": "Complete a prediction round with 100% correct picks", "coming_soon": True},
    {"id": "goat", "name": "GOAT", "icon": "🐐", "rarity": "mythic", "reward_xp": 1000,
     "description": "Reach GOAT Status rank"},
    {"id": "receipts_kept", "name": "Receipts Kept", "icon": "🧾", "rarity": "rare", "reward_xp": 250,
     "description": "Correctly answer 50 historical trivia questions (stats, records, drafts, playoff moments)"},
    {"id": "stat_merchant", "name": "Stat Merchant", "icon": "📊", "rarity": "rare", "reward_xp": 300,
     "description": "Correctly answer 100 stat-based questions with at least 70% accuracy"},
]
ACHIEVEMENTS_BY_ID = {a["id"]: a for a in ACHIEVEMENTS}


def achievement_progress(user: dict, aid: str) -> dict:
    """Returns {progress: 0-1, current, target, met: bool}."""
    c = user.get("counters", {}) or {}
    xp = user.get("lifetime_xp", 0)
    if aid == "elite_ball_knower":
        hard = c.get("hard_correct", 0)
        prog = max(xp / 12000, hard / 250)
        return {"progress": min(prog, 1.0), "current": hard, "target": 250,
                "met": xp >= 12000 or hard >= 250}
    if aid == "certified":
        wins = c.get("match_wins", 0)
        return {"progress": min(wins / 10, 1.0), "current": wins, "target": 10, "met": wins >= 10}
    if aid == "film_merchant":
        n = c.get("film_correct", 0)
        return {"progress": min(n / 100, 1.0), "current": n, "target": 100, "met": n >= 100}
    if aid == "aura_100":
        s = user.get("best_streak", 0)
        return {"progress": min(s / 7, 1.0), "current": s, "target": 7, "met": s >= 7}
    if aid == "nostradamus":
        return {"progress": 0.0, "current": 0, "target": 1, "met": False}
    if aid == "goat":
        return {"progress": min(xp / 50000, 1.0), "current": xp, "target": 50000, "met": xp >= 50000}
    if aid == "receipts_kept":
        n = c.get("history_correct", 0)
        return {"progress": min(n / 50, 1.0), "current": n, "target": 50, "met": n >= 50}
    if aid == "stat_merchant":
        sc, st = c.get("stat_correct", 0), c.get("stat_total", 0)
        acc_ok = st > 0 and (sc / st) >= 0.7
        return {"progress": min(sc / 100, 1.0), "current": sc, "target": 100,
                "met": sc >= 100 and acc_ok}
    return {"progress": 0.0, "current": 0, "target": 1, "met": False}


# ---------- Week key ----------
def current_week_key() -> str:
    iso = datetime.now(timezone.utc).isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


def effective_weekly_xp(user: dict) -> int:
    return user.get("weekly_xp", 0) if user.get("week_key") == current_week_key() else 0


# ---------- Core XP awarding ----------
async def award_xp_batch(db, user_id: str, items: list) -> dict:
    """items: list of (amount:int, source:str, metadata:dict).
    Single read+write; logs one xp_event per item. Returns level/tier delta summary."""
    items = [(a, s, m) for a, s, m in items if a > 0]
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        return {"xp_gained": 0}
    now = datetime.now(timezone.utc)
    wk = current_week_key()
    total_gain = sum(a for a, _, _ in items)

    old_lifetime = user.get("lifetime_xp", 0)
    old_level = user.get("level") or calculate_level_from_xp(old_lifetime)
    old_tier = rank_tier_for_xp(old_lifetime)

    # lazy weekly reset (preserve past week)
    weekly = user.get("weekly_xp", 0)
    history_push = None
    if user.get("week_key") != wk:
        if user.get("week_key") and weekly > 0:
            history_push = {"week_key": user["week_key"], "xp": weekly}
        weekly = 0

    lifetime = old_lifetime + total_gain
    weekly += total_gain
    new_level = calculate_level_from_xp(lifetime)
    new_tier = rank_tier_for_xp(lifetime)

    unlocked_rewards = set(user.get("unlocked_level_rewards", []))
    new_rewards = [r for r in LEVEL_REWARDS if r["level"] <= new_level and r["id"] not in unlocked_rewards]
    for r in new_rewards:
        unlocked_rewards.add(r["id"])

    update = {"$set": {
        "lifetime_xp": lifetime, "weekly_xp": weekly, "week_key": wk,
        "level": new_level, "rank_tier": new_tier["key"],
        "unlocked_level_rewards": sorted(unlocked_rewards, key=lambda rid: next(x["level"] for x in LEVEL_REWARDS if x["id"] == rid) if any(x["id"] == rid for x in LEVEL_REWARDS) else 0),
    }}
    if new_level > old_level:
        update["$set"]["last_level_up_at"] = now
    if history_push:
        update["$push"] = {"weekly_history": history_push}
    await db.users.update_one({"user_id": user_id}, update)

    if items:
        await db.xp_events.insert_many([{
            "id": uuid.uuid4().hex, "user_id": user_id, "amount": a,
            "source": s, "metadata": m or {}, "created_at": now,
        } for a, s, m in items])

    return {
        "xp_gained": total_gain,
        "breakdown": [{"source": s, "amount": a} for a, s, m in items],
        "previous_level": old_level, "level": new_level, "leveled_up": new_level > old_level,
        "new_rewards": new_rewards,
        "previous_tier": old_tier, "tier": new_tier, "tier_changed": new_tier["key"] != old_tier["key"],
        "lifetime_xp": lifetime, "weekly_xp": weekly,
    }


async def check_achievements(db, user_id: str) -> list:
    """Unlock any achievements whose requirements are met. Idempotent (upsert guard).
    Awards achievement XP; runs a second pass since XP can push rank achievements."""
    newly = []
    for _pass in range(2):
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        pass_new = []
        for a in ACHIEVEMENTS:
            if a.get("coming_soon"):
                continue
            prog = achievement_progress(user, a["id"])
            if not prog["met"]:
                continue
            res = await db.user_achievements.update_one(
                {"user_id": user_id, "achievement_id": a["id"]},
                {"$setOnInsert": {
                    "id": uuid.uuid4().hex, "user_id": user_id, "achievement_id": a["id"],
                    "unlocked": True, "unlocked_at": datetime.now(timezone.utc), "reward_claimed": True,
                }},
                upsert=True,
            )
            if res.upserted_id is not None:
                pass_new.append(a)
        if pass_new:
            await award_xp_batch(db, user_id, [
                (a["reward_xp"], "achievement_unlock", {"achievement_id": a["id"]}) for a in pass_new
            ])
            newly.extend(pass_new)
        else:
            break
    return newly


async def process_quiz_answers(db, user: dict, answers: list, fallback_difficulty: str = "medium") -> dict:
    """Handles per-answer XP, streak bonuses, counters, streak persistence,
    then achievement checks. answers: [{correct, difficulty, tags, deep_cut}]."""
    user_id = user["user_id"]
    streak = user.get("current_streak", 0)
    best = user.get("best_streak", 0)
    answer_xp = 0
    streak_items = []
    inc = {}

    for ans in answers:
        correct = bool(ans.get("correct"))
        diff = (ans.get("difficulty") or fallback_difficulty).lower()
        tags = ans.get("tags") or []
        deep = bool(ans.get("deep_cut"))
        if "stats" in tags:
            inc["counters.stat_total"] = inc.get("counters.stat_total", 0) + 1
        if correct:
            answer_xp += XP_DEEP_CUT if deep else XP_CORRECT.get(diff, 15)
            streak += 1
            best = max(best, streak)
            if streak in STREAK_BONUSES:
                streak_items.append((STREAK_BONUSES[streak], "streak_bonus", {"streak": streak}))
            if deep or diff == "hard":
                inc["counters.hard_correct"] = inc.get("counters.hard_correct", 0) + 1
            if "film" in tags:
                inc["counters.film_correct"] = inc.get("counters.film_correct", 0) + 1
            if "history" in tags:
                inc["counters.history_correct"] = inc.get("counters.history_correct", 0) + 1
            if "stats" in tags:
                inc["counters.stat_correct"] = inc.get("counters.stat_correct", 0) + 1
        else:
            streak = 0

    update = {"$set": {"current_streak": streak, "best_streak": best}}
    if inc:
        update["$inc"] = inc
    await db.users.update_one({"user_id": user_id}, update)

    items = []
    if answer_xp:
        items.append((answer_xp, "correct_answer", {"answers": len(answers)}))
    items.extend(streak_items)
    summary = await award_xp_batch(db, user_id, items)
    unlocked = await check_achievements(db, user_id)
    return _finalize_summary(await db.users.find_one({"user_id": user_id}, {"_id": 0}), summary, unlocked)


async def award_match_win(db, user_id: str) -> dict:
    await db.users.update_one({"user_id": user_id}, {"$inc": {"counters.match_wins": 1}})
    summary = await award_xp_batch(db, user_id, [(XP_MATCH_WIN, "match_win", {})])
    unlocked = await check_achievements(db, user_id)
    return _finalize_summary(await db.users.find_one({"user_id": user_id}, {"_id": 0}), summary, unlocked)


def _finalize_summary(user: dict, summary: dict, unlocked: list) -> dict:
    """Merge achievement XP into the summary and attach final progression state."""
    lifetime = user.get("lifetime_xp", 0)
    level = user.get("level", 1)
    ach_xp = sum(a["reward_xp"] for a in unlocked)
    lp = get_xp_to_next_level(level, lifetime)
    tier = rank_tier_for_xp(lifetime)
    return {
        "xp_gained": summary.get("xp_gained", 0) + ach_xp,
        "breakdown": summary.get("breakdown", []) + (
            [{"source": "achievement_unlock", "amount": ach_xp}] if ach_xp else []),
        "previous_level": summary.get("previous_level", level),
        "level": level,
        "leveled_up": level > summary.get("previous_level", level),
        "new_rewards": [r for r in LEVEL_REWARDS
                        if summary.get("previous_level", level) < r["level"] <= level],
        "unlocked_achievements": [{
            "id": a["id"], "name": a["name"], "icon": a["icon"],
            "rarity": a["rarity"], "reward_xp": a["reward_xp"], "description": a["description"],
        } for a in unlocked],
        "tier": {"key": tier["key"], "name": tier["name"], "icon": tier["icon"], "tagline": tier["tagline"]},
        "previous_tier_key": summary.get("previous_tier", tier)["key"],
        "tier_changed": tier["key"] != summary.get("previous_tier", tier)["key"],
        "lifetime_xp": lifetime,
        "weekly_xp": effective_weekly_xp(user),
        "current_streak": user.get("current_streak", 0),
        **lp,
    }


async def progression_payload(db, user: dict) -> dict:
    """Full progression for the profile screen."""
    lifetime = user.get("lifetime_xp", 0)
    level = user.get("level") or calculate_level_from_xp(lifetime)
    lp = get_xp_to_next_level(level, lifetime)
    tier = rank_tier_for_xp(lifetime)
    nxt = next_rank_tier(tier)
    tier_span = ((nxt["min_xp"] - tier["min_xp"]) if nxt else 1) or 1
    unlocked_docs = await db.user_achievements.find(
        {"user_id": user["user_id"]}, {"_id": 0}).to_list(50)
    unlocked_map = {d["achievement_id"]: d for d in unlocked_docs}
    total_ans = user.get("total_answers", 0)
    correct_ans = user.get("correct_answers", 0)
    rewards_unlocked = set(user.get("unlocked_level_rewards", []))
    return {
        "level": level,
        "lifetime_xp": lifetime,
        "weekly_xp": effective_weekly_xp(user),
        **lp,
        "tier": {"key": tier["key"], "name": tier["name"], "icon": tier["icon"], "tagline": tier["tagline"],
                 "min_xp": tier["min_xp"], "max_xp": tier["max_xp"]},
        "next_tier": ({"key": nxt["key"], "name": nxt["name"], "icon": nxt["icon"], "min_xp": nxt["min_xp"]}
                      if nxt else None),
        "tier_progress": min((lifetime - tier["min_xp"]) / tier_span, 1.0) if nxt else 1.0,
        "accuracy": round((correct_ans / total_ans) * 100) if total_ans else 0,
        "total_answers": total_ans,
        "correct_answers": correct_ans,
        "current_streak": user.get("current_streak", 0),
        "best_streak": user.get("best_streak", 0),
        "level_rewards": [{**r, "unlocked": r["id"] in rewards_unlocked} for r in LEVEL_REWARDS],
        "achievements": [{
            "id": a["id"], "name": a["name"], "icon": a["icon"], "description": a["description"],
            "rarity": a["rarity"], "reward_xp": a["reward_xp"],
            "coming_soon": bool(a.get("coming_soon")),
            "unlocked": a["id"] in unlocked_map,
            "unlocked_at": (unlocked_map[a["id"]]["unlocked_at"].isoformat()
                            if a["id"] in unlocked_map and unlocked_map[a["id"]].get("unlocked_at") else None),
            **{k: v for k, v in achievement_progress(user, a["id"]).items() if k != "met"},
        } for a in ACHIEVEMENTS],
    }


# ---------- Seed data ----------
SEED_USERS = [
    {"user_id": "seed_benchmob", "username": "BenchMobBarry", "name": "Bench Mob Barry",
     "lifetime_xp": 350, "weekly_xp": 120, "correct_answers": 28, "total_answers": 45,
     "best_streak": 4, "current_streak": 1, "counters": {"hard_correct": 3, "match_wins": 1}},
    {"user_id": "seed_boxscore", "username": "BoxScoreBecky", "name": "Box Score Becky",
     "lifetime_xp": 1400, "weekly_xp": 260, "correct_answers": 96, "total_answers": 140,
     "best_streak": 6, "current_streak": 0, "counters": {"hard_correct": 12, "match_wins": 3}},
    {"user_id": "seed_rotation", "username": "RotationRandy", "name": "Rotation Randy",
     "lifetime_xp": 3200, "weekly_xp": 410, "correct_answers": 210, "total_answers": 280,
     "best_streak": 8, "current_streak": 2, "counters": {"hard_correct": 34, "film_correct": 22, "match_wins": 5}},
    {"user_id": "seed_filmroom", "username": "FilmRoomFelix", "name": "Film Room Felix",
     "lifetime_xp": 8500, "weekly_xp": 750, "correct_answers": 480, "total_answers": 590,
     "best_streak": 11, "current_streak": 4, "counters": {"hard_correct": 90, "film_correct": 120, "history_correct": 40, "match_wins": 9}},
    {"user_id": "seed_archive", "username": "ArchiveAndre", "name": "Archive Andre",
     "lifetime_xp": 15000, "weekly_xp": 980, "correct_answers": 840, "total_answers": 990,
     "best_streak": 14, "current_streak": 6, "counters": {"hard_correct": 180, "film_correct": 60, "history_correct": 75, "stat_correct": 88, "stat_total": 110, "match_wins": 14}},
    {"user_id": "seed_goated", "username": "GoatedGreg", "name": "Goated Greg",
     "lifetime_xp": 52000, "weekly_xp": 1500, "correct_answers": 2600, "total_answers": 2900,
     "best_streak": 21, "current_streak": 9, "counters": {"hard_correct": 400, "film_correct": 180, "history_correct": 160, "stat_correct": 150, "stat_total": 180, "match_wins": 32}},
]


async def seed_sample_users(db):
    """Idempotent seed of demo users so leaderboards are visually testable."""
    now = datetime.now(timezone.utc)
    wk = current_week_key()
    if await db.users.count_documents({"is_seed": True}) == 0:
        for s in SEED_USERS:
            level = calculate_level_from_xp(s["lifetime_xp"])
            tier = rank_tier_for_xp(s["lifetime_xp"])
            await db.users.insert_one({
                **s,
                "is_seed": True,
                "email": f"{s['username'].lower()}@seed.deepcut",
                "picture": None, "avatar": None, "tagline": tier["tagline"],
                "level": level, "rank_tier": tier["key"], "week_key": wk,
                "weekly_history": [],
                "unlocked_level_rewards": [r["id"] for r in LEVEL_REWARDS if r["level"] <= level],
                "total_score": s["lifetime_xp"] * 3, "matches": s["counters"].get("match_wins", 0) * 2,
                "sport_scores": {}, "best_sport": None,
                "created_at": now,
            })
        # unlock achievements the seeds have legitimately met
        for s in SEED_USERS:
            u = await db.users.find_one({"user_id": s["user_id"]}, {"_id": 0})
            for a in ACHIEVEMENTS:
                if a.get("coming_soon"):
                    continue
                if achievement_progress(u, a["id"])["met"]:
                    await db.user_achievements.update_one(
                        {"user_id": s["user_id"], "achievement_id": a["id"]},
                        {"$setOnInsert": {"id": uuid.uuid4().hex, "user_id": s["user_id"],
                                          "achievement_id": a["id"], "unlocked": True,
                                          "unlocked_at": now, "reward_claimed": True}},
                        upsert=True,
                    )
    # keep seed users on the current week so the weekly board always has demo rows
    await db.users.update_many({"is_seed": True}, {"$set": {"week_key": wk}})
