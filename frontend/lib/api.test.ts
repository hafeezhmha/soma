import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('API workflow', () => {
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
