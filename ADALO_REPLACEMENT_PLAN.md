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

The legacy quiz endpoints remain temporarily available during migration, but the Expo single-player screen now uses the v2 flow.

## Migration phases

### Phase 1: Foundation

Status: implementation complete on `feature/adalo-replacement-foundation`; runtime smoke test still required before merge.

- [x] Confirm Expo frontend already exists and is routable.
- [x] Confirm API client already covers auth, profile, friends, lobbies, quiz, leaderboard, and progression.
- [x] Add typed server-authoritative quiz session API.
- [x] Add Expo API client methods for v2 quiz sessions.
- [x] Add automatic TTL cleanup for quiz sessions.
- [x] Switch single-player `quiz.tsx` from legacy generate/submit to v2 start/answer.
- [x] Prevent Results from resubmitting an already-finalized v2 game.
- [x] Add duplicate-answer protection to the v2 API.
- [ ] Add backend tests for quiz session start, answer, completion, auth isolation, and expiration.
- [ ] Add frontend tests for answer state and retry behavior.
- [ ] Run Expo + backend runtime smoke test.

### Phase 2: Authentication independence

Status: first-party credential path implemented; production account-recovery work remains.

- [x] Add DeepCut email/password registration and login in FastAPI.
- [x] Reuse the existing bearer-token/session contract so downstream APIs do not require another rewrite.
- [x] Replace the main Expo AuthContext and login screen with native DeepCut credentials.
- [x] Preserve lobby invite return routing across authentication.
- [x] Add an authenticated legacy-account `set-password` migration endpoint.
- [x] Keep the legacy Emergent session endpoint only as a temporary migration bridge.
- [ ] Add password reset/recovery.
- [ ] Add email verification.
- [ ] Add a legacy-account migration UI if existing users need preservation.
- [ ] Remove the Emergent auth bridge after migration confidence is established.

Apple and Google sign-in can be added later without changing the bearer-token contract.

### Phase 3: Single-player cutover

Code path status: implemented; runtime validation remains.

Definition of done:

- [x] Login -> Home -> Game setup -> Quiz -> Results is represented entirely in Expo/FastAPI code.
- [x] Correct answers are not exposed before submission in the v2 single-player flow.
- [x] Final single-player score is generated server-side.
- [x] XP, achievements and aggregate player stats are finalized from the server result.
- [x] Expired quiz sessions are rejected server-side.
- [x] Duplicate answer submissions are rejected server-side.
- [ ] Complete device/web smoke testing and fix runtime-specific issues.

### Phase 4: Multiplayer hardening

The current lobby implementation remains available during the first cutover, but competitive multiplayer should ultimately become server-authoritative as well.

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

Run the branch as a real application and smoke-test registration, login, one complete single-player game, replay, logout/login persistence, expiration/retry behavior, and lobby invite return routing. After that, add automated coverage and begin the server-authoritative multiplayer session model.
