# Adalo Question Generator Setup

DeepCut Sports exposes an admin-only FastAPI endpoint that asks OpenAI for structured trivia questions, validates them, and inserts them into MongoDB Atlas as drafts.

## 1. Configure Render

In `Render -> deepcut-api -> Environment`, set:

```env
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-5.6-luna
ADALO_API_KEY=generate-a-long-random-secret
MONGO_URL=your-mongodb-atlas-connection-string
DB_NAME=deepcut_sports
```

Generate `ADALO_API_KEY` independently. Never place `OPENAI_API_KEY` or `MONGO_URL` in Adalo.

## 2. Create the Adalo Custom Action

Use these settings:

| Setting | Value |
| --- | --- |
| Name | Generate Question Drafts |
| Method | POST |
| URL | `https://YOUR-RENDER-DOMAIN/api/admin/questions/generate-drafts` |
| Header | `Content-Type: application/json` |
| Header | `X-API-Key: YOUR_ADALO_API_KEY` |

JSON body:

```json
{
  "sport": "{sport}",
  "difficulty": "{difficulty}",
  "count": 10,
  "subcategory": "{subcategory}",
  "tags": ["adalo"]
}
```

Supported sports are `basketball`, `soccer`, `nfl`, `hockey`, `golf`, `videogames`, `baseball`, and `general`.

Supported difficulty values are `easy`, `medium`, `hard`, and `deepcut`.

`count` is restricted to 1-50.

## 3. Capture response outputs

Map these output fields in Adalo:

| Output | Type | Purpose |
| --- | --- | --- |
| `generated` | Number | Questions returned by OpenAI |
| `imported` | Number | Rows accepted by the MongoDB importer |
| `rejected_count` | Number | Rows rejected by validation |
| `status` | Text | Always `draft` for generated questions |
| `message` | Text | User-facing result |
| `model` | Text | OpenAI model used |

Generated questions never go live automatically. Review them with `GET /api/admin/questions?status=draft`, then approve each verified question with `POST /api/admin/questions/{question_id}/status`.

The Adalo key works only on the generation endpoint. The review and approval endpoints require the existing Bearer admin session.

## Security boundary

This shared-key action is intended for a separate internal/admin-only Adalo app or screen. A key embedded in a public client app can be extracted. For a public production admin interface, use the existing Bearer session authentication and admin allowlist instead.
