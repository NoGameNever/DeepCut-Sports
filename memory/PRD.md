# DeepCut Sports — PRD

## Original Problem Statement
Build a mobile app: sports trivia app. Evolved: AI questions, timed quiz, Google login, global leaderboard, difficulty + era + timer scoring multipliers, StatHead street-art rebrand, and a multiplayer friends lobby with native share-sheet invites (no SMS provider).

## Architecture
- Frontend: Expo Router (SDK 54), reanimated, @gorhom/bottom-sheet, expo-image, expo-linear-gradient, expo-haptics, expo-clipboard, RN Share. Fonts: Permanent Marker (brush logo/headers), Rubik Spray Paint (tag section headers), Barlow Condensed (numbers), IBM Plex Sans (body).
- Backend: FastAPI + Motor (MongoDB). LLM via emergentintegrations (gemini-3-flash-preview), EMERGENT_LLM_KEY.
- Auth: Emergent Google OAuth, Bearer session tokens.
- Brand: DeepCut Sports ("Trivia for the fans who remember the backup") — black base, hot-pink #FF0EA9 primary, gold #FFC107 crown, purple #6A00FF + cyan #00B8FF accents, graffiti/street-art.

## Data model
- users (+ last_seen, phone optional), user_sessions
- friendships {id, requester_user_id, receiver_user_id, status(pending/accepted/declined/blocked), created_at, updated_at}
- lobbies {id, creator_user_id, code, invite_token, status(waiting/active/completed/expired), sport, difficulty, timer, era, max_players=4, questions, created_at, expires_at}
- lobby_members {id, lobby_id, user_id, role(host/player), score, finished, joined_at}
- lobby_invites {id, lobby_id, invite_type(friend), invited_user_id, invite_token, status, expires_at, accepted_by_user_id}

## Implemented (2026-07-01)
- Solo timed quiz (AI questions), difficulty/timer/era multipliers + results multiplier badge, leaderboard, profile.
- StatHead rebrand: palette, graffiti fonts, poster login hero, generated app icon/splash.
- Friends system: search, request/accept/decline, remove, block/unblock, list, requests, online status.
- Multiplayer lobby: create, waiting room (polling 3s), invite via native Share Sheet + copy link + in-app friend invites, pending invites, up to 4 players, host-only start (>=2), shared AI quiz, standings; leave/expire; secure random tokens; deep-link join flow (validate → sign-in → auto-join) with full/expired/started/invalid states.
- Backend fully tested: 33/33 friends+lobby + legacy suite passing.

## Backlog / Next
- P1: Push-notification lobby invites (on user request), QR-code invites.
- P1: Production universal links (stathead.gg AASA/assetlinks) after deploy so installed app opens invites directly.
- P2: Real-time (WebSocket) lobby updates instead of polling; friend online presence heartbeat; block-list hardening (404 on missing target).
