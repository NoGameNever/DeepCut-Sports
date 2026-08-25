# DeepCut Sports Question Bank v2

Question Bank v2 turns the existing draft/import system into a curated content pipeline with campaign generation, verification metadata, review queues, gameplay quality telemetry, and player reports.

## Admin UI

Authenticated admins can open the Expo Router route:

```text
/admin/questions
```

Admin access still uses `ADMIN_EMAILS` / `ADMIN_USER_IDS` on the backend. The screen will show an access-denied state for non-admin accounts.

The dashboard provides:

- bank totals by status
- draft / flagged / approved / rejected / archived queues
- question/source editing
- verification and approval controls
- answer count and observed correct rate
- player report counts
- campaign creation and progress
- generation in 25-question batches
- legacy metadata backfill

## Question metadata

New Question Bank v2 drafts include the existing fields plus:

- `era`
- `league`
- `season`
- `teams[]`
- `players[]`
- `source_url`
- `factual_confidence` (0-1)
- `verification_status` (`unverified`, `needs_review`, `verified`)
- `reviewed_by`
- `verified_at`
- `last_reviewed_at`
- `answer_count`
- `correct_count`
- `report_count`
- `retired_reason`
- `campaign_id`

AI-generated content always enters as `status=draft` and `verification_status=needs_review`.

A question cannot be approved through the v2 review endpoint until it is marked `verified` and has a concrete verification source. `needs_manual_verification` is intentionally not sufficient for approval.

## Bulk campaigns

Create a simple campaign:

```json
POST /api/admin/v2/question-campaigns
{
  "name": "NBA Deep Cuts",
  "sport": "basketball",
  "target_count": 500,
  "difficulty": "deepcut",
  "subcategory": "bench legends",
  "tags": ["nba", "bulk_campaign"]
}
```

Or create a campaign with a planned content mix:

```json
POST /api/admin/v2/question-campaigns
{
  "name": "NBA 1995-2005 Deep Cuts",
  "sport": "basketball",
  "slices": [
    {"name":"Bench / role players","count":100,"difficulty":"deepcut","subcategory":"role players","era":"1995-2005"},
    {"name":"Playoff moments","count":75,"difficulty":"hard","subcategory":"playoffs","era":"1995-2005"},
    {"name":"Transactions","count":75,"difficulty":"deepcut","subcategory":"transactions","era":"1995-2005"},
    {"name":"Stats / records","count":75,"difficulty":"hard","subcategory":"records","era":"1995-2005"},
    {"name":"Draft history","count":50,"difficulty":"deepcut","subcategory":"draft","era":"1995-2005"},
    {"name":"Coaches / front offices","count":50,"difficulty":"deepcut","subcategory":"coaches and front offices","era":"1995-2005"},
    {"name":"Jerseys / arenas / teams","count":40,"difficulty":"deepcut","subcategory":"team history","era":"1995-2005"},
    {"name":"Video games / culture","count":35,"difficulty":"deepcut","subcategory":"video games and culture","era":"1995-2005"}
  ]
}
```

Generate the next safe-sized batch:

```json
POST /api/admin/v2/question-campaigns/{campaign_id}/generate-next
{
  "batch_size": 25
}
```

A single OpenAI call is capped at 50 questions. Large campaigns advance slice by slice and preserve generated/imported/duplicate/rejected counts.

## Suggested first 5,000

| Category | Target |
| --- | ---: |
| Basketball | 900 |
| Football | 850 |
| Baseball | 700 |
| Hockey | 650 |
| Soccer | 650 |
| Sports video games | 750 |
| Golf | 500 |
| **Total** | **5,000** |

Suggested difficulty mix across the full bank:

- Easy: 10%
- Medium: 25%
- Hard: 35%
- Deepcut: 30%

Use campaign slices to make each sport diverse rather than generating thousands of near-identical stat questions.

## Review API

```text
GET    /api/admin/v2/questions/summary
GET    /api/admin/v2/questions
PATCH  /api/admin/v2/questions/{question_id}
POST   /api/admin/v2/questions/{question_id}/review
POST   /api/admin/v2/questions/backfill-metadata
```

Useful list filters include `status`, `sport`, `difficulty`, `verification`, `campaign_id`, `q`, `limit`, and `skip`.

## Quality telemetry

The server-authoritative single-player flow increments `answer_count` and `correct_count` for each served question after a successful answer write. This avoids counting duplicated submissions.

Players can report a bad question once per account:

```json
POST /api/questions/{question_id}/report
{
  "reason": "wrong answer",
  "details": "Official box score lists a different player."
}
```

After three unique reports, an approved question is automatically moved to `flagged` and `verification_status=needs_review`, removing it from the approved gameplay pool until an admin reviews it.

## Legacy questions

Existing bank records remain valid. The admin dashboard can call the backfill endpoint to add safe defaults for v2 metadata without altering question text or answers.

Run a dry check first:

```json
POST /api/admin/v2/questions/backfill-metadata
{"dry_run": true}
```

Then apply:

```json
POST /api/admin/v2/questions/backfill-metadata
{"dry_run": false}
```

## Important quality rule

Structured model output guarantees shape, not truth. Generation is deliberately separated from approval. A 5,000-question bank is useful only if the questions survive review, sourcing, deduplication, gameplay telemetry, and player feedback.
