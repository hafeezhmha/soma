# Clearing — Interactive Prototype

A clickable prototype of **Clearing**, built on the locked design system
([`../design.md`](../design.md)) and the spine defined in
[`../CONTEXT.md`](../CONTEXT.md): *felt sensation → body map → named part.*

**Live (editable canvas + PNG/PDF export):**
https://claude.ai/code/artifact/c03e7bf5-6d15-47e5-aa2e-be027fa017f5

## Screens (one navigable app)

1. **Check in** — "How are you feeling?" mood chips + an inner-*weather* selector (Stormy → Sunny).
2. **Body map** — a full body outline; tap *anywhere* to place a sensation, then shape it by **colour, texture, movement**. Multiple marks supported; tap a mark to reselect it.
3. **Soma** — a working chat with the AI companion, plus quick practices and "name a part from this".
4. **Dashboard** — a **window-of-tolerance** chart across the week and your **parts** as character tiles (tap to open a part page).

Bottom nav switches Check in / Body / Soma / Parts. Saving a part in the naming
step adds it to the dashboard live.

## Files

- `Main.dc.html` — the whole app (Claude Design "Design Component" source: markup + logic).
- `canvas.json` — canvas layout / launch view.
- `clearing-prototype.html` — the built, self-contained canvas (open in a browser to view/export).

To rebuild after editing `Main.dc.html`, re-seed with the Claude Design helper and republish to the same URL above.

## Honest status (midpoint)

Real: navigation, freeform body mapping, colour/texture/movement per mark,
Soma chat, live part creation. Sample data: the seeded parts and the
window-of-tolerance chart. Character art is a **placeholder** (generation is planned).
