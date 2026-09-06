import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('API workflow', () => {
  it('uses the most recently saved part colour', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api.test');
    vi.stubGlobal('window', { localStorage: { getItem: () => 'profile-token' } });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ parts: [{ id: 'part', name: 'My part', attributes: [{ key: 'colour', value: '#c2a35a' }, { key: 'colour', value: '#b98a9e' }] }], activations: [] }))));
    const { fetchParts } = await import('./api');
    expect((await fetchParts())[0].color).toBe('#b98a9e');
  });

  it('sends chat without advancing the guided session', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api.test');
    vi.stubGlobal('window', { localStorage: { getItem: () => 'profile-token' } });
    const fetch = vi.fn(async () => new Response(JSON.stringify({ message: 'What do you notice?', current_stage: 'BODY_LOCATION', safety: { flagged: false } })));
    vi.stubGlobal('fetch', fetch);
    const { sendChatMessage } = await import('./api');
    await sendChatMessage('session-1', 'I feel scattered');
    expect(fetch).toHaveBeenCalledWith('http://api.test/sessions/session-1/messages', expect.objectContaining({ body: JSON.stringify({ text: 'I feel scattered', advance_stage: false }) }));
  });

  it('persists user-selected weather, moods, and per-mark qualities', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api.test');
    vi.stubGlobal('window', { localStorage: { getItem: () => 'profile-token' } });
    const calls: Array<{ path: string; body: { attributes?: Array<{ key: string; value: string }> } }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ path: new URL(url).pathname, body: JSON.parse(String(init?.body)) });
      return new Response('{}');
    }));
    const { saveSession } = await import('./api');
    const mark = { id: 'm', x: 50, y: 54, spread: 12, region: 'chest', color: '#b98a9e', textures: ['Heavy', 'Warm'], movement: 'Pulsing' };
    await saveSession({ sessionId: 's', sourceSensation: 'tender', bodyLocation: 'chest', mark, marks: [mark], moods: ['tender'], weather: 'Cloudy', sensation: 'heavy', intensityBefore: 6, intensityAfter: 4, partName: 'A part', date: 'Today' });
    expect(calls[0].body.attributes).toEqual(expect.arrayContaining([{ key: 'moods', value: 'tender' }, { key: 'inner_weather', value: 'Cloudy' }, { key: 'colour', value: '#b98a9e' }, { key: 'body_mark_1', value: JSON.stringify(mark) }]));
    expect(calls[1].path).toBe('/sessions/s/complete');
  });

  it('shares one profile creation across simultaneous initial requests', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api.test');
    const storage = new Map<string, string>();
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) } });
    let profilesCreated = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (new URL(url).pathname === '/profiles') {
        profilesCreated += 1;
        return new Response(JSON.stringify({ profile_token: 'shared-profile' }));
      }
      return new Response(JSON.stringify({ profile_id: 'one', display_name: 'Guest' }));
    }));
    const { getProfile } = await import('./api');
    await Promise.all([getProfile(), getProfile()]);
    expect(profilesCreated).toBe(1);
  });
  it('creates a session and sends the initial check-in before body mapping', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api.test');
    vi.stubGlobal('window', { localStorage: { getItem: () => 'profile-token', setItem: vi.fn() } });
    const calls: Array<{ path: string; body: unknown }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ path: new URL(url).pathname, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return new Response(JSON.stringify(calls.length === 1 ? { session_id: 'session-1' } : { current_stage: 'BODY_LOCATION' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    const { startSession } = await import('./api');
    const result = await startSession('I feel a tight chest');
    expect(calls.map((call) => call.path)).toEqual(['/sessions', '/sessions/session-1/messages']);
    expect(calls[1].body).toEqual({ text: 'I feel a tight chest' });
    expect(result).toEqual({ sessionId: 'session-1', response: { current_stage: 'BODY_LOCATION' } });
  });

  it('does not convert configured API failures into demo data', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api.test');
    vi.stubGlobal('window', { localStorage: { getItem: () => 'profile-token', setItem: vi.fn() } });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const { saveSession } = await import('./api');
    await expect(saveSession({ sessionId: 'session-1', sourceSensation: 'tight chest', bodyLocation: 'chest', mark: { id: 'm', x: 50, y: 70, spread: 12, region: 'chest' }, sensation: 'tight', intensityBefore: 6, intensityAfter: 4, partName: 'The presenter', date: 'Today' })).rejects.toThrow('could not be saved');
  });
});
