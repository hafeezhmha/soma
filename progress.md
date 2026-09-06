# SOMA MVP implementation progress

Last updated: 2026-09-06

## Divya design alignment

Primary visual reference: `Divya Design/Main.dc.html` (all screens and prototype logic reviewed), supported by its README. Divya's layout takes priority over the earlier desktop-first design; the app name remains **SOMA**. Frontend-design guidance informed the responsive adaptation rather than copying the prototype's fixed 390 × 844 viewport.

| Area | Before | Divya reference / implementation now |
| --- | --- | --- |
| Check-in | Free-text opening | “How are you feeling?”, multi-select mood chips, Stormy/Cloudy/Clearing/Sunny inner weather; optional text/voice retained |
| Body | Location, spread, separate sensation step | Colour palette, multi-select textures, movement per mark; accessible map placement/spread retained |
| Navigation | Header links and linear steps | Persistent Check in / Body / SOMA / Parts bottom navigation; guided stage restrictions and confirmation before leaving an unfinished session |
| SOMA | Narrated prompts only | Chat bubbles, quick prompts, typed/voice draft, real message API; chat preserves guided stage and safety override |
| Parts | Text-heavy cards | Compact two-column character tiles using Divya's placeholder-art approach and saved colours |
| Week | Activation rows | Actual seven-day recheck-intensity chart and empty state; no seeded user history or inferred regulation labels |
| Responsive layout | Wide split layout, large orb gutter | Compact single-column layout; right-side orb on desktop, small header orb on phones; sticky header and bottom navigation |

Implemented persistence: moods, inner weather, selected colour, and up to ten complete per-mark records are saved as part attributes when the reflection is saved. Existing structured session/activation fields still store the primary mark. These are not separate queryable mark tables, and unfinished drafts are not restored after refresh. Colours do not imply emotions; voice does not select keywords or infer user choices.

Intentional differences / remaining work:

- Keep regulation → recheck → exploration before saving/naming; Divya's prototype bypasses these safety-oriented guided steps.
- Do not copy the prototype's canned chat replies or prefilled named parts. Chat uses the existing Claude-backed service (with its existing fallback behavior).
- The source's window-of-tolerance chart is sample data. The implemented chart reports recorded intensity only; no clinical category is inferred from intensity.
- Free switching back to completed body steps, persistent unfinished drafts, editable/releasable parts, and generated character artwork remain follow-up work. The UI does not promise those unsupported capabilities.
- Divya's texture choices support multiple selections here, preserving the user's earlier request. Movement is saved; only Spreading currently changes the mark halo, while texture changes ring/dot appearance.
- Browser visual/microphone verification is pending: in-app Node runtime unavailable and Chrome connection reports Google Chrome is not installed. No browser was installed.

Validation: all 46 Python tests and 14 frontend tests pass; TypeScript, ESLint, and `git diff --check` pass. Local frontend responds HTTP 200 and the API health endpoint returns `{"status":"ok"}`. Frontend API tests cover chat stage preservation and saved design attributes; backend tests cover chat safety overrides, transcript expiry, history continuity, proxy-aware onboarding limits, idempotent save retry, and STT routing. A production build was deliberately not run alongside the active development server.

## Signed-off product decisions

- Public, shareable multi-user web experience.
- Core journey: check-in → body map → regulation → recheck → Part discovery → summary.
- Returning anonymous profiles use an unguessable browser-held token; no login for MVP.
- Parts, attributes, activations, and session summaries persist across visits.
- Raw transcripts are deleted when a session is completed.
- Actian VectorAI stores curated knowledge only, never user/session data.
- Next.js frontend deploys to Vercel; FastAPI, SQLite, and VectorAI deploy together on a persistent Linux VM.
- Community/trial VectorAI deployment is a time-boxed hackathon demo, not production.

## Build checklist

- [x] Frontend scaffold and SOMA design tokens
- [x] Landing/profile experience
- [x] Interactive SVG body map
- [x] Guided session state UI
- [x] Session summary and persistent Parts dashboard
- [x] FastAPI application and health endpoint
- [x] Anonymous profile/token persistence
- [x] Session, Part, attribute, and activation data model
- [x] Deterministic safety interruption across user-entered check-in and IFS text
- [x] Claude structured-response integration with safe local fallback
- [x] ElevenLabs TTS/STT integration with text fallback and request limits
- [x] Curated knowledge corpus and ingestion
- [x] State-aware Actian VectorAI retrieval
- [x] Docker Compose development stack
- [x] Backend tests
- [x] Frontend checks/build
- [ ] End-to-end browser verification
- [x] Deployment documentation

