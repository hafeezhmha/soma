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
  page it appears as its **character**. The character is user-directed, never a
  generic stock avatar; it never appears on the body map or check-in.
- **Check-in** — the entry ritual: a short "how are you feeling?" prompt that opens
  a session before body mapping.
- **Soma** — the central conversational AI agent (the app itself is **Clearing**).
  Guides check-ins, helps name Parts from Sensations, runs guided meditations.
  **Authority rule:** the *user* supplies all meaning (names, attributes, moods);
  Soma only *proposes* and then *persists/structures* what the user states. Soma
  never silently invents or asserts a Part's feelings. Naming is user-confirmed.
- **Part attributes** — evolving, user-supplied descriptors on a Part (mood/state,
  appearance, the Sensation that surfaced it), each stamped with a date. Attributes
  change over time; history is retained (e.g. "Sept 5: teenage part feeling saucy").
- **Dashboard** — review surface. Lets the user open an individual Part and see its
  current state + historical timeline, plus trends across Parts over time.

