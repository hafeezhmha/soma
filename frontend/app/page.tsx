'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { cancelSession, completeExploration, completeRegulation, fetchParts, getProfile, hasConfiguredApi, saveSession, setBody, setRecheck, speakText, startSession, transcribeAudio, updateProfile } from '@/lib/api';
import { markFromPoint, stageAfter } from '@/lib/flow';
import BodyMap from '@/components/BodyMap';
import SomaOrb from '@/components/SomaOrb';
import { Mark, Part, Session, Stage } from '@/lib/types';

const sensations = ['Tight', 'Heavy', 'Hot', 'Cold', 'Fluttery', 'Numb', 'Pressure', 'Tingling', 'Something else'];
const exercises = {
  'Slow breathing': 'Let your breath arrive without forcing it. In for a count of four, and out for six. We can stay here for three breaths.',
  Orienting: 'Without moving much, slowly notice three things around you. Let your eyes rest on each one.',
  Grounding: 'Notice where your body is supported by the chair or floor. Feel the weight held beneath you.',
  'Sensation observation': 'Without trying to change the tightness, notice its edges. Is there a little space around it?',
};


function Header({ onDashboard, onHome, stage, speaking, onStopVoice }: { onDashboard: () => void; onHome: () => void; stage: Stage; speaking: boolean; onStopVoice: () => void }) {
  return <header className="site-header">
    <button className="wordmark" onClick={onHome} aria-label="Go to SOMA home">SOMA</button>
    <div className="header-actions">{speaking && <button className="text-link" onClick={onStopVoice}>Stop voice</button>}{stage !== 'landing' && <button className="text-link" onClick={onDashboard}>Your parts <span aria-hidden="true">↗</span></button>}</div>
  </header>;
}

function ActionRow({ primary, onPrimary, onStop, disabled = false }: { primary: string; onPrimary: () => void; onStop: () => void; disabled?: boolean }) {
  return <div className="action-row">
    <button className="button button-primary" onClick={onPrimary} disabled={disabled}>{primary}</button>
    <button className="button button-secondary" onClick={onStop}>Not now</button>
  </div>;
}

