import { Mark, Stage } from './types';

export const isBodyStage = (stage: Stage): boolean => ['locate', 'sensation', 'intensity'].includes(stage);
export const requiresLeaveConfirmation = (stage: Stage, hasSession: boolean): boolean => hasSession && !['landing', 'summary', 'dashboard', 'part'].includes(stage);

export const stageAfter = (stage: Stage): Stage => {
  const next: Partial<Record<Stage, Stage>> = {
    landing: 'locate',
    locate: 'sensation',
    sensation: 'intensity',
    intensity: 'regulate',
    regulate: 'recheck',
    recheck: 'explore',
    explore: 'name',
    name: 'summary',
  };
  return next[stage] ?? stage;
};

export const markFromPoint = (x: number, y: number, region: string): Mark => ({
  id: `mark-${Math.round(x * 100)}-${Math.round(y * 100)}`,
  x: Math.max(0, Math.min(100, x)),
  y: Math.max(0, Math.min(180, y)),
  spread: 12,
  region,
});

export const regionForPoint = (x: number, y: number): string => {
  if (y < 47) return 'head';
  if (y < 64) return 'throat';
  if (y < 89) return 'chest';
  if (y < 116) return 'stomach';
  if (y < 143) return 'hips';
  return 'legs';
};
