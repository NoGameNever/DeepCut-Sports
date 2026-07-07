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

## Lobby game settings (2026-07-02)
- Lobby now stores a `settings` object (game_type, question_count, difficulty, selected_categories[], selected_subcategories[], era_filter, answer_format, timer_seconds, speed/streak/penalty/final-multiplier flags, max_players, friends_only, invite_only, allow_rematch, allow_spectators, settings_locked). Sensible defaults; server-side `_validate_settings` enforces enums/ranges (count 5-50, timer 0 or 5-120, max 2-4) and rejects coming-soon modes (survival/wager/team/adaptive/type_in).
- Endpoints: GET/PUT /api/lobbies/{id}/settings (host-only edit, 409 when locked). Start locks settings + generates questions from settings via `_generate_lobby_questions` (categories/difficulty/era/format/count; true-false + mixed supported). /game returns questions + settings.
- Frontend: /lobby/settings/[id] editor (grouped Game Mode / Questions / Timer / Scoring / Lobby Rules, chips + toggles + steppers, Reset to Defaults, Save; read-only for non-host). Lobby room shows a settings summary + host Edit button. Simplified Create Lobby to one tap (defaults). Quiz lobby mode applies timer_seconds (incl. No-Timer), speed/streak/penalty/final-multiplier scoring + streak pill.
- Verified via curl: defaults, valid update, 400s (mode/count/timer/categories), non-host 403, lock 409, 20-question generation.
- Model: added `username` (unique, 3-20 alnum/_), `tagline` (<=40, banned/symbol validation), `avatar` (base64 data URI), `updated_at`. Effective name = username, effective picture = avatar or Google pic.
- Endpoints: GET /api/profile (backfills username), PUT /api/profile (username+tagline validation, 400/409 errors), POST /api/profile/avatar (type + ~600KB size validation).
- Frontend: /profile/edit screen (avatar picker via expo-image-picker + resize/compress to 256px JPEG, preview, permission handling with Open-Settings fallback, username + tagline inputs with counter + suggestion chips, Save/Cancel, loading/error/success). Username + avatar + tagline now render across Profile, friends list, leaderboard, lobby members. Verified via curl + screenshot.

## Backlog / Next
- P1: Push-notification lobby invites (on user request), QR-code invites.
- P1: Production universal links (stathead.gg AASA/assetlinks) after deploy so installed app opens invites directly.
- P2: Real-time (WebSocket) lobby updates instead of polling; friend online presence heartbeat; block-list hardening (404 on missing target).

## XP & Leveling System (June 2026) — DONE
- Knowledge XP: correct-answer XP by difficulty (10/15/25, deep-cut 40), streak bonuses (3/5/10 → +10/+25/+75), match win +100, achievement rewards. Sources for daily_challenge/prediction_round wired but features not built yet.
- Player Level: lifetime-XP based, spec curve (L2=100 … L10=4100, then +1000+(L-4)*250; L11=6600). Level rewards at 5/10/15/20/30/40/50.
- Rank tiers: Casual → Ball Watcher → Ball Knower → Film Grinder → Elite Ball Knower → Hall of Ball → GOAT Status (with taglines).
- 8 achievements w/ progress tracking + one-time XP (Nostradamus = coming soon). AI tags questions (difficulty/tags/deep_cut).
- Leaderboards: Global/Friends × All-Time/Weekly (weekly lazy-resets Mondays via ISO week key, past weeks preserved in weekly_history). Ranked by Knowledge XP only.
- Profile: level card + XP bar, rank card, stats grid, level rewards rail, achievements list. ProgressionModal on level-up/achievement/tier-change (solo results + lobby standings).
- Backend: /app/backend/progression.py; GET /api/progression; leaderboard?board=; xp_events audit log; 6 seed users (is_seed) for leaderboard demos.
- Tested: 15/15 backend tests (tests/test_progression.py) + frontend flows verified.