function VoiceButton({ disabled, busy, onActivity, onPhase, onLevel, onStart, onTranscript, onError }: { disabled: boolean; busy: boolean; onActivity: (active: boolean) => void; onPhase: (phase: 'idle' | 'listening' | 'thinking') => void; onLevel: (level: number) => void; onStart: () => void; onTranscript: (text: string) => void; onError: (message: string) => void }) {
  const recorderRef = useRef<MediaRecorder>();
  const streamRef = useRef<MediaStream>();
  const audioContextRef = useRef<AudioContext>();
  const animationFrameRef = useRef<number>();
  const activeRef = useRef(false);
  const pressActiveRef = useRef(false);
  const mountedRef = useRef(true);
  const transcriptionAbortRef = useRef<AbortController>();
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [requestingMic, setRequestingMic] = useState(false);
  useEffect(() => { onActivity(recording || transcribing || requestingMic); }, [recording, transcribing, requestingMic, onActivity]);
  useEffect(() => { onPhase(recording ? 'listening' : transcribing || requestingMic ? 'thinking' : 'idle'); }, [recording, transcribing, requestingMic, onPhase]);
  const [levels, setLevels] = useState([0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18]);

  const stopMeter = useCallback((resetLevels = true) => {
    if (animationFrameRef.current !== undefined) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = undefined;
    void audioContextRef.current?.close();
    audioContextRef.current = undefined;
    onLevel(0);
    if (resetLevels && mountedRef.current) setLevels([0.18, 0.18, 0.18, 0.18, 0.18, 0.18, 0.18]);
  }, [onLevel]);

  const startMeter = (stream: MediaStream) => {
    try {
      const context = new AudioContext();
      audioContextRef.current = context;
      void context.resume().catch(() => undefined);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      context.createMediaStreamSource(stream).connect(analyser);
      const frequencies = new Uint8Array(analyser.frequencyBinCount);
      const update = () => {
        analyser.getByteFrequencyData(frequencies);
        const next = Array.from({ length: 7 }, (_, index) => {
          const start = 2 + index * 5;
          const band = frequencies.slice(start, start + 5);
          const average = band.reduce((sum, value) => sum + value, 0) / band.length;
          return Math.max(0.18, Math.min(1, average / 150));
        });
        setLevels(next);
        onLevel(Math.max(0, (Math.max(...next) - 0.18) / 0.82));
        animationFrameRef.current = requestAnimationFrame(update);
      };
      update();
    } catch {
      // Recording still works when a browser cannot create a visual analyser.
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    const stopWhenHidden = () => {
      if (document.hidden) {
        pressActiveRef.current = false;
        if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      }
    };
    document.addEventListener('visibilitychange', stopWhenHidden);
    return () => {
      mountedRef.current = false;
      activeRef.current = false;
      pressActiveRef.current = false;
      transcriptionAbortRef.current?.abort();
      if (recorderRef.current?.state === 'recording') {
        recorderRef.current.onstop = null;
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      stopMeter(false);
      document.removeEventListener('visibilitychange', stopWhenHidden);
    };
  }, [stopMeter]);

  const begin = async () => {
    if (disabled || busy || activeRef.current || transcribing) return;
    onStart();
    activeRef.current = true;
    setRequestingMic(true);
    let stream: MediaStream | undefined;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Voice input is not supported in this browser. You can type instead.');
      const acquiredStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (mountedRef.current) setRequestingMic(false);
      stream = acquiredStream;
      if (!mountedRef.current || !pressActiveRef.current) {
        acquiredStream.getTracks().forEach((track) => track.stop());
        activeRef.current = false;
        return;
      }
      if (typeof MediaRecorder === 'undefined') throw new Error('Voice recording is not supported in this browser. You can type instead.');
      streamRef.current = acquiredStream;
      const mediaRecorder = new MediaRecorder(acquiredStream);
      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      mediaRecorder.onstop = async () => {
        acquiredStream.getTracks().forEach((track) => track.stop());
        stopMeter();
        activeRef.current = false;
        if (!mountedRef.current) return;
        setRecording(false); setTranscribing(true);
        const controller = new AbortController();
        transcriptionAbortRef.current = controller;
        try {
          const transcript = await transcribeAudio(new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' }), controller.signal);
          if (mountedRef.current && !controller.signal.aborted) onTranscript(transcript);
        } catch (error) {
          if (mountedRef.current && !controller.signal.aborted) onError(error instanceof Error ? error.message : 'Voice input could not be transcribed.');
        } finally {
          if (mountedRef.current && !controller.signal.aborted) setTranscribing(false);
          transcriptionAbortRef.current = undefined;
        }
      };
      recorderRef.current = mediaRecorder;
      startMeter(acquiredStream);
      mediaRecorder.start();
      setRecording(true);
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      stopMeter();
      activeRef.current = false;
      if (mountedRef.current) setRequestingMic(false);
      if (mountedRef.current) onError(error instanceof Error ? error.message : 'Voice input is unavailable. You can type instead.');
    }
  };
  const startPress = () => { pressActiveRef.current = true; void begin(); };
  const end = () => {
    pressActiveRef.current = false;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };
  if (disabled) return <p className="voice-disabled">Voice input unavailable · type instead</p>;
  if (busy) return null;
  return <button className={`hold-button ${recording ? 'hold-button-recording' : ''}`} disabled={transcribing} onPointerDown={startPress} onPointerUp={end} onPointerLeave={end} onPointerCancel={end} onBlur={end} onKeyDown={(event) => { if (!event.repeat && (event.key === ' ' || event.key === 'Enter')) { event.preventDefault(); startPress(); } }} onKeyUp={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); end(); } }} aria-label="Hold to record your answer" aria-pressed={recording}>
    <span className={`voice-visual ${recording ? 'voice-visual-live' : ''}`} aria-hidden="true">
      {recording ? levels.map((level, index) => <span className="voice-bar" key={index} style={{ '--voice-level': level } as CSSProperties} />) : <span className="voice-idle-dot" />}
    </span>
    <span>{requestingMic ? 'Allow microphone access…' : transcribing ? 'Transcribing…' : recording ? 'Listening — release to send' : 'Hold to talk'}</span>
  </button>;
}

