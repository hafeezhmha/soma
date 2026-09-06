# ElevenLabs Speech

Tiny local app for **text → speech** and **speech → text**. Python stdlib only, no dependencies.

## Setup
1. Put your key in `.env`:
   ```
   ELEVENLABS_API_KEY=sk_...
   ```
2. Run it:
   ```
   python3 server.py          # or: PORT=8056 python3 server.py
   ```
3. Open http://localhost:8055

The key never leaves the server — the browser talks only to `localhost`.

## Text → Speech
Type text, pick a voice and model, tune stability/similarity, play or download the mp3.

If your API key lacks the `voices_read` permission, the voice list falls back to
20 built-in ElevenLabs premade voices. Synthesis still works either way.

## Speech → Text
Drop in an audio/video file **or** record straight from the mic, then transcribe with
ElevenLabs Scribe. Optional speaker diarization and language override. Results can be
copied, downloaded as `.txt`, or pushed straight into the Text → Speech tab.

Upload cap is 100 MB (`MAX_UPLOAD` in `server.py`).

## API
| Route | Method | Notes |
|---|---|---|
| `/` | GET | the app |
| `/voices` | GET | account voices, else the built-in list |
| `/tts` | POST | JSON `{text, voice_id, model_id, stability, similarity}` → mp3 |
| `/stt` | POST | raw audio body; options via `X-Filename`, `X-Audio-Type`, `X-Model`, `X-Diarize`, `X-Language` → JSON |
