import { Activation, Part, Session } from './types';

const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '');
const tokenKey = 'soma.profile-token';
let pendingProfile: Promise<string> | undefined;

const demoParts: Part[] = [
  {
    id: 'new-part',
    name: 'The presenter',
    color: '#4a7360',
    description: 'A part that wants to be ready before the moment arrives.',
    activations: 1,
    lastSeen: 'Today',
  },
  {
    id: 'careful-one',
    name: 'The careful one',
    color: '#4a7360',
    description: 'Keeps a close eye on what could go wrong.',
    activations: 3,
    lastSeen: 'September 4',
  },
];

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!apiUrl) throw new Error('API unavailable in demo mode');
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`API request failed (${response.status})`);
  return response.json() as Promise<T>;
}

async function profileToken(): Promise<string> {
  if (typeof window !== 'undefined') {
    const existing = window.localStorage.getItem(tokenKey);
    if (existing) return existing;
  }
  if (!pendingProfile) {
    pendingProfile = request<{ profile_token: string }>('/profiles', { method: 'POST' }).then((profile) => {
      if (typeof window !== 'undefined') window.localStorage.setItem(tokenKey, profile.profile_token);
      return profile.profile_token;
    }).finally(() => { pendingProfile = undefined; });
  }
  return pendingProfile;
}

const withToken = (token: string): RequestInit => ({ headers: { Authorization: `Bearer ${token}` } });

export async function getProfile(): Promise<{ profile_id: string; display_name: string }> {
  const token = await profileToken();
  return request('/profiles/me', withToken(token));
}

export async function updateProfile(displayName: string): Promise<void> {
  const token = await profileToken();
  await request('/profiles/me', { method: 'PATCH', ...withToken(token), body: JSON.stringify({ display_name: displayName }) });
}

export type AgentReply = {
  message: string;
  current_stage: string;
  safety: { flagged: boolean; immediate_support?: boolean };
};

export async function startSession(initialStatement: string): Promise<{ sessionId: string; response: AgentReply }> {
  const token = await profileToken();
  const created = await request<{ session_id: string }>('/sessions', { method: 'POST', ...withToken(token), body: JSON.stringify({ profile_token: token }) });
  const response = await request<AgentReply>(`/sessions/${created.session_id}/messages`, { method: 'POST', ...withToken(token), body: JSON.stringify({ text: initialStatement }) });
  return { sessionId: created.session_id, response };
}

export async function cancelSession(sessionId: string): Promise<void> {
  if (!apiUrl) return;
  const token = await profileToken();
  await request(`/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE', ...withToken(token) });
}

export async function setBody(sessionId: string, session: Session, includeSensation = false, includeIntensity = false): Promise<{ message: string }> {
  const token = await profileToken();
  return request(`/sessions/${sessionId}/body`, {
    method: 'POST', ...withToken(token),
    body: JSON.stringify({ region: session.bodyLocation, x: session.mark.x / 100, y: session.mark.y / 180, spread: session.mark.spread / 100, ...(includeSensation ? { sensation: session.sensation } : {}), ...(includeIntensity ? { intensity: session.intensityBefore } : {}) }),
  });
}

export async function completeRegulation(sessionId: string, technique: string): Promise<void> {
  const token = await profileToken();
  await request(`/sessions/${sessionId}/regulation`, { method: 'POST', ...withToken(token), body: JSON.stringify({ technique, completed: true }) });
}

export async function setRecheck(sessionId: string, intensity: number): Promise<void> {
  const token = await profileToken();
  await request(`/sessions/${sessionId}/recheck`, { method: 'POST', ...withToken(token), body: JSON.stringify({ intensity }) });
}

export async function completeExploration(sessionId: string, concern: string): Promise<AgentReply> {
  const token = await profileToken();
  return request(`/sessions/${sessionId}/exploration`, {
    method: 'POST',
    ...withToken(token),
    body: JSON.stringify({ concern }),
  });
}

export async function transcribeAudio(audio: Blob, signal?: AbortSignal): Promise<string> {
  if (!apiUrl) throw new Error('Voice input needs a configured API. You can type instead.');
  const token = await profileToken();
  const body = new FormData(); body.append('audio', audio, 'check-in.webm');
  const response = await fetch(`${apiUrl}/voice/stt`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body, signal });
  if (!response.ok) throw new Error('Voice input could not be transcribed. You can type instead.');
  const data = await response.json() as { text?: string };
  if (!data.text?.trim()) throw new Error('No words came through. You can try again or type instead.');
  return data.text.trim();
}

export async function speakText(text: string, signal?: AbortSignal): Promise<Blob | undefined> {
  if (!apiUrl) return undefined;
  const token = await profileToken();
  const response = await fetch(`${apiUrl}/voice/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ text }), signal });
  if (response.status === 204) return undefined;
  if (!response.ok) throw new Error('Voice playback is unavailable right now.');
  return response.blob();
}