export default function Home() {
  const [stage, setStage] = useState<Stage>('landing');
  const [displayName, setDisplayName] = useState('');
  const [whatIsHappening, setWhatIsHappening] = useState('');
  const [marks, setMarks] = useState<Mark[]>([]);
  const [selectedMarkId, setSelectedMarkId] = useState<string>();
  const [selectedSensations, setSelectedSensations] = useState<string[]>([]);
  const sensation = selectedSensations.join(', ');
  const [intensityBefore, setIntensityBefore] = useState(6);
  const [intensityAfter, setIntensityAfter] = useState(4);
  const [partName, setPartName] = useState('');
  const [concern, setConcern] = useState('');
  const [exercise, setExercise] = useState<keyof typeof exercises>('Slow breathing');
  const [regulationGuidance, setRegulationGuidance] = useState('');
  const [safetyMessage, setSafetyMessage] = useState('');
  const [parts, setParts] = useState<Part[]>([]);
  const [activePart, setActivePart] = useState<Part>();
  const [savedSession, setSavedSession] = useState<Session>();
  const [loading, setLoading] = useState(false);
  const [voiceInputActive, setVoiceInputActive] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [inputPhase, setInputPhase] = useState<'idle' | 'listening' | 'thinking'>('idle');
  const [heardAnswer, setHeardAnswer] = useState('');
  const playbackMeterRef = useRef<{ context: AudioContext; frame?: number }>();
  const [apiSessionId, setApiSessionId] = useState<string>();
  const [apiError, setApiError] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [voicePending, setVoicePending] = useState(false);
  const [voiceCaption, setVoiceCaption] = useState('');
  const [voiceNotice, setVoiceNotice] = useState('');
  const operationRef = useRef(0);
  const audioUrlRef = useRef<string>();
  const audioRef = useState<{ current?: HTMLAudioElement }>({})[0];
  const abortVoiceRef = useState<{ current?: AbortController }>({})[0];

  useEffect(() => { setVoiceInputActive(false); setInputPhase('idle'); setVoiceLevel(0); setHeardAnswer(''); }, [stage]);
  useEffect(() => () => {
    const meter = playbackMeterRef.current;
    if (meter?.frame !== undefined) cancelAnimationFrame(meter.frame);
    void meter?.context.close().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (stage === 'dashboard') {
      setApiError('');
      fetchParts().then(setParts).catch((error) => setApiError(error instanceof Error ? error.message : 'Your parts could not be loaded.'));
    }
  }, [stage]);

  useEffect(() => {
    if (!hasConfiguredApi()) return;
    getProfile().then((profile) => setDisplayName((current) => current || profile.display_name)).catch((error) => setApiError(error instanceof Error ? error.message : 'Your profile could not be loaded. You can still type a name and try again.'));
    return () => { abortVoiceRef.current?.abort(); audioRef.current?.pause(); if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current); };
  }, [abortVoiceRef, audioRef]);

  const selectedMark = useMemo(() => marks.find((mark) => mark.id === selectedMarkId) ?? marks[0], [marks, selectedMarkId]);

  const reset = () => {
    operationRef.current += 1; stopVoice(); setLoading(false); setVoiceInputActive(false); setVoiceCaption(''); setVoiceNotice('');
    setIntensityBefore(6); setIntensityAfter(4); setExercise('Slow breathing');
    setStage('landing'); setMarks([]); setSelectedMarkId(undefined); setSelectedSensations([]); setPartName(''); setConcern(''); setRegulationGuidance(''); setSafetyMessage(''); setWhatIsHappening(''); setSavedSession(undefined); setApiSessionId(undefined); setApiError('');
  };
  const stop = async () => {
    stopVoice();
    operationRef.current += 1;
    const incompleteSession = apiSessionId && !['summary', 'dashboard', 'part'].includes(stage);
    reset();
    if (incompleteSession) { try { await cancelSession(apiSessionId); } catch { /* Leaving remains available offline. */ } }
  };
  const openDashboard = async () => {
    operationRef.current += 1; stopVoice(); setLoading(false); setVoiceCaption('');
    const incompleteSession = apiSessionId && !['summary', 'dashboard', 'part'].includes(stage);
    setStage('dashboard');
    if (incompleteSession) {
      try { await cancelSession(apiSessionId); } catch { /* Dashboard remains reachable during an outage. */ }
      setApiSessionId(undefined);
    }
  };
  const stopVoice = () => {
    abortVoiceRef.current?.abort(); audioRef.current?.pause();
    stopPlaybackMeter();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = undefined; setSpeaking(false); setVoicePending(false);
  };
  const stopPlaybackMeter = () => {
    const meter = playbackMeterRef.current;
    if (meter?.frame !== undefined) cancelAnimationFrame(meter.frame);
    void meter?.context.close().catch(() => undefined);
    playbackMeterRef.current = undefined; setVoiceLevel(0);
  };
  const meterPlayback = async (audio: HTMLAudioElement, signal: AbortSignal) => {
    let context: AudioContext | undefined;
    try {
      context = new AudioContext();
      // Never route playback through a suspended context: native audio must still work.
      await context.resume();
      if (signal.aborted || context.state !== 'running') { void context.close(); return; }
      const analyser = context.createAnalyser(); analyser.fftSize = 256;
      const source = context.createMediaElementSource(audio);
      source.connect(context.destination);
      source.connect(analyser);
      const meter: { context: AudioContext; frame?: number } = { context };
      playbackMeterRef.current = meter;
      const samples = new Uint8Array(analyser.fftSize);
      const update = () => {
        if (signal.aborted) return;
        analyser.getByteTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / samples.length);
        setVoiceLevel(Math.min(1, rms * 6));
        meter.frame = requestAnimationFrame(update);
      };
      update();
    } catch { void context?.close().catch(() => undefined); }
  };
  const announce = async (text: string, reveal: () => void) => {
    stopVoice(); setVoiceNotice('');
    const controller = new AbortController(); abortVoiceRef.current = controller;
    const show = () => { if (!controller.signal.aborted) { setVoiceCaption(text); reveal(); } };
    if (!hasConfiguredApi()) { show(); return; }
    setVoicePending(true);
    const timeout = window.setTimeout(() => { controller.abort(); setVoicePending(false); setVoiceNotice('Voice is taking longer than usual. You can continue reading.'); setVoiceCaption(text); reveal(); }, 15000);
    controller.signal.addEventListener('abort', () => window.clearTimeout(timeout), { once: true });
    try {
      const blob = await speakText(text, controller.signal);
      if (controller.signal.aborted) return;
      if (!blob) { setVoiceNotice('Voice is unavailable right now. You can continue reading.'); show(); return; }
      const url = URL.createObjectURL(blob); audioUrlRef.current = url;
      const audio = new Audio(url); audioRef.current = audio;
      audio.onplaying = () => { if (!controller.signal.aborted) { setSpeaking(true); show(); } };
      audio.onended = () => { if (!controller.signal.aborted) { stopPlaybackMeter(); setSpeaking(false); URL.revokeObjectURL(url); audioUrlRef.current = undefined; } };
      audio.onerror = () => {
        if (!controller.signal.aborted) {
          setSpeaking(false); setVoicePending(false);
          stopPlaybackMeter();
          setVoiceNotice('Audio could not play. You can continue reading.');
          URL.revokeObjectURL(url); audioUrlRef.current = undefined; show();
        }
      };
      await audio.play();
      if (!controller.signal.aborted && !audio.ended) void meterPlayback(audio, controller.signal);
    } catch {
      if (!controller.signal.aborted) { setVoiceNotice('Audio could not play. You can continue reading.'); show(); }
    } finally {
      window.clearTimeout(timeout);
      if (!controller.signal.aborted) setVoicePending(false);
    }
  };
  const currentSession = (): Session => ({ displayName: displayName.trim() || undefined, sourceSensation: whatIsHappening.trim() || 'A sensation I noticed', bodyLocation: selectedMark?.region || 'chest', mark: selectedMark ?? markFromPoint(50, 68, 'chest'), sensation: sensation || 'something I noticed', intensityBefore, intensityAfter, partName: partName.trim() || 'Unnamed part', concern: concern.trim() || undefined, date: new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date()), sessionId: apiSessionId });
  const startCheckin = async () => {
    if (!whatIsHappening.trim() || loading || voiceInputActive) return;
    setLoading(true); setApiError('');
    const operation = ++operationRef.current;
    try {
      if (hasConfiguredApi()) {
        if (displayName.trim()) await updateProfile(displayName.trim());
        if (operation !== operationRef.current) return;
        const result = await startSession(whatIsHappening.trim());
        if (operation !== operationRef.current) { void cancelSession(result.sessionId).catch(() => undefined); return; }
        setApiSessionId(result.sessionId);
        if (result.response.safety.flagged) {
          setSafetyMessage(result.response.message);
          setStage('safety');
          return;
        }
        await announce(result.response.message, () => setStage('locate'));
      } else {
        setStage('locate');
      }
    } catch (error) { if (operation === operationRef.current) setApiError(error instanceof Error ? error.message : 'The check-in could not start. Try again.'); } finally { if (operation === operationRef.current) setLoading(false); }
  };
  const advanceWith = async (action: () => Promise<string | void>, spoken: string) => {
    if (loading || voiceInputActive) return;
    const operation = ++operationRef.current;
    stopVoice(); setLoading(true); setApiError('');
    try {
      const responseMessage = hasConfiguredApi() && apiSessionId ? await action() : undefined;
      if (operation !== operationRef.current) return;
      await announce(responseMessage || spoken, () => {
        if (stage === 'intensity') setRegulationGuidance(responseMessage || spoken);
        setStage(stageAfter(stage));
      });
    } catch (error) { if (operation === operationRef.current) setApiError(error instanceof Error ? error.message : 'That step could not be saved. Try again.'); }
    finally { if (operation === operationRef.current) setLoading(false); }
  };
  const continueLocate = () => advanceWith(async () => (await setBody(apiSessionId!, currentSession())).message, 'What does it feel like there?');
  const continueSensation = () => advanceWith(async () => (await setBody(apiSessionId!, currentSession(), true)).message, 'How strong is it right now, from one to ten?');
  const continueIntensity = () => advanceWith(async () => (await setBody(apiSessionId!, currentSession(), true, true)).message, exercises[exercise]);
  const chooseExercise = async (item: keyof typeof exercises) => {
    if (loading) return;
    const operation = ++operationRef.current;
    setLoading(true);
    try { await announce(exercises[item], () => { setExercise(item); setRegulationGuidance(exercises[item]); }); }
    finally { if (operation === operationRef.current) setLoading(false); }
  };
  const continueRegulation = () => advanceWith(() => completeRegulation(apiSessionId!, exercise), 'Notice your body again. How strong is it now?');
  const continueRecheck = () => advanceWith(() => setRecheck(apiSessionId!, intensityAfter), 'If it feels okay, could we get curious about the part connected to this sensation?');
  const continueExploration = async () => {
    if (loading || voiceInputActive) return;
    const operation = ++operationRef.current; stopVoice();
    setLoading(true); setApiError('');
    try {
      if (hasConfiguredApi() && apiSessionId) {
        const response = await completeExploration(apiSessionId, concern.trim());
        if (operation !== operationRef.current) return;
        if (response.safety.flagged) { setSafetyMessage(response.message); setStage('safety'); return; }
        await announce('If this sensation had a name, what would you call it?', () => setStage('name'));
      } else {
        setStage('name');
      }
    } catch (error) { if (operation === operationRef.current) setApiError(error instanceof Error ? error.message : 'That step could not be saved. Try again.'); } finally { if (operation === operationRef.current) setLoading(false); }
  };
  const canEditBody = !loading && ['locate', 'sensation', 'intensity'].includes(stage);
  const placeMark = (mark: Mark) => { if (!canEditBody) return; setMarks((current) => current.some((item) => item.id === mark.id) ? current.map((item) => item.id === mark.id ? mark : item) : [...current, mark]); setSelectedMarkId(mark.id); };
  const removeMark = (id: string) => { if (!canEditBody) return; setMarks((current) => current.filter((mark) => mark.id !== id)); setSelectedMarkId(undefined); };
  const answerByVoice = (text: string) => {
    setApiError(''); setHeardAnswer('');
    if (!text.trim()) { setApiError('I didn’t catch that. Hold to talk and try again.'); return; }
    if (stage === 'landing') setWhatIsHappening(text);
    else if (stage === 'explore') setConcern(text);
    else if (stage === 'name') setPartName(text);
    setHeardAnswer(text);
  };
  const voiceAnswerControl = <VoiceButton key={stage} disabled={!hasConfiguredApi()} busy={loading} onActivity={setVoiceInputActive} onPhase={setInputPhase} onLevel={setVoiceLevel} onStart={() => { stopVoice(); setApiError(''); setHeardAnswer(''); }} onTranscript={answerByVoice} onError={setApiError} />;
  const save = async () => {
    if (loading || voiceInputActive) return;
    const operation = ++operationRef.current;
    stopVoice(); setVoiceCaption('');
    setLoading(true);
    setApiError('');
    try {
      const result = await saveSession(currentSession());
      if (operation !== operationRef.current) return;
      if (result.safety?.safety.flagged) { setSafetyMessage(result.safety.message); setStage('safety'); return; }
      setSavedSession(result.session); setStage('summary');
    } catch (error) { if (operation === operationRef.current) setApiError(error instanceof Error ? error.message : 'Your reflection could not be saved. Try again.'); } finally { if (operation === operationRef.current) setLoading(false); }
  };

  return <main className={`app-shell ${!['safety', 'dashboard', 'part', 'summary'].includes(stage) ? 'app-shell--companion' : ''}`}>
    <Header onDashboard={() => { void openDashboard(); }} onHome={() => { void stop(); }} stage={stage} speaking={speaking} onStopVoice={stopVoice} />
    {!['safety', 'dashboard', 'part', 'summary'].includes(stage) && <SomaOrb mode={inputPhase !== 'idle' ? inputPhase : speaking ? 'speaking' : voicePending || loading ? 'thinking' : 'idle'} level={voiceLevel} onStop={stopVoice} />}
    {loading && <p className="caption" role="status">{voicePending ? 'Preparing SOMA’s voice…' : 'Saving your response…'}</p>}
    {voiceNotice && <p className="caption" role="status">{voiceNotice}</p>}

    {stage === 'landing' && <section className="landing page-section" aria-labelledby="landing-title">
      <p className="eyebrow">A quiet place to notice</p>
      <h1 id="landing-title">What’s happening<br /><em>right now?</em></h1>
      <p className="lead">You don’t need to know exactly what you’re feeling.</p>
      <label className="input-label" htmlFor="check-in">Start wherever you are</label>
      <textarea id="check-in" className="prompt-field" rows={2} value={whatIsHappening} onChange={(event) => setWhatIsHappening(event.target.value)} placeholder="I’m noticing…" />
      <div className="landing-actions"><button className="button button-primary" onClick={startCheckin} disabled={loading || voiceInputActive || !whatIsHappening.trim()}>{loading ? 'Preparing your check-in…' : 'Begin check-in'} <span aria-hidden="true">→</span></button>{voiceAnswerControl}</div>
      <div className="optional-name"><label className="input-label" htmlFor="display-name">Your name <span>(optional)</span></label><input id="display-name" className="line-input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="How should we greet you?" /></div>
      {apiError && <p className="error-note" role="alert">{apiError}</p>}
    </section>}

    {stage === 'safety' && <section className="safety page-section" aria-live="assertive">
      <p className="eyebrow">Immediate support</p>
      <h1>Your safety matters <em>most right now.</em></h1>
      <p className="safety-message">{safetyMessage}</p>
      <p className="body-copy">If you may act on these thoughts or are in immediate danger, call your local emergency number now. If you can, contact a trusted person and stay with them.</p>
      <p className="caption">SOMA is not an emergency or crisis service.</p>
      <button className="button button-secondary" onClick={() => { void stop(); }}>Close this check-in</button>
    </section>}

    {stage !== 'landing' && stage !== 'safety' && stage !== 'summary' && stage !== 'dashboard' && stage !== 'part' && <div className="flow-layout">
      <aside className="flow-map"><p className="eyebrow">Your body map</p><BodyMap readOnly={!canEditBody} marks={marks} selectedId={selectedMarkId} onPlace={placeMark} onRemove={removeMark} onSelect={setSelectedMarkId} /></aside>
      <section className="flow-panel" aria-live="polite">
        {['locate', 'sensation', 'intensity', 'recheck', 'explore', 'name'].includes(stage) && <div className="spoken-answer">{voiceAnswerControl}{heardAnswer && <p className="caption">Heard: “{heardAnswer}” · {stage === 'locate' ? 'Where would you like to mark that on the body?' : stage === 'sensation' ? 'Which sensations would you like to select?' : stage === 'intensity' || stage === 'recheck' ? 'What number would you choose on the slider?' : 'Check your words below, then continue.'}</p>}</div>}
        {voiceCaption && stage !== 'regulate' && <p className="voice-caption">{voiceCaption}</p>}
        {stage === 'locate' && <><p className="eyebrow">First, notice</p><h1>Where do you feel it <em>most strongly?</em></h1><p className="body-copy">Tell SOMA in your own words. Where would you like to place the mark? Tap the outline to choose.</p><ActionRow primary={marks.length ? 'Continue' : 'Place a mark'} onPrimary={continueLocate} onStop={stop} disabled={!marks.length || loading || voiceInputActive} /></>}
        {stage === 'sensation' && <><p className="eyebrow">Stay with the sensation</p><h1>What does it feel like <em>there?</em></h1><p className="body-copy">Choose all that fit. Tap again to deselect.</p><div className="chip-grid" role="group" aria-label="Sensations — choose all that fit">{sensations.map((item) => { const value = item.toLowerCase(); const selected = selectedSensations.includes(value); return <button key={item} type="button" disabled={voiceInputActive || loading} aria-pressed={selected} className={`chip ${selected ? 'chip-active' : ''}`} onClick={() => setSelectedSensations((current) => current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value])}>{item}</button>; })}</div><ActionRow primary="Continue" onPrimary={continueSensation} onStop={stop} disabled={!selectedSensations.length || loading || voiceInputActive} /></>}
        {stage === 'intensity' && <><p className="eyebrow">A first reading</p><h1>How strong is it <em>right now?</em></h1><div className="range-wrap"><input type="range" min="1" max="10" value={intensityBefore} onChange={(event) => setIntensityBefore(Number(event.target.value))} aria-label="Sensation intensity from 1 to 10" /><div className="range-labels"><span>1 · barely there</span><output>{intensityBefore}</output><span>10 · fills the room</span></div></div><ActionRow primary="Make a little room" onPrimary={continueIntensity} onStop={stop} disabled={voiceInputActive || loading} /></>}
        {stage === 'regulate' && <><p className="eyebrow">Make a little room</p><h1>Would you like to stay with this <em>for a moment?</em></h1><p className="body-copy">{regulationGuidance || exercises[exercise]}</p><div className="exercise-tabs">{(Object.keys(exercises) as Array<keyof typeof exercises>).map((item) => <button key={item} disabled={voiceInputActive || loading} className={`tab ${exercise === item ? 'tab-active' : ''}`} onClick={() => { void chooseExercise(item); }}>{item}</button>)}</div><ActionRow primary="I’m ready to recheck" onPrimary={continueRegulation} onStop={stop} disabled={voiceInputActive || loading} /></>}
        {stage === 'recheck' && <><p className="eyebrow">Notice again</p><h1>How strong is the {sensation || 'sensation'} <em>now?</em></h1><p className="body-copy">It doesn’t have to be less. We’re only noticing what’s here.</p><div className="range-wrap"><input type="range" min="1" max="10" value={intensityAfter} onChange={(event) => setIntensityAfter(Number(event.target.value))} aria-label="Sensation intensity after regulation from 1 to 10" /><div className="range-labels"><span>1 · barely there</span><output>{intensityAfter}</output><span>10 · fills the room</span></div></div><ActionRow primary="Get curious" onPrimary={continueRecheck} onStop={stop} disabled={voiceInputActive || loading} /></>}
        {stage === 'explore' && <><p className="eyebrow">A gentle curiosity</p><h1>What does this part seem <em>worried might happen?</em></h1><p className="body-copy">There is no answer SOMA needs from you. Use your own words, or choose not now.</p><label className="input-label" htmlFor="part-concern">What you notice</label><input id="part-concern" className="line-input name-input" value={concern} onChange={(event) => setConcern(event.target.value)} placeholder="It seems worried that…" /><ActionRow primary="Continue" onPrimary={continueExploration} onStop={stop} disabled={voiceInputActive || loading || !concern.trim()} /></>}
        {stage === 'name' && <><p className="eyebrow">A gentle curiosity</p><h1>If this sensation had a name, <em>what would you call it?</em></h1><p className="body-copy">You’re the one who knows. A name can be temporary, ordinary, or just for today.</p><label className="input-label" htmlFor="part-name">Name this part</label><input id="part-name" className="line-input name-input" value={partName} onChange={(event) => setPartName(event.target.value)} placeholder="The part that…" /><ActionRow primary={loading ? 'listening…' : 'Save this reflection'} onPrimary={save} onStop={stop} disabled={voiceInputActive || loading || !partName.trim()} /></>}
        {apiError && <p className="error-note" role="alert">{apiError}</p>}
      </section>
    </div>}

    {stage === 'summary' && <section className="summary page-section"><p className="eyebrow">Reflection saved</p><h1>A little more room<br /><em>to notice.</em></h1><div className="summary-card"><div className="summary-mark"><BodyMap readOnly marks={marks} selectedId={selectedMarkId} onPlace={placeMark} onRemove={removeMark} onSelect={setSelectedMarkId} /></div><div><p className="summary-part">{partName || 'Unnamed part'}</p><p className="summary-copy">You noticed something {sensation || 'present'} in your {selectedMark?.region || 'body'} at {intensityBefore}/10, and rechecked at {intensityAfter}/10.</p><p className="caption">{savedSession?.date ?? 'Today'} · this is your observation, in your words.</p></div></div><div className="action-row"><button className="button button-primary" onClick={() => setStage('dashboard')}>See your parts</button><button className="button button-secondary" onClick={reset}>Close</button></div>{!hasConfiguredApi() && <p className="demo-note">Demo mode · your reflection is held in this session only.</p>}</section>}

    {stage === 'dashboard' && <Dashboard parts={parts} error={apiError} onOpen={(part) => { setActivePart(part); setStage('part'); }} onBegin={() => { reset(); setStage('landing'); }} />}
    {stage === 'part' && activePart && <PartPage part={activePart} onBack={() => setStage('dashboard')} />}
  </main>;
}

