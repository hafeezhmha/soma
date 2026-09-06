# SOMA MVP implementation progress

Last updated: 2026-09-06

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
- Automated Chrome verification is pending because Google Chrome is not installed on this machine; the rendered frontend HTML and live API were smoke-tested locally.

## Validation log

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
