# OpenAI Question Generation Pipeline

This repo now supports an admin-only pipeline that generates structured sports-trivia drafts with OpenAI and stores them in MongoDB Atlas.

## Flow

1. An authenticated admin calls `POST /api/admin/questions/generate-drafts`.
2. The backend calls the OpenAI Responses API using a strict JSON schema.
3. Pydantic validates the returned question batch.
4. The existing question-bank importer creates IDs, normalizes question text, and checks the unique `normalized_hash` index.
5. Questions are stored in MongoDB with `status: draft`.
6. An admin verifies the fact and source, then changes the status to `approved`.
7. Gameplay continues to load only approved questions.

## Environment variables

Configure these in `backend/.env` for local development and in Render/Railway for production:

```env
MONGO_URL=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/?retryWrites=true&w=majority
DB_NAME=deepcut_sports
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-5.6-luna
ADMIN_EMAILS=your-login-email@example.com
ADMIN_USER_IDS=
APP_BASE_URL=http://localhost:8081
CORS_ORIGINS=http://localhost:8081,http://localhost:3000
```

Never put `OPENAI_API_KEY` or `MONGO_URL` in the Expo frontend environment.

## Install and run locally

From PowerShell:

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

The health endpoint is:

```text
http://localhost:8000/api/health
```

## Generate drafts

Use a session token belonging to an email listed in `ADMIN_EMAILS`.

```powershell
$Backend = "http://localhost:8000"
$Token = "PASTE_ADMIN_SESSION_TOKEN"

$Body = @{
    sport = "basketball"
    difficulty = "deepcut"
    count = 10
    subcategory = "bench legends"
    tags = @("nba", "playoffs")
} | ConvertTo-Json

Invoke-RestMethod `
    -Method Post `
    -Uri "$Backend/api/admin/questions/generate-drafts" `
    -Headers @{ Authorization = "Bearer $Token" } `
    -ContentType "application/json" `
    -Body $Body
```

## Review drafts

```powershell
$Drafts = Invoke-RestMethod `
    -Method Get `
    -Uri "$Backend/api/admin/questions?status=draft&limit=100" `
    -Headers @{ Authorization = "Bearer $Token" }

$Drafts | Format-Table id, sport, subcategory, question, source
```

## Approve or reject

```powershell
$QuestionId = "PASTE_QUESTION_ID"

Invoke-RestMethod `
    -Method Post `
    -Uri "$Backend/api/admin/questions/$QuestionId/status" `
    -Headers @{ Authorization = "Bearer $Token" } `
    -ContentType "application/json" `
    -Body '{"status":"approved"}'
```

Replace `approved` with `rejected`, `draft`, or `archived` when needed.

## Files changed

- `backend/requirements.txt`: adds the official OpenAI Python SDK.
- `backend/.env.example`: adds OpenAI configuration.
- `backend/server.py`: creates one reusable `AsyncOpenAI` client.
- `backend/question_bank.py`: adds strict structured generation and a status endpoint.
- `render.yaml`: adds Render environment variables.
- `DEPLOYMENT.md`: documents generation and approval.

## Git commands

```powershell
git checkout -b feature/openai-question-generator
git add backend/requirements.txt backend/.env.example backend/server.py backend/question_bank.py render.yaml DEPLOYMENT.md OPENAI_QUESTION_PIPELINE.md
git commit -m "Add OpenAI-backed question draft pipeline"
git push -u origin feature/openai-question-generator
```

Open a pull request from `feature/openai-question-generator` into your main branch after testing.

## Important limitation

Structured output guarantees the JSON shape, not factual correctness. Keep generated content in `draft` until the answer and source have been checked.
