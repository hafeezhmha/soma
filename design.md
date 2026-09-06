# Clearing — Design System

Direction 1b. A quiet, near-white system for clients doing IFS parts work. Trust comes from restraint: generous air, almost no ornament, and one accent color that only ever marks a part.

This file is the source of truth. If a decision is not covered here, choose the quieter option.

---

## 1. Principles

1. **The body map is the primary object.** Every screen shows it, leads to it, or reflects on it. Nothing competes with it visually.
2. **A part is a character; on the body map it is placed as a mark.** A part has its own visual identity (name, colour, and character representation) that lives on the dashboard and part page. Where a part is *located in the body*, location and spread carry the meaning, so on the body map it is rendered as a mark — the character is not drawn onto the silhouette.
3. **Restraint reads as safety.** Low stimulation. No motion without a tap. No progress bars, streaks, scores, or badges.
4. **Color is meaning, never decoration.** If something is colored, it is a part. Everything else is greyed sage.
5. **The user can always stop.** Every flow has a visible, equally weighted way out. "Not now" is never smaller than the primary action.

---

## 2. Color

| Token | Hex | Use |
| --- | --- | --- |
| `bg` | `#fcfcfb` | Page ground. Default state of everything. |
| `surface` | `#eef1ec` | Cards, chips, filled inputs, inactive segments. |
| `line` | `#cdd6cb` | Hairlines, input underlines, body-map outline. |
| `line-quiet` | `#e4e7e2` | Container borders, section dividers. |
| `accent` | `#4a7360` | Part marks, primary button, active state. |
| `accent-soft` | `#b7c6b4` | Secondary part marks, spread rings, low intensity. |
| `ink-quiet` | `#576357` | Captions, hex labels, footnotes, metadata. |
| `ink-label` | `#5a6a5a` | Uppercase micro-labels. |
| `ink-body` | `#4a5450` | Body copy. |
| `ink` | `#2b322c` | Headings and primary text. |

```css
:root {
  --bg: #fcfcfb;
  --surface: #eef1ec;
  --surface-hover: #e7ebe5;
  --line: #cdd6cb;
  --line-quiet: #e4e7e2;
  --accent: #4a7360;
  --accent-hover: #446a58;
  --accent-soft: #b7c6b4;
  --ink-quiet: #576357;
  --ink-label: #5a6a5a;
  --ink-body: #4a5450;
  --ink: #2b322c;
  --placeholder: #9aa79a;
}
```

**Rules**

- One accent per screen. Two part marks share `accent` only if they are the same part family.
- `accent` is the only saturated color in the system. No error red, success green, or warning amber. Use `ink` with an italic qualifier instead.
- `accent-soft` is a fill color, never a text color.
- Body text never below 4.5:1 against its ground.
- Backgrounds never gradient. `surface` on `bg` is the entire depth model.

---

## 3. Typography

**Newsreader** (300, 300 italic): display and long-form reflective copy.
**Work Sans** (400, 500): UI, labels, anything the user acts on.

| Role | Font | Size / line-height | Notes |
| --- | --- | --- | --- |
| Display | Newsreader 300 | 40 / 1.05 | Screen titles, questions posed to the user. |
| Display italic | Newsreader 300 italic | 40 / 1.05 | Emphasis inside a display line. |
| Reflective body | Newsreader 300 | 17 / 1.6 | Journaling, part dialogue, prompts. Max 44ch. |
| UI body | Work Sans 400 | 15 / 1.5 | Lists, settings, descriptions. Max 60ch. |
| Control | Work Sans 400 | 13 / 1 | Buttons, chips. |
| Micro-label | Work Sans 500 | 10 / 1, `0.16em`, uppercase | Section labels. |
| Caption | Work Sans 400 | 11 / 1.5 | Metadata, timestamps, map legends. |

**Rules**

- Emphasis is italic, never bold. Bold appears nowhere in the client-facing product.
- Never set Newsreader below 15px. Never set Work Sans above 15px.
- One display line per screen. If a screen needs two, it needs to be two screens.
- Line length caps: 44ch reflective, 60ch UI body.

---

## 4. Space and shape

8px baseline grid. Steps: `4 · 8 · 16 · 24 · 32 · 48 · 64`.

