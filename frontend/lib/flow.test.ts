import { describe, expect, it } from 'vitest';
import { isBodyStage, markFromPoint, regionForPoint, requiresLeaveConfirmation, stageAfter } from './flow';

describe('flow helpers', () => {
  it('keeps body editing available for every body-stage tab', () => {
    for (const stage of ['locate', 'sensation', 'intensity'] as const) expect(isBodyStage(stage)).toBe(true);
    for (const stage of ['landing', 'regulate', 'recheck', 'name', 'summary'] as const) expect(isBodyStage(stage)).toBe(false);
  });
  it('requires confirmation before abandoning an active session', () => {
    for (const stage of ['locate', 'sensation', 'intensity', 'regulate', 'recheck', 'explore', 'name', 'safety'] as const) expect(requiresLeaveConfirmation(stage, true)).toBe(true);
    for (const stage of ['landing', 'summary', 'dashboard', 'part'] as const) expect(requiresLeaveConfirmation(stage, true)).toBe(false);
    expect(requiresLeaveConfirmation('locate', false)).toBe(false);
  });
  it('moves through the guided sequence and leaves terminal stages alone', () => {
    expect(stageAfter('landing')).toBe('locate');
    expect(stageAfter('locate')).toBe('sensation');
    expect(stageAfter('name')).toBe('summary');
    expect(stageAfter('summary')).toBe('summary');
  });

  it('normalizes body marks to the body-map coordinate space', () => {
    expect(markFromPoint(-4, 250, 'chest')).toMatchObject({ x: 0, y: 180, spread: 12, region: 'chest' });
  });

  it('provides a gentle region guess for a tap', () => {
    expect(regionForPoint(50, 20)).toBe('head');
    expect(regionForPoint(50, 77)).toBe('chest');
    expect(regionForPoint(50, 166)).toBe('legs');
  });
});
