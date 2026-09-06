'use client';

import { useEffect } from 'react';
import type { CSSProperties } from 'react';
import type { Mark } from '@/lib/types';

let modelViewerRequested = false;
function useModelViewer() {
  useEffect(() => {
    if (modelViewerRequested || typeof document === 'undefined') return;
    modelViewerRequested = true;
    if (customElements.get('model-viewer') || document.querySelector('script[data-model-viewer]')) return;
    const script = document.createElement('script');
    script.type = 'module';
    script.src = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js';
    script.setAttribute('data-model-viewer', '');
    document.head.appendChild(script);
  }, []);
}

export const moodOptions = ['scattered', 'wired', 'heavy', 'foggy', 'tender', 'raw', 'quiet', 'okay'];
const colors = [ ['Ochre', '#c2a35a'], ['Clay', '#c58a6b'], ['Blue', '#7d9bb0'], ['Slate', '#6b6f76'], ['Green', '#4a7360'], ['Rose', '#b98a9e'] ];
const textures = ['Buzzing', 'Tight', 'Heavy', 'Fluttery', 'Numb', 'Warm'];

export function InnerWeather({ moods, weather, onMoods, onWeather, disabled }: { moods: string[]; weather: string; onMoods: (value: string[]) => void; onWeather: (value: string) => void; disabled: boolean }) {
  return <div className="inner-weather">
    <div className="chip-grid" role="group" aria-label="How you feel — choose all that fit">{moodOptions.map((mood) => <button type="button" key={mood} disabled={disabled} aria-pressed={moods.includes(mood)} className={`chip ${moods.includes(mood) ? 'chip-active' : ''}`} onClick={() => onMoods(moods.includes(mood) ? moods.filter((item) => item !== mood) : [...moods, mood])}>{mood}</button>)}</div>
    <p className="eyebrow">The weather inside</p><p className="body-copy">If your inner state had weather, what is it?</p>
    <div className="weather-options" role="group" aria-label="Your inner weather">{['Stormy', 'Cloudy', 'Clearing', 'Sunny'].map((item) => <button type="button" key={item} disabled={disabled} aria-pressed={weather === item} onClick={() => onWeather(weather === item ? '' : item)}>{item}</button>)}</div>
  </div>;
}

export function MarkQualities({ mark, onChange, disabled }: { mark?: Mark; onChange: (mark: Mark) => void; disabled: boolean }) {
  if (!mark) return <p className="caption">Place a mark, then choose its colour, texture, and movement.</p>;
  return <fieldset className="mark-qualities" disabled={disabled}><legend className="eyebrow">Shape this sensation · {mark.region}</legend>
    <p className="input-label">Colour</p><div className="color-options" role="group" aria-label="Sensation colour">{colors.map(([name, color]) => <button type="button" key={color} aria-label={name} aria-pressed={mark.color === color} style={{ backgroundColor: color }} onClick={() => onChange({ ...mark, color })} />)}</div>
    <p className="input-label">Texture · choose all that fit</p><div className="chip-grid" role="group" aria-label="Sensation textures">{textures.map((texture) => <button type="button" key={texture} className={`chip ${mark.textures?.includes(texture) ? 'chip-active' : ''}`} aria-pressed={mark.textures?.includes(texture) ?? false} onClick={() => onChange({ ...mark, textures: mark.textures?.includes(texture) ? mark.textures.filter((item) => item !== texture) : [...(mark.textures ?? []), texture] })}>{texture}</button>)}</div>
    <p className="input-label">Movement</p><div className="chip-grid" role="group" aria-label="Sensation movement">{['Still', 'Rising', 'Spreading', 'Pulsing'].map((movement) => <button type="button" key={movement} className={`chip ${mark.movement === movement ? 'chip-active' : ''}`} aria-pressed={mark.movement === movement} onClick={() => onChange({ ...mark, movement: mark.movement === movement ? undefined : movement })}>{movement}</button>)}</div>
  </fieldset>;
}

export function PartCharacter({ color, model, size = 92, interactive = false }: { color: string; model?: string; size?: number; interactive?: boolean }) {
  useModelViewer();
  const well: CSSProperties = { width: size, height: size, borderRadius: 999, background: `${color}1f`, display: 'grid', placeItems: 'center', overflow: 'hidden', flex: 'none' };
  if (!model) {
    return <div style={well}><svg className="part-character-art" viewBox="0 0 48 48" width={size * 0.62} height={size * 0.62} aria-hidden="true"><path d="M7 48 C7 37 15 33 24 33 C33 33 41 37 41 48 Z" fill={color} opacity=".3" /><circle cx="24" cy="18" r="10" fill={color} opacity=".42" /></svg></div>;
  }
  return <div style={well}>
    <model-viewer
      src={model}
      auto-rotate
      rotation-per-second="18deg"
      camera-controls={interactive ? true : undefined}
      disable-zoom
      interaction-prompt="none"
      exposure="1"
      shadow-intensity="0.4"
      environment-image="neutral"
      loading="eager"
      style={{ width: '100%', height: '100%', backgroundColor: 'transparent', pointerEvents: interactive ? 'auto' : 'none', ['--poster-color' as string]: 'transparent' }}
    />
  </div>;
}

export function NavigationIcon({ kind }: { kind: 'checkin' | 'body' | 'soma' | 'parts' }) {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind === 'checkin' ? <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></> : kind === 'body' ? <><circle cx="12" cy="5" r="2.6" /><path d="M12 8v8m0-6-5 2m5-2 5 2m-5 4-3 5m3-5 3 5" /></> : kind === 'soma' ? <path d="M20 12a8 8 0 0 1-8 8H5l1.6-3A8 8 0 1 1 20 12Z" /> : <><circle cx="8" cy="9" r="3.2" /><circle cx="16" cy="9" r="3.2" /><circle cx="12" cy="16" r="3.2" /></>}</svg>;
}