- 64px between major sections.
- 24px between a label and its content.
- 10px between sibling controls.
- Page margin: 24px mobile, 44px tablet and up.
- **Controls fully rounded (`999px`). Containers square (`0`).** Nothing in between. No 8px or 12px radii anywhere.
- Inputs have no box. A single `line` underline with the label above.
- No shadows, ever. Separation is hairline or whitespace.

---

## 5. The body map

The one piece of custom geometry in the system.

- Silhouette is outline only: `1px` `line` on `bg`. Head circle, torso rounded rect, lower rounded rect. Never filled, never shaded, never anatomically detailed.
- **Dot = location.** 12px `accent` circle at the tap point.
- **Ring = spread.** Concentric `1px accent-soft` circle, 24 to 72px, set by dragging outward.
- **Multiple parts** stack as separate dot and ring pairs. Overlap is allowed and meaningful. Do not offset marks to avoid collision.
- No heat map, no gradient bleed, no pulse animation.
- Placing a mark is a single tap. Removing it is a tap on the dot. No delete confirmation.

**Legend:** dot swatch, 8px gap, part name in Work Sans 400 / 12px. Sits below the map, left-aligned, never as an overlay.

---

## 6. Components

| Component | Spec |
| --- | --- |
| Primary button | `accent` fill, `bg` text, `999px`, 12/24 padding, Work Sans 400 13px. |
| Secondary button | `line` 1px border, `ink-body` text, same geometry and padding minus border width. Always adjacent to the primary, same size. |
| Part chip | `surface` fill, `999px`, 8/14 padding, 7px accent dot, then part name in Work Sans 400 12px. |
| Prompt field | Newsreader 300 16px placeholder in `#9aa79a`, `line` bottom border, 14px vertical padding, no fill, no focus glow. Border darkens to `ink-body` on focus. |
| Section label | Micro-label in `ink-label`, 14px above its content. |
| Divider | 1px `line-quiet`, full content width, 32px clearance above and below. |

**States**

- **Hover:** `accent` darkens ~8%. `surface` darkens to `#e7ebe5`. Nothing scales or lifts.
- **Focus:** 1px `accent` outline, offset 2px. Keyboard focus only.
- **Disabled:** `ink-quiet` text on `surface`, no border. Never below 4.5:1.
- **Loading:** label is replaced by an italic Newsreader word ("listening…"). No spinners.

---

## 7. Copy

Soft and invitational. Plain language over clinical language. "A part of you" rather than "your protector part," unless the user named it themselves. Questions, not instructions. Never assume what a part is feeling: offer and let the user correct.

**Yes:** *Where do you feel it?* · *Would you like to stay with this?* · *Not now*
**No:** *Great job!* · *You've logged 5 days in a row* · *Let's fix this together*

---

## 8. Imagery

- **Parts are the one exception:** a part may have a character representation (its
  visual identity) shown on the dashboard and part page. It is the user's part, so
  its look is user-directed, not a generic stock avatar. It never appears on the body
  map (marks only there) and never on the check-in.
- No *other* illustration of people, faces, hands, or emotion. Imagery that is not a
  part stays absent.
- Photography, if used at all, is out-of-focus natural texture at low contrast, full-bleed, with nothing layered on top.
- Icons are 1.5px stroke, square-cornered, limited to navigation. Never decorative, never inside body copy.

---

## 9. Accessibility

- All text ≥ 4.5:1 against its ground. Display type ≥ 3:1 accepted only above 32px.
- Part identity is never carried by color alone. Every mark has a name in the legend.
- Touch targets ≥ 44px, including body-map dots (12px visual, 44px hit area).
- Respects `prefers-reduced-motion` by having almost no motion to reduce.

---

## 10. Never list

Fast check before shipping a screen.

- No bold text anywhere client-facing.
- No shadows, gradients, or elevation.
- No radii between 0 and 999px.
- No second saturated color.
- No spinners, progress bars, streaks, scores, badges.
- No motion that was not started by a tap.
- No faces, avatars, or emotion illustration — *except a part's own character on the dashboard/part page.*
- No two display lines on one screen.
- No primary action without an equally weighted way out.
