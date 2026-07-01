# Sports Trivia Blitz — PRD

## Original Problem Statement
Build a mobile app: sports trivia app.

## User Choices
- AI-generated questions (LLM), timed quiz format
- Sports: Soccer, Basketball, Cricket, Tennis, Formula 1, NFL, Baseball
- Google sign-in (Emergent-managed) + global leaderboard
- Difficulty levels (easy/medium/hard), categories by sport

## Architecture
- Frontend: Expo Router (SDK 54), react-native-reanimated, @gorhom/bottom-sheet, expo-image, expo-linear-gradient, expo-haptics. Fonts: Barlow Condensed (display) + IBM Plex Sans (body) via expo-font.
- Backend: FastAPI + Motor (MongoDB). LLM via emergentintegrations (gemini-3-flash-preview) with EMERGENT_LLM_KEY.
- Auth: Emergent Google OAuth, Bearer session tokens (7-day), stored in expo-secure-store.
- Design: "Dark-First Utility" — obsidian palette (#0F1115) + Ember red (#FF4D00).

## Core Requirements (static)
- Login → Home (sport grid + difficulty bottom sheet) → Timed Quiz → Results → Leaderboard/Profile tabs.
- Scoring: 100 pts/correct + (secondsLeft * 10) time bonus. 15s per question, 7 questions.

## Implemented (2026-07-01)
- Google auth flow (mobile + web), AuthContext, session persistence.
- Home dashboard with live rank/score/matches, 7 sport cards, difficulty bottom sheet.
- LLM quiz generation endpoint (structured JSON, validated), timed gameplay with correct/wrong states, haptics, progress bar, countdown.
- Results summary (score/accuracy/rank, play again), score submission + stats aggregation.
- Global leaderboard (podium top 3 + list + sticky "you" row), Profile with career stats + best category + logout.
- Backend tested 12/13 (only LLM live-call blocked by key budget, not a code bug).

## Backlog
- P1: Daily challenge / streaks, sound effects toggle.
- P1: Share results card (shareability / virality).
- P2: Per-sport difficulty stats, achievements/badges, friends leaderboard.

## Next Tasks
- Refresh EMERGENT_LLM_KEY balance to enable live question generation.
- Add streaks + share-to-social for retention/virality.
