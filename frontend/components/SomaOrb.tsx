'use client';

import { useState, type CSSProperties, type PointerEvent } from 'react';
import './soma-orb.css';

export type SomaOrbMode = 'idle' | 'listening' | 'thinking' | 'speaking';

export type SomaOrbProps = {
  mode: SomaOrbMode;
  level: number;
  onStop?: () => void;
};

type Tilt = {
  x: number;
  y: number;
};

const modeLabels: Record<SomaOrbMode, string> = {
  idle: 'Ready when you are',
  listening: 'Listening',
  thinking: 'Taking a moment',
  speaking: 'Speaking · Tap to stop',
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export default function SomaOrb({ mode, level, onStop }: SomaOrbProps) {
  const [tilt, setTilt] = useState<Tilt>({ x: 0, y: 0 });
  const normalizedLevel = Number.isFinite(level) ? clamp(level, 0, 1) : 0;
  const status = modeLabels[mode];

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!event.isPrimary) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const horizontal = (event.clientX - bounds.left) / bounds.width - 0.5;
    const vertical = (event.clientY - bounds.top) / bounds.height - 0.5;
    setTilt({ x: clamp(horizontal * 12, -6, 6), y: clamp(vertical * -12, -6, 6) });
  };

  const resetTilt = () => setTilt({ x: 0, y: 0 });
  const orbStyle = {
    '--orb-level': normalizedLevel,
    '--orb-tilt-x': `${tilt.x}deg`,
    '--orb-tilt-y': `${tilt.y}deg`,
  } as CSSProperties;
  const orbClassName = `soma-orb__control soma-orb__control--${mode}`;

  const orbVisual = (
    <span className="soma-orb__visual" aria-hidden="true">
      <span className="soma-orb__aura" />
      <span className="soma-orb__orbit soma-orb__orbit--outer" />
      <span className="soma-orb__orbit soma-orb__orbit--inner" />
      <span className="soma-orb__body">
        <span className="soma-orb__sheen" />
        <span className="soma-orb__core" />
      </span>
    </span>
  );

  return (
    <div className={`soma-orb soma-orb--${mode}`} style={orbStyle}>
      {mode === 'speaking' ? (
        <button
          type="button"
          className={orbClassName}
          aria-label="Stop speaking"
          onClick={() => onStop?.()}
          onPointerMove={handlePointerMove}
          onPointerLeave={resetTilt}
        >
          {orbVisual}
        </button>
      ) : (
        <div
          className={orbClassName}
          aria-hidden="true"
          onPointerMove={handlePointerMove}
          onPointerLeave={resetTilt}
        >
          {orbVisual}
        </div>
      )}
      <p className="soma-orb__status" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
