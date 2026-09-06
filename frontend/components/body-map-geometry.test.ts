import { describe, expect, it } from 'vitest';
import { bodyAreas, bodyRegionAt, spreadForDistance } from './body-map-geometry';

describe('body map geometry', () => {
  it('places every accessible area in the corresponding silhouette region', () => {
    for (const area of bodyAreas) {
      expect(bodyRegionAt(area.x, area.y)).toBe(area.name.toLowerCase());
    }
  });

  it('distinguishes limbs from the torso at the same height on both sides', () => {
    expect(bodyRegionAt(50, 77)).toBe('stomach');
    expect(bodyRegionAt(23, 77)).toBe('arms');
    expect(bodyRegionAt(77, 77)).toBe('arms');
    expect(bodyRegionAt(50, 97)).toBe('hips');
    expect(bodyRegionAt(15, 97)).toBe('hands');
    expect(bodyRegionAt(85, 97)).toBe('hands');
  });

  it('keeps dragged spread bounded without moving the placed center', () => {
    expect(spreadForDistance(0)).toBe(4);
    expect(spreadForDistance(13.27)).toBe(13.3);
    expect(spreadForDistance(300)).toBe(26);
  });
});
