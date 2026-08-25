# DeepCut Sports Question Bank Seed v1

This seed turns Question Bank v2 from infrastructure into a concrete content program.

## Master target

The campaign manifest in `backend/data/question_campaigns_5000.json` defines exactly 5,000 draft-generation targets:

| Sport | Target |
|---|---:|
| Basketball | 900 |
| NFL | 850 |
| Baseball | 700 |
| Hockey | 650 |
| Soccer | 650 |
| Sports video games | 750 |
| Golf | 500 |
| **Total** | **5,000** |

Each sport is subdivided into DeepCut-style topics such as role players, forgotten playoff moments, transactions, draft history, coaches/front offices, records, arenas/franchise history, and sports-game culture.

## Pilot content

`backend/data/question_seed_pilot_56.json` contains 56 initial draft questions, exactly eight per sport.

These questions are intentionally **not approved automatically**. The seed loader imports them through the Question Bank v2 enhanced-document path, which leaves them as:

- `status: draft`
- `verification_status: needs_review`
- attached to deterministic sport campaign IDs such as `qcamp_seed_basketball_v1`
- equipped with source/verification targets and factual-confidence values

They therefore cannot enter approved gameplay until an admin verifies and approves them in `/admin/questions`.

## Validate locally

From the repository root:

```bash
python backend/seed_question_bank_v1.py
```

This performs no database writes. It validates:

- all 56 seed rows through the Question Bank v2 schema
- normalized-question uniqueness inside the seed
- sport counts
- campaign schema validity
- exact 5,000-question master total

CI runs the same validation.

## Import into MongoDB

With `MONGO_URL` and `DB_NAME` configured in `backend/.env`:

```bash
python backend/seed_question_bank_v1.py --apply
```

The apply mode is designed to be rerunnable:

- master campaign documents use deterministic IDs
- existing campaign documents are not reset
- normalized duplicate questions are skipped by the existing Question Bank v2 import path
- imported pilot questions stay draft / needs-review

After import, open `/admin/questions` to review the pilot and use each campaign's `Generate Next 25` action to grow toward the 5,000-question target.

## Content policy for the bank

Generation is not approval. AI-created or bundled draft trivia must remain outside gameplay until a reviewer checks the fact against the named verification target and marks the question verified. The point of the seed is to create a repeatable editorial conveyor belt, not an unchecked trivia firehose.