function Dashboard({ parts, error, onOpen, onBegin }: { parts: Part[]; error: string; onOpen: (part: Part) => void; onBegin: () => void }) {
  const activations = parts.flatMap((part) => (part.activationsList ?? []).map((activation) => ({ ...activation, name: part.name }))).sort((a, b) => String(b.activated_at ?? b.date).localeCompare(String(a.activated_at ?? a.date)));
  return <section className="dashboard page-section"><div className="dashboard-heading"><div><p className="eyebrow">Your parts</p><h1>A map of what’s <em>been here.</em></h1></div><button className="button button-primary" onClick={onBegin}>New check-in</button></div>{error && <p className="error-note" role="alert">{error}</p>}<div className="parts-grid">{parts.map((part) => <button className="part-card" key={part.id} onClick={() => onOpen(part)}><span className="part-dot" /><span className="part-name">{part.name}</span><span className="part-description">{part.description}</span><span className="part-meta">{part.activations} activations · {part.lastSeen}</span><span className="part-arrow" aria-hidden="true">↗</span></button>)}</div><div className="history"><p className="eyebrow">Activation history</p>{activations.length === 0 && <p className="body-copy">No saved activations yet.</p>}{activations.map((activation, index) => <div className="history-row" key={activation.id ?? `${activation.name}-${index}`}><span>{activation.activated_at ? new Date(activation.activated_at).toLocaleDateString('en', { month: 'long', day: 'numeric' }) : 'Recently'}</span><span>{activation.name}</span><span>{activation.body_region ?? 'body'} · {activation.source_sensation ?? 'sensation'}</span><span>{activation.intensity_before ?? '—'} → {activation.intensity_after ?? '—'}</span></div>)}<p className="caption">Trends are made from the moments you choose to save.</p></div></section>;
}