## Current state

- VectorAI 1.0.2 is running locally on ports 6573–6575.
- Python SDK 1.0.2 is installed in `.venv`.
- Initial database connectivity and vector round-trip were verified.
- VectorAI adapter now stores curated RAG content only and supports stage/risk/framework filters.
- Nine version-controlled demo knowledge documents are embedded and ingested.
- The frontend is ready for Vercel and the persistent backend stack is defined for a Linux VM.
- Added `frontend/vercel.json` with explicit Next.js detection and baseline
  security headers. Vercel deployment uses `frontend` as the Root Directory and
  `NEXT_PUBLIC_API_URL` to reach the persistent FastAPI service; SQLite and
  VectorAI remain outside Vercel by design.
- Added `scripts/public-demo-tunnel.sh` to verify the local API and start ngrok
  or Cloudflare Tunnel for temporary Vercel demos without exposing VectorAI.
- Added `FRONTEND_DEPLOYMENT_HANDOFF.md` with Claude-ready Vercel, local API,
  tunnel, CORS, and public smoke-test instructions.
- Automated Chrome verification is pending because Google Chrome is not installed on this machine; the rendered frontend HTML and live API were smoke-tested locally.

## Validation log

- Fixed scrolling/sizing: sticky SOMA header, viewport-height-aware fixed orb, wrapping mobile header actions, and non-sticky body maps on stacked/short layouts to prevent overlap and inaccessible controls.
- Audit fixes completed: deterministic danger coverage expanded, STT moved off the async event loop, abandoned transcript cleanup added (24-hour retention), chat history passed to Claude, profile limiting can use trusted proxy identity, and completed-save retries are idempotent.
- Deployment note: set `TRUST_PROXY_HEADERS=true` only when the HTTPS proxy overwrites `X-Forwarded-For`; otherwise leave it false to prevent spoofed rate-limit identities.

- Moved the SOMA orb to the right edge, vertically centered in the viewport; reserved content space and reduced its size on mobile.

- Voice input is available for body location, sensations, intensity/recheck, concern, and part name. Per user direction, removed keyword matching and automatic selections: spoken structured answers are shown verbatim and the user is asked to choose on the map/chips/slider. Recording interrupts narration and stage navigation cancels transcription.
- Added the dark-green dimensional SOMA aura orb using the frontend-design direction: microphone and playback audio drive its level, with distinct listening/thinking/speaking states, pointer tilt, stop-speaking interaction, and reduced-motion support.
- Current checks: nine frontend tests remain after removing keyword-parser tests; TypeScript and lint pass, local page returns HTTP 200. Real microphone/playback and visual verification still require a browser/manual check.

- Voice/text UX: next screen and exact narration caption reveal on playback start; 15-second text fallback, cancellation on navigation, clear recording/transcribing/preparing states, and duplicate profile creation prevention implemented.
- Body map redesigned by the dedicated Astra agent: continuous silhouette, precise placement, selectable marks, explicit removal, adjustable spread, accessible area picker, and read-only summary. Nine frontend tests pass; visual and microphone interaction verification remains manual.
- Frontend validation uses typecheck, unit tests, and lint while the dev server is running; production builds must run with the dev server stopped to avoid overwriting its generated cache.

- `docker compose config` — passed
- Python compilation — passed
- Python unit/integration tests — 20 passed
- Frontend unit tests — 5 passed
- TypeScript typecheck — passed
- ESLint — passed with no warnings
- Next.js production build — passed
- Live VectorAI health check — passed
- Live isolated vector round-trip — passed
- Curated corpus refresh and ingestion — 9 documents passed
- Live current-backend flow — normal check-in, safety interruption, and cleanup passed
- Frontend local HTTP render — passed; SOMA title and landing experience confirmed
- Voice Studio root-env loading and configured default voice — passed
- ElevenLabs key check — valid; scoped key uses the built-in voice list because `voices_read` is not enabled
- Curated knowledge metadata validation — 9 documents passed
