# Context: Interoception → IFS Parts App (ADHD Tools Hackathon)

A glossary. Definitions only — no implementation details.

## Core spine

The app has one central loop: **felt sensation → body map → named part.**
The body map is not a standalone feature; it is the *interface for discovering
IFS parts*. Noticing a physical sensation is how a user locates a part.

## Terms

- **Sensation** — a physical, interoceptive signal the user notices in their body
  (e.g. tight chest, buzzing legs, heavy shoulders). The raw input to the loop.
- **Body Map** — an interactive body outline the user draws on (colour, location,
  intensity) to externalise a Sensation. It is the discovery interface for Parts.
- **Part** — an IFS (Internal Family Systems) internal sub-personality the user
  identifies (e.g. "teenager part", "anxious protector"). A Part is a **character**
  with its own visual identity, name, and evolving attributes. It is *anchored to a
  body location* discovered via the Body Map. Two representations by surface: on the
  Body Map it is a **mark** (dot + ring for location/spread); on the Dashboard/part
  page it appears as its **character** — a generated visual representation of the
  Part (full ambition; may be downgraded to text+colour under time pressure). The
  character is user-directed, never a generic stock avatar; it never appears on the
  body map or check-in.
- **Check-in** — the entry ritual: a short "how are you feeling?" prompt that opens
  a session before body mapping.
- **SOMA** — the app and its central conversational AI guide.
  Guides check-ins, helps name Parts from Sensations, runs guided meditations.
  **Authority rule:** the *user* supplies all meaning (names, attributes, moods);
  SOMA only *proposes* and then *persists/structures* what the user states. SOMA
  never silently invents or asserts a Part's feelings. Naming is user-confirmed.
- **Part attributes** — evolving, user-supplied descriptors on a Part (mood/state,
  appearance, the Sensation that surfaced it), each stamped with a date. Attributes
  change over time; history is retained (e.g. "Sept 5: teenage part feeling saucy").
- **Activation** — an instance of a Part showing up in a session. The atomic unit
  of history.
- **Session event** — the one record shape that powers all review: per session,
  `{ date, part_id, body_location, attributes[], source_sensation }`. Every Trend
  view is derived from these events; there is no separate per-view storage.
- **Trend** — a derived view over Session events. The **hero** trend is *Part
  activation over time* (which Parts, how often, lately). Other views (a Part's
  mood over dates, body geography, check-in feeling over days) derive from the same
  events and are rendered as time allows.
- **Dashboard** — review surface. Lets the user open an individual Part (character +
  attribute timeline) and see Trends across Parts, all derived from Session events.
