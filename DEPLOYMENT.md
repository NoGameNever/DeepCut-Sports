# DeepCut Sports Web Deployment

This repo has two deployable pieces:

- `backend/`: FastAPI API backed by MongoDB Atlas
- `frontend/`: Expo web app that calls the API through `EXPO_PUBLIC_BACKEND_URL`

## 1. Production services you need

- MongoDB Atlas cluster
- A backend host such as Render, Railway, Fly.io, or AWS
- A static web host such as Render Static Sites, Vercel, Netlify, Cloudflare Pages, or EAS Hosting
- Your Emergent auth/LLM key if you want admin AI draft generation

## 2. Backend environment variables

Set these on your backend host, never commit real values:

```env
MONGO_URL=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/?retryWrites=true&w=majority
DB_NAME=deepcut_sports
EMERGENT_LLM_KEY=your-emergent-key
APP_BASE_URL=https://your-web-domain.com
ADMIN_EMAILS=you@example.com,teammate@example.com
ADMIN_USER_IDS=
```

`ADMIN_EMAILS` and `ADMIN_USER_IDS` control access to `/api/admin/*` question-bank routes.

## 3. Backend deploy

### Render blueprint

Use the included `render.yaml` from the repo root. It defines:

- `deepcut-sports-api`: Dockerized FastAPI service from `backend/`
- `deepcut-sports-web`: static Expo web build from `frontend/`

After creating the Render Blueprint, fill every `sync: false` environment variable in the Render dashboard.

### Manual backend settings

If deploying manually:

- Root directory: `backend`
- Build: Dockerfile, or `pip install -r requirements.txt`
- Start command if not using Docker:

```bash
uvicorn server:app --host 0.0.0.0 --port $PORT
```

Health check path:

```text
/api/
```

## 4. Frontend environment variable

Set this on the frontend/static host before building:

```env
EXPO_PUBLIC_BACKEND_URL=https://your-api-domain.com
```

Do not include a trailing slash.

## 5. Frontend deploy

### Vercel

Use these settings:

- Root directory: `frontend`
- Build command: `yarn build:web`
- Output directory: `dist`
- Environment variable: `EXPO_PUBLIC_BACKEND_URL=https://your-api-domain.com`

The included `frontend/vercel.json` adds SPA rewrites so Expo Router paths load correctly.

### Render Static Site

The included `render.yaml` uses:

```bash
yarn install --frozen-lockfile && yarn build:web
```

and publishes:

```text
dist
```

## 6. Seed questions before launch

Gameplay only serves approved question-bank rows. Import questions as an admin before opening the site to users.

JSON import endpoint:

```text
POST /api/admin/questions/import
Authorization: Bearer <session_token>
Content-Type: application/json
```

Example body:

```json
{
  "default_status": "approved",
  "questions": [
    {
      "sport": "basketball",
      "subcategory": "history",
      "difficulty": "medium",
      "question": "Who won the 2016 NBA Finals MVP?",
      "correct_answer": "LeBron James",
      "incorrect_answers": ["Stephen Curry", "Kyrie Irving", "Draymond Green"],
      "explanation": "LeBron James won Finals MVP after Cleveland beat Golden State.",
      "tags": ["history", "nba"],
      "source": "manual",
      "status": "approved"
    }
  ]
}
```

CSV or JSON file import endpoint:

```text
POST /api/admin/questions/import-file?status=draft
Authorization: Bearer <session_token>
Content-Type: multipart/form-data
```

Question statuses:

- `draft`: stored but hidden from gameplay
- `approved`: visible to gameplay
- `rejected`: stored but hidden
- `archived`: stored but hidden

## 7. Smoke test checklist

After deploy:

1. Open `https://your-api-domain.com/api/` and confirm it returns the API message.
2. Open the web app URL on mobile Safari/Chrome.
3. Sign in.
4. Import at least 30 approved questions across your launch categories.
5. Start a quick play match and confirm questions load.
6. Create a lobby with another account and confirm both players receive the same question set.
