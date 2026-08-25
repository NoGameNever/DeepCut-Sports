# DeepCut Sports: Adalo Replacement Plan

## Goal

Make the existing Expo/React Native frontend the primary DeepCut Sports client and remove Adalo from the production path without replacing the FastAPI, MongoDB Atlas, Render, question-bank, profile, progression, friends, or lobby work that already exists.

Target production path:

```text
Expo / React Native
        |
        | HTTPS (and later WebSocket)
        v
FastAPI
        |
        v
MongoDB Atlas
```

The client must never connect directly to MongoDB.

## Current state

The repository already contains:

- Expo SDK 54 + React Native + TypeScript frontend
- Expo Router routes for login, tabs, profile, lobby, join, quiz, and results
- A centralized API client
- FastAPI backend
- MongoDB-backed users, sessions, profiles, friends, lobbies, progression, leaderboards, and questions
- Render deployment configuration
- Approved question-bank pipeline

This means the migration is an extraction from Adalo rather than a greenfield rewrite.

## Important security migration

The legacy single-player quiz flow returns `correct_index` to the Expo client and lets the client calculate and submit its own score. That is acceptable only as prototype behavior.

The replacement architecture uses server-authoritative quiz sessions:

1. `POST /api/v2/quiz/start`
2. Server selects and stores the complete question set and answer keys.
3. Client receives only the current public question.
4. `POST /api/v2/quiz/{session_id}/answer`
5. Server evaluates the answer, updates score, and returns the result plus the next public question.
6. On the final answer, the server records user stats and progression.

The legacy endpoints remain temporarily available so the existing UI is not broken while `quiz.tsx` is migrated.

## Migration phases

### Phase 1: Foundation

Status: in progress on `feature/adalo-replacement-foundation`.

- [x] Confirm Expo frontend already exists and is routable.
- [x] Confirm API client already covers auth, profile, friends, lobbies, quiz, leaderboard, and progression.
- [x] Add typed server-authoritative quiz session API.
- [x] Add Expo API client methods for v2 quiz sessions.
- [x] Add automatic TTL cleanup for quiz sessions.
- [ ] Switch single-player `quiz.tsx` from legacy generate/submit to v2 start/answer.
- [ ] Add backend tests for quiz session start, answer, completion, auth isolation, and expiration.
- [ ] Add frontend tests for answer state and retry behavior.

### Phase 2: Authentication independence

The current authentication flow relies on the Emergent session service. This is a remaining external dependency and should be replaced before Adalo/Emergent are considered fully removed.

Preferred direction:

- Email/password or magic-link auth managed by DeepCut backend or a dedicated auth provider.
- Apple and Google sign-in can be added after the base auth contract is stable.
- Keep the FastAPI bearer-token contract so the rest of the frontend does not need another rewrite.

### Phase 3: Single-player cutover

Definition of done:

- Login -> Home -> Game setup -> Quiz -> Results works entirely in Expo.
- Correct answers are never exposed before submission.
- Final score is generated server-side.
- XP, achievements, ranks, totals, and leaderboards update from the server result.
- Retry and expired-session states are handled cleanly.

### Phase 4: Multiplayer hardening

The current lobby implementation can remain available during the first cutover, but competitive multiplayer should ultimately become server-authoritative as well.

Required work:

- Replace client-submitted lobby scores with per-answer server evaluation.
- Introduce a game-session record separate from lobby configuration.
- Move live progress from 3-second polling to WebSockets after the state model is stable.
- Add reconnect/resume behavior.
- Add idempotency for answer submission and game completion.
- Lock question sets and game settings when the match starts.

### Phase 5: Native product features

- Deep-link invites
- Push notifications
- Share-sheet invitations
- Analytics and crash reporting
- App Store / Play Store builds
- Production environment configuration
- Account deletion and privacy controls

### Phase 6: Adalo shutdown

Adalo can be retired after all of the following are true:

- No production user flow requires an Adalo screen.
- No backend endpoint is called only by Adalo.
- No user/account data exists only inside Adalo.
- Authentication no longer depends on the Emergent prototype service.
- Expo production builds pass smoke testing on iOS, Android, and web.

## Data ownership rule

MongoDB is the source of truth. Expo is a presentation client, not a trusted game engine.

The server owns:

- Question selection
- Correct answers
- Scoring
- Match state
- XP
- Achievements
- Rank progression
- Lobby membership
- Competitive results

The client owns:

- Rendering
- Navigation
- Local animations and haptics
- Temporary UI state
- Secure storage of its session token

## Immediate next implementation step

Refactor `frontend/app/quiz.tsx` to use `startQuizSession()` and `answerQuizSession()` for single-player matches while leaving the current lobby flow untouched. This provides a low-risk path to production behavior without rewriting multiplayer in the same change.
