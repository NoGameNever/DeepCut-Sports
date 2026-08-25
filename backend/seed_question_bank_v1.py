import argparse
import asyncio
import json
import os
import sys
from collections import defaultdict
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

sys.path.insert(0, str(Path(__file__).resolve().parent))
import question_bank_v2 as qb2

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
QUESTIONS_FILE = DATA_DIR / "question_seed_pilot_56.json"
CAMPAIGNS_FILE = DATA_DIR / "question_campaigns_5000.json"


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def validate_questions(rows: list[dict]) -> dict:
    by_sport = defaultdict(int)
    normalized = set()
    for row in rows:
        doc = qb2._enhanced_doc(row, campaign_id=f"qcamp_seed_{row['sport']}_v1")
        key = doc["normalized_hash"]
        if key in normalized:
            raise ValueError(f"Duplicate normalized question in seed: {row['question']}")
        normalized.add(key)
        by_sport[doc["sport"]] += 1
    return {"total": len(rows), "by_sport": dict(sorted(by_sport.items()))}


def validate_campaigns(rows: list[dict]) -> dict:
    totals = {}
    grand_total = 0
    for row in rows:
        body = qb2.CampaignCreate(**row)
        slices = qb2._campaign_slices(body)
        total = sum(int(item["count"]) for item in slices)
        totals[body.sport] = total
        grand_total += total
    if grand_total != 5000:
        raise ValueError(f"Campaign manifest must total 5000, got {grand_total}")
    return {"total": grand_total, "by_sport": totals}


async def apply_seed(rows: list[dict], campaigns: list[dict]) -> None:
    load_dotenv(ROOT / ".env")
    mongo_url = os.environ.get("MONGO_URL", "").strip()
    db_name = os.environ.get("DB_NAME", "").strip()
    if not mongo_url or not db_name:
        raise RuntimeError("MONGO_URL and DB_NAME are required for --apply")

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    try:
        await qb2.ensure_indexes(db)
        for raw in campaigns:
            body = qb2.CampaignCreate(**raw)
            sport = body.sport.strip().lower()
            campaign_id = f"qcamp_seed_{sport}_v1"
            slices = qb2._campaign_slices(body)
            now = qb2.utcnow()
            await db.question_campaigns.update_one(
                {"id": campaign_id},
                {"$setOnInsert": {
                    "id": campaign_id,
                    "name": body.name.strip(),
                    "sport": sport,
                    "target_count": sum(int(item["count"]) for item in slices),
                    "generated_count": 0,
                    "imported_count": 0,
                    "duplicate_count": 0,
                    "rejected_count": 0,
                    "status": "active",
                    "slices": slices,
                    "created_by": "seed_question_bank_v1",
                    "created_at": now,
                    "updated_at": now,
                }},
                upsert=True,
            )

        grouped = defaultdict(list)
        for row in rows:
            grouped[row["sport"]].append(row)
        results = {}
        for sport, sport_rows in grouped.items():
            campaign_id = f"qcamp_seed_{sport}_v1"
            result = await qb2.import_enhanced_rows(db, sport_rows, campaign_id=campaign_id)
            results[sport] = result
            await db.question_campaigns.update_one(
                {"id": campaign_id},
                {"$inc": {
                    "imported_count": result["imported"],
                    "duplicate_count": result["duplicates"],
                    "rejected_count": len(result["rejected"]),
                }, "$set": {"updated_at": qb2.utcnow()}},
            )
        print(json.dumps({"applied": True, "results": results}, indent=2, default=str))
    finally:
        client.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate or import the DeepCut Sports Question Bank v1 seed.")
    parser.add_argument("--apply", action="store_true", help="Import campaigns and draft questions into MongoDB.")
    args = parser.parse_args()

    questions = load_json(QUESTIONS_FILE)
    campaigns = load_json(CAMPAIGNS_FILE)
    report = {
        "questions": validate_questions(questions),
        "campaigns": validate_campaigns(campaigns),
        "apply": args.apply,
    }
    print(json.dumps(report, indent=2))
    if args.apply:
        asyncio.run(apply_seed(questions, campaigns))


if __name__ == "__main__":
    main()
