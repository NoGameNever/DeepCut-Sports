# Password Reset Email Setup

DeepCut now supports a complete email password-reset flow for both the regular sign-in screen and the closed-alpha sign-in screen.

## What is included

- `POST /api/auth/password-reset/request`
- `POST /api/auth/password-reset/confirm`
- `/forgot-password` Expo Router screen
- `/reset-password?token=...` Expo Router screen
- Resend transactional-email delivery
- 30-minute, single-use reset tokens
- SHA-256 token hashes in MongoDB. Raw reset tokens are never stored.
- One request per normalized email per minute
- Neutral request responses so the endpoint does not reveal whether an account exists
- Revocation of all existing sessions after a successful reset

## 1. Configure Resend

1. Create a Resend account.
2. Add and verify a domain or transactional-email subdomain you own.
3. Create an API key for sending email.
4. Choose a sender address on the verified domain, for example:

   `DeepCut Sports <accounts@account.deepcutsports.com>`

Resend domain setup: <https://resend.com/docs/dashboard/domains/introduction>

## 2. Add Render environment variables

Add these variables to the backend service:

```env
RESEND_API_KEY=re_your_key_here
EMAIL_FROM=DeepCut Sports <accounts@account.deepcutsports.com>
APP_BASE_URL=https://your-deepcut-web-app.example
```

The backend automatically builds reset links as:

```text
APP_BASE_URL/reset-password?token=...
```

Use `PASSWORD_RESET_URL` only when that route lives somewhere else:

```env
PASSWORD_RESET_URL=https://your-deepcut-web-app.example/reset-password
```

Do not put the Resend API key in the frontend environment or commit it to GitHub.

## 3. Deploy both services

The backend deployment must contain the two public reset endpoints. The frontend deployment must contain the two Expo Router pages. The existing Vercel rewrite already sends `/reset-password` to the Expo web app.

## 4. Smoke test

1. Open the closed-alpha sign-in page.
2. Switch to **Sign In** and select **Forgot password?**
3. Submit an existing test-user email.
4. Confirm the email arrives and opens `/reset-password?token=...`.
5. Set a new password.
6. Confirm the old password fails, the new password works, and an older logged-in session is rejected.
7. Open the same reset link again and confirm it is rejected as expired or already used.

## Operational notes

- Requesting a new link invalidates all older reset links for that account.
- MongoDB TTL indexes remove expired reset tokens and request-throttle records automatically.
- Delivery failures are logged server-side without exposing account existence or raw tokens to the client.
- When email delivery variables are missing, the request endpoint returns HTTP 503 instead of silently pretending a message was sent.
