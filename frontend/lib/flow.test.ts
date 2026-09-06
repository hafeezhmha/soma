import { describe, expect, it } from 'vitest';
import { markFromPoint, regionForPoint, stageAfter } from './flow';

describe('flow helpers', () => {
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
