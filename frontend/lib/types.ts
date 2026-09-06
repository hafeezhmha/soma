export type Stage =
  | 'landing'
  | 'locate'
  | 'sensation'
  | 'intensity'
  | 'regulate'
  | 'recheck'
  | 'explore'
  | 'name'
  | 'summary'
  | 'safety'
  | 'dashboard'
  | 'part';

export type Mark = {
  id: string;
  x: number;
  y: number;
  spread: number;
  region: string;
  color?: string;
  textures?: string[];
  movement?: string;
};

export type Session = {
  sessionId?: string;
  moods?: string[];
  weather?: string;
  marks?: Mark[];
  displayName?: string;
  sourceSensation: string;
  bodyLocation: string;
  mark: Mark;
  sensation: string;
  intensityBefore: number;
  intensityAfter: number;
  partName: string;
  concern?: string;
  date: string;
};

export type Part = {
  id: string;
  name: string;
  color: string;
  model?: string;
  description: string;
  activations: number;
  lastSeen: string;
  attributes?: Array<{ key: string; value: string; recorded_at?: string }>;
  activationsList?: Activation[];
};

export type Activation = {
  id?: string;
  part_id?: string;
  date?: string;
  activated_at?: string;
  body_region?: string;
  source_sensation?: string;
  intensity_before?: number;
  intensity_after?: number;
  name?: string;
  attributes?: Array<{ key: string; value: string; recorded_at?: string }>;
};
