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
  identifies (e.g. "teenager part", "anxious protector"). A Part is *anchored to
  a body location* discovered via the Body Map.
- **Check-in** — the entry ritual: a short "how are you feeling?" prompt that opens
  a session before body mapping.
- **AI Assistant** — the central conversational agent. Guides check-ins, helps name
  Parts from Sensations, and (secondarily) runs guided meditations.
- **Dashboard** — review surface showing trends over time and a visualisation of
  the user's discovered Parts.