function PartPage({ part, onBack }: { part: Part; onBack: () => void }) {
  return <section className="part-page page-section"><button className="back-link" onClick={onBack}>← Your parts</button><p className="eyebrow">Part · {part.lastSeen}</p><h1>{part.name}</h1><div className="part-character" aria-hidden="true"><span className="part-character-mark" /></div><p className="part-intro">{part.description}</p><div className="divider" /><p className="eyebrow">What you’ve noticed</p>{(part.attributes ?? []).length === 0 && <p className="body-copy">No attributes saved yet.</p>}{(part.attributes ?? []).map((attribute, index) => <div className="attribute" key={`${attribute.key}-${attribute.recorded_at ?? index}`}><span>{attribute.recorded_at ? new Date(attribute.recorded_at).toLocaleDateString('en', { month: 'long', day: 'numeric' }) : 'Recently'}</span><p>{attribute.key}: {attribute.value}</p></div>)}<div className="divider" /><p className="eyebrow">Activations · {part.activations}</p>{(part.activationsList ?? []).map((activation, index) => <div className="attribute" key={activation.id ?? index}><span>{activation.activated_at ? new Date(activation.activated_at).toLocaleDateString('en', { month: 'long', day: 'numeric' }) : 'Recently'}</span><p>{activation.body_region ?? 'body'} · {activation.source_sensation ?? 'sensation'} · {activation.intensity_before ?? '—'} → {activation.intensity_after ?? '—'}</p></div>)}<button className="button button-secondary" onClick={onBack}>Back to dashboard</button></section>;
}
