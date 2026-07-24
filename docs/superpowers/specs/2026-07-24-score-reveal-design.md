# Score Reveal: blur + jitter instead of fake placeholder scores

## Problem

Similarity scores (the Siamese-network match percentage between a team's target image
and their submission) currently appear to the user as a random number that later
"settles" into the real score. This is not an animation — it's two separate bugs that
happen to *look* like a loading effect:

1. **Backend (`backend/routes/api.js`, `GET /api/admin/leaderboard`)**: whenever a
   team's `score <= 0` (not yet scored), the route fabricates a deterministic
   hash-based number in the 71.5–89.5% range and **persists it to `Team.score` via
   `Team.findByIdAndUpdate`**. The admin leaderboard polls this endpoint every few
   seconds, so admins see a fake number, then the real one once
   `POST /api/similarity` finishes and overwrites it.

2. **Frontend (`frontend/src/App.jsx`, `SelectionScreen`'s `onSelect`)**: after calling
   `POST /api/similarity`, if `data.similarity_score` is falsy (including `null` on a
   genuine failure) the code computes the same kind of hash-based fake score and
   calls `setScore()`/`updateTeamStatus()` — **persisting a fabricated score as the
   team's real result**, indistinguishable from an actual AI verdict, with no
   indication to the player or the admin that the AI service failed.

Confirmed empirically against the local backend (no `teamId`, so no real team data was
touched):
- A real (slow) similarity call take ~26s via the PyTorch fallback path (matches the
  "~30-40s" the UI already tells players to expect) and returns a real score
  correctly — this path isn't broken, it just has no visual treatment for the wait.
- A forced failure (unreachable image URL) returns `HTTP 500` with
  `{"error": "...", "similarity_score": null}` in ~6.6s. The current frontend code
  doesn't check `res.ok`, so this response is indistinguishable from "not scored yet"
  and falls straight into the fake-score branch.

## Goals

- Never show or persist a fabricated number as if it were a real similarity score.
- Communicate "still computing" visually (blurred, jittering digits) instead of via a
  fake number or a text-only placeholder.
- Distinguish "still computing" from "genuinely failed" so a real AI-service outage is
  visible instead of silently papered over.
- Keep the existing dark/gold "Imperial" visual style consistent between the admin
  leaderboard and the player's judgment screen.

## Non-goals

- Not touching `LeaderboardRedirect` (the end-of-event top-3 podium shown to players) —
  it only displays teams that already have final scores by definition.
- Not adding a test suite — this repo has none (see `CLAUDE.md`); verification is
  manual, driving the running app.
- Not changing the underlying similarity-scoring pipeline (ONNX/PyTorch paths).

## Design

### 1. Backend: stop persisting fake scores

`backend/routes/api.js`, `GET /api/admin/leaderboard`: delete the `if (!obj.score ||
obj.score <= 0) { ...hash...; await Team.findByIdAndUpdate(...) }` block. A
not-yet-scored team's `score` field simply stays at its schema default (`0`) until
`POST /api/similarity` writes the real value. No other behavior of this route changes
(the `referenceImageUrl` fallback logic is unrelated and stays as-is).

### 2. New shared module: `frontend/src/ScoreReveal.jsx`

A small, self-contained module (following the existing pattern of `useSync.js` as a
shared utility imported by both `App.jsx` and `AdminComponents.jsx`) exporting:

- **`useScoreJitter(active)`** — a hook that, while `active` is true, updates a random
  value in the ~40–95% range every ~100ms (fast flicker, "slot machine settling"
  feel). Returns the current jitter value. Cleans up its interval on unmount or when
  `active` flips false.
- **`<ScoreDigits status score size revealedColor pendingColor />`** — a presentational
  component. `status` is `'pending' | 'revealed'`:
  - `pending`: renders the jittering value from `useScoreJitter`, `filter:
    blur(8px)`, cyan, no glow.
  - `revealed`: renders the real `score`, `filter: blur(0)` transitioning over 1.5s
    (`transition: filter 1.5s ease, color 1.5s ease`), gold, with the existing
    text-shadow glow.

  This component intentionally does **not** handle an `'error'` status — that state
  needs different content (a message, not a number), so callers branch on error
  *outside* `ScoreDigits` and only render it for pending/revealed.

`size`, `revealedColor`, `pendingColor` are props (not hardcoded) so the same
component serves both the large JudgmentScreen number (~84px, matches today's
styling) and the smaller admin leaderboard row number (~36px, matches today's
styling), without duplicating the jitter/blur logic in both files.

### 3. Admin leaderboard (`frontend/src/AdminComponents.jsx`)

Replace the two existing raw score renderings (`t.score ? t.score.toFixed(1) + "%" :
"0.0%"` in the leaderboard row list, and the equivalent in the selected-team detail
view) with `<ScoreDigits status={t.score > 0 ? 'revealed' : 'pending'} score={t.score}
size={...} />`.

No `'error'` handling needed here: the admin view doesn't need to distinguish "still
computing" from "failed" — both look like "pending" from an overview panel, and admins
already have the API Call Logs / Errors panel (`Telemetry & Roster` tab) for failure
diagnosis. `score <= 0` as the "pending" heuristic matches the convention the codebase
already used before this change (a real score of exactly `0` is only theoretically
possible and never observed).

### 4. Player flow (`frontend/src/App.jsx`)

**`SelectionScreen`'s `onSelect` handler** is rewritten to retry instead of
fabricating a score:

- Up to 3 attempts, linear backoff between attempts (1s, then 2s).
- A response only counts as success if `res.ok` **and** `typeof
  data.similarity_score === 'number'`. (This is the exact condition that
  distinguishes the two response shapes reproduced during testing: `200` with a
  numeric score vs. `500` with `similarity_score: null`.)
- On success: persist the real score via `updateTeamStatus({ round: 3, score:
  data.similarity_score, finalImage: img })`, set local `scoreStatus` state to
  `'revealed'`.
- On exhausting all 3 attempts without success: set local `scoreStatus` state to
  `'error'`. **No score is written to the team record** — `updateTeamStatus({ round:
  3, finalImage: img })` still records that the round happened, just without a
  fabricated score.
- `scoreStatus` is local component state (`useState`, not persisted to the backend)
  because "error" isn't a concept the `Team` schema needs — it only matters for what
  this specific player's browser renders right now.

**`JudgmentScreen`** branches on `scoreStatus` (passed down from the parent, replacing
today's `isScoring` boolean derived purely from `score` being null):

- `'pending'`: keep today's "⏳ SIAMESE NEURAL NET COMPUTING VERDICT..." /
  "🤖 EVALUATING HIGH-RES PIXEL MATRIX (~30-40s)..." copy, but replace the icon-only
  "ANALYZING..." box with `<ScoreDigits status="pending" ... />` in the same box
  position/size the revealed score will occupy — avoids a layout jump when it flips to
  revealed.
- `'revealed'`: today's "⚡ SPELL MATCH VERDICT SEALED ⚡" copy +
  `<ScoreDigits status="revealed" score={score} ... />` + the existing 60s
  auto-redirect-to-leaderboard countdown — unchanged from today.
- `'error'` (new): "VERDICT UNAVAILABLE — NOTIFY ADMIN" message in place of the score
  box, and a manual "RETURN TO LOBBY" button instead of the auto-redirect countdown
  (there's no real result to display or to time a countdown around).

## Testing / verification plan

No test suite exists in this repo. Verification is manual, against the running app
(as already set up this session: local backend on `:5001`, local frontend on `:5174`
with `VITE_API_URL` pointed at it):

1. **Pending → revealed (success path)**: drive a team through to `SelectionScreen`,
   confirm the judgment screen shows blurred jittering digits, then smoothly unblurs
   to the real score after the real `/api/similarity` response (~26s observed
   locally). Confirm the admin leaderboard shows the same team as `pending` (jittering)
   until the same moment, then `revealed`.
2. **Error path**: temporarily point at a submitted image URL that fails to download
   (as reproduced this session) or otherwise force `/api/similarity` to return
   `similarity_score: null`, confirm 3 retries occur (visible in Network tab / backend
   logs), then the judgment screen shows the "VERDICT UNAVAILABLE" state, and — this is
   the regression check — confirm `Team.score` in the database was **not** overwritten
   with any fabricated value.
3. Confirm no console errors introduced in either the admin or player views (per the
   baseline smoke test already run this session, both were clean).
