/** Coordinates share the persisted 100 × 180 body-map space. */
export const bodyAreas = [
  { name: 'Head', x: 50, y: 18 },
  { name: 'Throat', x: 50, y: 34 },
  { name: 'Shoulders', x: 35, y: 41 },
  { name: 'Chest', x: 50, y: 54 },
  { name: 'Stomach', x: 50, y: 77 },
  { name: 'Hips', x: 50, y: 96 },
  { name: 'Arms', x: 24, y: 72 },
  { name: 'Hands', x: 16, y: 99 },
  { name: 'Legs', x: 41, y: 138 },
  { name: 'Feet', x: 38, y: 170 },
] as const;

export function bodyRegionAt(x: number, y: number): string {
  if (y < 30) return 'head';
  if (y < 39 && Math.abs(x - 50) < 8) return 'throat';
  if (y < 49 && Math.abs(x - 50) > 12) return 'shoulders';
  if (y < 110 && (x < 33 || x > 67)) return y > 89 ? 'hands' : 'arms';
  if (y < 67) return 'chest';
  if (y < 88) return 'stomach';
  if (y < 109) return 'hips';
  return y < 164 ? 'legs' : 'feet';
}

export function spreadForDistance(distance: number): number {
  return Math.round(Math.max(4, Math.min(26, distance)) * 10) / 10;
}

/** Where a region sits on the 2D map, so a 3D-painted region becomes a mark. */
export function pointForRegion(region: string): { x: number; y: number } {
  const match = bodyAreas.find((area) => area.name.toLowerCase() === region.toLowerCase());
  return match ? { x: match.x, y: match.y } : { x: 50, y: 54 };
}