export async function saveSession(session: Session): Promise<{ session: Session; safety?: AgentReply }> {
  try {
    const token = await profileToken();
    const sessionId = session.sessionId;
    if (!sessionId) throw new Error('Start the check-in before saving it.');
    const partResponse = await request<{ safety?: { flagged: boolean }; message?: string; current_stage?: string }>(`/sessions/${sessionId}/parts`, {
      method: 'POST', ...withToken(token),
      body: JSON.stringify({ name: session.partName, attributes: [{ key: 'sensation', value: session.sensation }] }),
    });
    if (partResponse.safety?.flagged) {
      return { session, safety: partResponse as AgentReply };
    }
    await request(`/sessions/${sessionId}/complete`, {
      method: 'POST', ...withToken(token),
      body: JSON.stringify({ reflection: `Noticed ${session.sensation} in the ${session.bodyLocation}.` }),
    });
    return { session };
  } catch {
    if (apiUrl) throw new Error('Your reflection could not be saved. Check the connection and try again.');
    return { session: { ...session, sessionId: session.sessionId ?? `demo-${Date.now()}` } };
  }
}

export async function fetchParts(): Promise<Part[]> {
  try {
    const token = await profileToken();
    const response = await request<{ parts: Array<{ id: string; name: string; attributes: Array<{ key: string; value: string; recorded_at?: string }> }>; activations: Activation[] }>('/dashboard', withToken(token));
    return response.parts.map((part) => ({
      id: part.id,
      name: part.name,
      color: '#4a7360',
      description: 'A part you have taken time to notice.',
      activations: response.activations.filter((activation) => activation.part_id === part.id).length,
      lastSeen: response.activations.find((activation) => activation.part_id === part.id)?.activated_at ? new Date(response.activations.find((activation) => activation.part_id === part.id)!.activated_at!).toLocaleDateString('en', { month: 'long', day: 'numeric' }) : 'Not yet seen',
      attributes: part.attributes,
      activationsList: response.activations.filter((activation) => activation.part_id === part.id),
    }));
  } catch {
    if (apiUrl) throw new Error('Your parts could not be loaded. Check the connection and try again.');
    return demoParts;
  }
}

export async function fetchPart(id: string): Promise<Part | undefined> {
  try {
    const token = await profileToken();
    const response = await request<{ id: string; name: string; attributes: Array<{ key: string; value: string; recorded_at?: string }>; activations: Activation[] }>(`/parts/${encodeURIComponent(id)}`, withToken(token));
    return { id: response.id, name: response.name, color: '#4a7360', description: 'A part you have taken time to notice.', activations: response.activations.length, lastSeen: response.activations[response.activations.length - 1]?.activated_at ? new Date(response.activations[response.activations.length - 1].activated_at!).toLocaleDateString('en', { month: 'long', day: 'numeric' }) : 'Not yet seen', attributes: response.attributes, activationsList: response.activations };
  } catch {
    if (apiUrl) throw new Error('This part could not be loaded. Check the connection and try again.');
    return demoParts.find((part) => part.id === id) ?? demoParts[0];
  }
}

export function hasConfiguredApi(): boolean {
  return Boolean(apiUrl);
}
