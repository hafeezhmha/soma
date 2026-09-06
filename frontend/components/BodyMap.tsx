'use client';

import { useId, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { Mark } from '@/lib/types';
import { bodyAreas, bodyRegionAt, spreadForDistance } from './body-map-geometry';
import './body-map.css';

type BodyMapProps = {
  marks: Mark[];
  selectedId?: string;
  onPlace: (mark: Mark) => void;
  onRemove: (id: string) => void;
  onSelect: (id: string) => void;
  readOnly?: boolean;
};

// A single, quiet contour: a neutral standing body, with room between arms and torso.
const bodyOutline = `M44 29
  C40 27 38.5 22 38.5 17 C38.5 9.5 42.5 5 50 5
  C57.5 5 61.5 9.5 61.5 17 C61.5 22 60 27 56 29
  L56 34 C58 36 62.5 37 66.5 38.5
  C71 40 73.5 44 75 49 L82 74 L87 93
  C88 96 89.5 99 89 102 C88.5 105 86 106 84 103
  L80 97 C78 94 77 89 75.5 85 L66 59
  C64.5 64 64 69 64.5 75 C65 82 68 89 67.5 97
  C67 108 64.5 117 63.5 127 L62.5 146 L62 164
  C62 167 66 169 66.5 172 C67 174 64 175 60.5 175
  L57 175 C54.5 175 54 173.5 54 171 L54.5 148
  C54.5 139 53 132 52 124 L50 110
  L48 124 C47 132 45.5 139 45.5 148 L46 171
  C46 173.5 45.5 175 43 175 L39.5 175
  C36 175 33 174 33.5 172 C34 169 38 167 38 164
  L37.5 146 L36.5 127 C35.5 117 33 108 32.5 97
  C32 89 35 82 35.5 75 C36 69 35.5 64 34 59
  L24.5 85 C23 89 22 94 20 97 L16 103
  C14 106 11.5 105 11 102 C10.5 99 12 96 13 93
  L18 74 L25 49 C26.5 44 29 40 33.5 38.5
  C37.5 37 42 36 44 34 Z`;

export default function BodyMap({ marks, selectedId, onPlace, onRemove, onSelect, readOnly = false }: BodyMapProps) {
  const id = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<{ mark: Mark; pointerId: number; dragged: boolean } | null>(null);
  const [draft, setDraft] = useState<Mark | null>(null);
  const [area, setArea] = useState('Chest');
  const [announcement, setAnnouncement] = useState('');
  const selected = marks.find((mark) => mark.id === selectedId) ?? marks[0];

  const pointForEvent = (event: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(matrix.inverse());
  };

  const newMark = (x: number, y: number): Mark => ({
    id: `mark-${crypto.randomUUID()}`,
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    spread: 12,
    region: bodyRegionAt(x, y),
  });

  const place = (mark: Mark) => {
    onPlace(mark);
    setAnnouncement(`Mark placed at ${mark.region}.`);
  };

  const startPlacement = (event: PointerEvent<SVGSVGElement>) => {
    if (readOnly || !event.isPrimary || event.button !== 0 || !(event.target instanceof SVGPathElement)) return;
    const point = pointForEvent(event);
    if (!point) return;
    const mark = newMark(point.x, point.y);
    gesture.current = { mark, pointerId: event.pointerId, dragged: false };
    setDraft(mark);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const movePlacement = (event: PointerEvent<SVGSVGElement>) => {
    const active = gesture.current;
    if (readOnly || !active || active.pointerId !== event.pointerId) return;
    const point = pointForEvent(event);
    if (!point) return;
    const distance = Math.hypot(point.x - active.mark.x, point.y - active.mark.y);
    if (distance > 3) active.dragged = true;
    if (active.dragged) {
      active.mark = { ...active.mark, spread: spreadForDistance(distance) };
      setDraft(active.mark);
    }
  };

  const finishPlacement = (event: PointerEvent<SVGSVGElement>) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    gesture.current = null;
    setDraft(null);
    if (!readOnly) place(active.mark);
  };

  const cancelPlacement = () => {
    gesture.current = null;
    setDraft(null);
  };

  return (
    <div className={`soma-map${readOnly ? ' soma-map--readonly' : ''}`}>
      <div className="soma-map__orientation" aria-hidden="true"><span>Front of body</span><span>{marks.length ? `${marks.length} ${marks.length === 1 ? 'mark' : 'marks'}` : 'A place to notice'}</span></div>
      <div className="soma-map__figure">
        <svg
          ref={svgRef}
          className="soma-map__canvas"
          viewBox="0 0 100 180"
          role="img"
          aria-labelledby={`${id}-title ${id}-description`}
          onPointerDown={startPlacement}
          onPointerMove={movePlacement}
          onPointerUp={finishPlacement}
          onPointerCancel={cancelPlacement}
          onLostPointerCapture={cancelPlacement}
        >
          <title id={`${id}-title`}>Body map, front view</title>
          <desc id={`${id}-description`}>{readOnly ? `${marks.length} marked sensations. ${marks.map((mark) => mark.region).join(', ')}.` : 'Tap inside the outline to place a sensation. Drag outward as you place it to show its spread. You can also choose an area below.'}</desc>
          <path className="soma-map__outline" d={bodyOutline} />
          {marks.map((mark) => (
            <g key={mark.id} className="soma-map__ink" aria-hidden="true">
              <circle className={`soma-map__spread${selected?.id === mark.id ? ' soma-map__spread--selected' : ''}`} cx={mark.x} cy={mark.y} r={mark.spread} />
              <circle className="soma-map__dot" cx={mark.x} cy={mark.y} r="2.3" />
            </g>
          ))}
          {draft && !readOnly && <g className="soma-map__ink" aria-hidden="true"><circle className="soma-map__spread soma-map__spread--selected" cx={draft.x} cy={draft.y} r={draft.spread} /><circle className="soma-map__dot" cx={draft.x} cy={draft.y} r="2.3" /></g>}
        </svg>
        {!readOnly && marks.map((mark, index) => (
          <button
            key={mark.id}
            type="button"
            className="soma-map__target"
            style={{ left: `${mark.x}%`, top: `${mark.y / 1.8}%` }}
            aria-label={`Select ${mark.region} sensation, mark ${index + 1}`}
            aria-pressed={selected?.id === mark.id}
            onClick={() => onSelect(mark.id)}
          />
        ))}
      </div>

      {!readOnly && <p className="soma-map__hint">Tap where you feel it.<br /><span>Drag outward to show how far it spreads.</span></p>}

      {marks.length > 0 && <div className="soma-map__selection">
        <div className="soma-map__marks" aria-label="Marked sensations">
          {marks.map((mark, index) => readOnly ? (
            <span key={mark.id} className="soma-map__mark-label"><span className="soma-map__swatch" />{mark.region}</span>
          ) : (
            <button key={mark.id} type="button" className={`soma-map__mark-label${selected?.id === mark.id ? ' soma-map__mark-label--selected' : ''}`} aria-label={`Select ${mark.region} sensation, mark ${index + 1}`} aria-pressed={selected?.id === mark.id} onClick={() => onSelect(mark.id)}><span className="soma-map__swatch" />{mark.region}</button>
          ))}
        </div>
        {selected && !readOnly && <>
          <div className="soma-map__spread-heading"><label htmlFor={`${id}-spread`}>Spread of this sensation</label><button type="button" className="soma-map__remove" aria-label={`Remove selected ${selected.region} sensation`} onClick={() => { onRemove(selected.id); setAnnouncement(`Removed ${selected.region} mark.`); }}>Remove</button></div>
          <input id={`${id}-spread`} className="soma-map__range" type="range" min="4" max="26" step="1" value={selected.spread} aria-valuetext={selected.spread < 10 ? 'Focused' : selected.spread < 19 ? 'Some spread' : 'Wide spread'} onChange={(event) => onPlace({ ...selected, spread: Number(event.target.value) })} />
          <div className="soma-map__range-labels" aria-hidden="true"><span>Focused</span><span>Widespread</span></div>
        </>}
      </div>}

      {!readOnly && <details className="soma-map__area-picker">
        <summary>Choose an area instead<span aria-hidden="true">+</span></summary>
        <div className="soma-map__area-controls"><label className="soma-map__sr-only" htmlFor={`${id}-area`}>Body area</label><select id={`${id}-area`} value={area} onChange={(event) => setArea(event.target.value)}>{bodyAreas.map((item) => <option key={item.name}>{item.name}</option>)}</select><button type="button" onClick={() => { const point = bodyAreas.find((item) => item.name === area)!; place(newMark(point.x, point.y)); }}>Place mark</button></div>
      </details>}
      <span className="soma-map__sr-only" role="status" aria-live="polite">{announcement}</span>
    </div>
  );
}
