SOMA — MVP Product Requirements Document

Version: 0.1
Product: SOMA
Platform: Web
Stage: Hackathon MVP
Core technologies: Claude, ElevenLabs STT/TTS, Vector DB/RAG, Next.js, Python/FastAPI

1. Product Summary

SOMA is a voice-first, body-aware emotional regulation companion.

When someone feels overwhelmed, anxious, stuck, irritated, tense, or otherwise emotionally activated, SOMA does not immediately ask them to explain why.

Instead, SOMA guides them through:

Notice → Locate → Regulate → Recheck → Explore → Reflect

The user first describes what is happening in ordinary language. SOMA helps them locate the experience physically using an interactive body map, guides them through an appropriate short regulation exercise, and only after the intensity has reduced invites gentle IFS-informed curiosity about what may be happening internally.

IFS is the underlying framework, not terminology the user needs to understand.

SOMA is not a therapist, diagnostic system, or replacement for professional mental-health care.

2. Problem

When emotionally activated, people frequently have two simultaneous problems:

Problem A: Regulation

“Something is happening and I need to calm down.”

Problem B: Understanding

“I don't actually know why I'm reacting this strongly.”

Most conversational AI systems immediately attack Problem B.

User:

“I'm freaking out about my presentation.”

AI:

“You may be experiencing performance anxiety. Here are five strategies…”

This requires the person to cognitively process advice while already activated.

SOMA reverses the sequence.

First:

Where is this happening in your body?

Then:

Can we make a little room around it?

Only afterward:

What might this reaction be trying to do for you?

3. Product Hypothesis

If a user can:

notice an emotional state,
connect it to physical sensations,
regulate sufficiently to observe rather than immediately react,
approach the remaining feeling with curiosity,

then they may be better positioned to understand their internal response.

IFS provides a useful conceptual framework because instead of treating resistance, fear, avoidance, anger, etc. as something that needs to be defeated, SOMA can approach them as potentially protective responses worth understanding.

4. Design Principle

The fundamental SOMA loop is:

FEEL
 ↓
LOCATE
 ↓
REGULATE
 ↓
NOTICE AGAIN
 ↓
GET CURIOUS
 ↓
UNDERSTAND

SOMA should never rush toward interpretation.

The product should feel like:

“Let's notice what's happening.”

not:

“Let me psychoanalyse you.”

5. Target User

MVP does not target ADHD specifically.

Primary user:

Someone experiencing an uncomfortable emotional state who has enough capacity to engage in a short guided reflection.

Examples:

“I'm really anxious about this interview.”

“Someone said something and now I'm weirdly angry.”

“I know I need to work but something in me really doesn't want to.”

“I feel overwhelmed and don't even know what's wrong.”

“I keep thinking about this conversation.”

No prior understanding of IFS should be required.

6. Jobs To Be Done
Primary JTBD

When I'm emotionally activated, help me regulate enough to understand what is happening inside me.

Secondary JTBD

Help me notice where emotions appear physically.

Help me approach difficult internal reactions without immediately fighting them.

Help me articulate something I'm feeling but can't explain.

Give me a useful reflection I can leave the session with.

7. MVP User Journey
Stage 0 — Landing

Extremely minimal.

                         soma


             What's happening right now?


             [ Hold to talk ]

             or type what's going on

Optional secondary text:

You don't need to know exactly what you're feeling.

No onboarding questionnaire.

No:

“Do you know IFS?”
mental-health history
account creation
personality configuration
diagnosis selection

Get the user into the experience immediately.

8. Stage 1 — Check-in

User speaks:

“I have to present something in an hour and I'm freaking out.”

ElevenLabs STT produces transcript.

SOMA should respond empathetically but briefly.

Example:

“Okay. We don't need to solve the presentation yet. Let's notice what's happening right now.”

Then:

“Where do you feel it most strongly in your body?”

Trigger:

{
  "ui_action": "SHOW_BODY_MAP"
}
9. Stage 2 — Body Mapping

Display human silhouette.

Ideally:

Front / Back

Clickable MVP regions:

head
face
jaw
throat
shoulders
chest
stomach
upper back
lower back
arms
hands
legs

User clicks chest.

SOMA asks:

“What does it feel like there?”

Quick-select chips:

Tight

Heavy

Hot

Cold

Fluttery

Numb

Pressure

Tingling

Something else

User selects:

Tight

Then:

“How strong is it right now?”

Slider:

1 ─────────────●── 10

                 8

Store:

{
  "region": "chest",
  "sensation": "tightness",
  "intensity_before": 8
}
10. Stage 3 — Regulation

SOMA retrieves an appropriate low-risk regulation technique from the knowledge base.

MVP techniques should be limited.

A. Slow breathing

Useful for general activation.

B. Orienting

Example:

“Without moving much, slowly notice three things around you.”

C. Grounding

Example:

“Notice where your body is supported by the chair.”

D. Sensation observation

Example:

“Without trying to change the tightness, notice its edges.”

Do not let Claude invent arbitrary therapeutic exercises.

Retrieve from approved content.

SOMA guides the exercise through voice.

Approximately:

30–90 seconds.

11. Stage 4 — Recheck

After regulation:

“Notice your chest again.”

“How strong is the tightness now?”

User:

5/10

Store:

{
  "intensity_before": 8,
  "intensity_after": 5
}

Do not frame lack of reduction as failure.

If:

8 → 8

SOMA might say:

“That's okay. We don't need it to disappear.”

The objective is awareness and sufficient regulation, not forcing a particular numerical outcome.

12. Stage 5 — IFS-Informed Curiosity

This is where SOMA becomes differentiated.

SOMA should not immediately assign a Part.

Bad:

“This sounds like a Manager part.”

Good:

“If it feels okay, let's get curious about the part of you that's worried about this presentation.”

Then:

“What does it seem worried might happen?”

User:

“That I'll mess up and everyone will think I don't know what I'm doing.”

SOMA:

“And if people thought that, what would feel difficult about it?”

User:

“I'd feel incompetent.”

SOMA might eventually reflect:

“It sounds like something in you is working pretty hard to protect you from feeling incompetent in front of other people.”

This is IFS-informed language without turning the experience into an IFS lesson.

13. IFS Interaction Principles

SOMA should generally move through:

Notice

What is happening?

Focus

Which sensation/emotional response feels most present?

Separate slightly

Can the user observe the experience rather than completely identify with it?

Instead of:

“I am terrified.”

Move gently toward:

“There's a lot of fear here.”

Curiosity

What does this response want?

Protective intention

What might it be trying to prevent?

Need

What would help it feel slightly safer?

Action

What does the user want to do next?

This roughly draws from IFS principles without forcing a formal IFS session.

14. The Key UX Principle

One question at a time.

Never:

“Where do you feel it, what does it feel like, what do you think caused it, and what might that part be protecting you from?”

Instead:

Where do you notice it?

wait.

What does it feel like?

wait.

How strong is it?

wait.

This is particularly important when someone is emotionally activated.

15. Session Completion

SOMA should recognize when sufficient insight has emerged.

It should not continue asking:

“And what does THAT part say?”

forever.

This directly addresses a weakness in some existing AI IFS experiences.

SOMA asks:

“Would you like to stay with this a little longer, or does this feel like enough for now?”

Then generates a summary.

16. Session Summary

Example:

What happened

You came in feeling

Overwhelmed about an upcoming presentation.

You noticed

Chest · tightness

Intensity

8 → 5

What emerged

Something in you seemed particularly worried about appearing incompetent in front of other people.

What it may have been protecting

Your sense of competence and how others see you.

What helped

Grounding and staying with the physical sensation before trying to explain it.

Right now

You feel more able to return to preparing for the presentation.

17. Body Map Visualization

The body map should become part of the session story.

Initial:

       ○
      /|\
     / █ \
       █        ← chest
      / \

After session, maintain the highlighted location.

Potential post-MVP:

Multiple sensations could create a personal emotional-body map over time.

For example:

Anxiety       → chest
Embarrassment → face
Stress        → shoulders
Anger         → jaw + hands

That is not MVP, but it creates an obvious future direction.

18. Conversation State Machine

Do not make the entire experience one unconstrained agent.

CHECK_IN
    ↓
BODY_LOCATION
    ↓
BODY_SENSATION
    ↓
INTENSITY
    ↓
REGULATION
    ↓
RECHECK
    ↓
IFS_EXPLORATION
    ↓
REFLECTION
    ↓
COMPLETE

Additional state:

SAFETY

which can interrupt normal flow.

19. Session State Schema
SessionState:

    id: UUID

    stage:
        CHECK_IN |
        BODY_LOCATION |
        BODY_SENSATION |
        INTENSITY |
        REGULATION |
        RECHECK |
        IFS_EXPLORATION |
        REFLECTION |
        COMPLETE

    initial_statement: str

    emotion:
        label: Optional[str]

    body:
        region: Optional[str]
        sensation: Optional[str]
        intensity_before: Optional[int]
        intensity_after: Optional[int]

    regulation:
        technique: Optional[str]
        completed: bool

    exploration:
        concern: Optional[str]
        protective_intention: Optional[str]
        possible_need: Optional[str]

    transcript: list[Message]

    safety:
        flagged: bool
20. Agent Architecture

For MVP:

ONE agent.

Not:

regulation agent
IFS agent
somatic agent
safety agent
reflection agent

That complexity buys you very little.

Use:

              SESSION STATE
                    │
                    ▼
USER ──────→ ORCHESTRATOR
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
     Safety Check        RAG Retrieval
                              │
                              ▼
                         IFS Knowledge
                         Regulation
                         Boundaries
                              │
          └──────────┬──────────┘
                     ▼
                   CLAUDE
                     │
                     ▼
            Structured Response
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
       UI action              Speech
                              │
                              ▼
                         ElevenLabs
21. Claude Responsibility

Claude can:

understand natural-language descriptions
choose wording
ask context-sensitive questions
reflect what the user has said
recognize possible internal conflicts
decide which approved information is relevant
summarize a session
suggest state progression

Claude cannot autonomously:

diagnose
assign trauma
identify memories as factual
decide someone has a psychiatric condition
perform unrestricted trauma exploration
invent regulation techniques
override safety rules
22. Agent Output Contract

Every Claude response returns structured output.

{
  "message": "Where do you notice that most strongly in your body?",

  "current_stage": "BODY_LOCATION",

  "suggested_next_stage": "BODY_SENSATION",

  "ui_action": {
    "type": "SHOW_BODY_MAP"
  },

  "observations": {
    "emotion": "anxiety"
  },

  "retrieval_needed": false,

  "safety": {
    "flagged": false
  }
}

Frontend displays message.

TTS speaks message.

Application executes ui_action.

Backend updates approved observations.

23. RAG Architecture

Vector DB should contain curated knowledge, not random mental-health internet content.

Collections:

ifs
somatic_awareness
regulation
safety

Documents:

knowledge/

ifs/
    overview.md
    parts.md
    self.md
    protectors.md
    unblending.md
    six_fs.md
    polarization.md

somatic/
    body_awareness.md
    noticing_sensations.md
    orienting.md

regulation/
    grounding.md
    breathing.md
    sensory_grounding.md

safety/
    scope.md
    crisis.md
    contraindications.md
24. RAG Metadata

Every chunk:

{
  "framework": "IFS",
  "topic": "unblending",
  "stage": "IFS_EXPLORATION",
  "risk": "low",
  "source": "source_identifier"
}

During:

REGULATION

retrieve only:

stage = REGULATION
risk = low

During:

IFS_EXPLORATION

retrieve:

framework = IFS
stage = IFS_EXPLORATION

This prevents irrelevant retrieval.

25. Retrieval Strategy

Query should incorporate state, not just the last message.

Instead of embedding:

“Yeah my chest feels weird.”

Construct:

Stage: BODY_AWARENESS

User reports anxiety about presentation.
Primary sensation: tightness.
Body region: chest.
Intensity: 8/10.

Need guidance for observing physical sensation
without interpretation.

Retrieve top 3–5 chunks.

Then pass those to Claude.

26. ElevenLabs
STT
Microphone
   ↓
ElevenLabs STT
   ↓
Transcript
   ↓
SOMA
TTS
Claude structured output
   ↓
message
   ↓
ElevenLabs TTS
   ↓
Voice response

Voice should feel slow enough for reflection but not exaggeratedly “therapeutic.”

User must always be able to interrupt/stop playback.

27. Frontend

Recommended:

Next.js + TypeScript

Core components:

components/

SomaOrb.tsx
Conversation.tsx
VoiceInput.tsx
BodyMap.tsx
SensationPicker.tsx
IntensitySlider.tsx
RegulationGuide.tsx
ReflectionCard.tsx
SessionSummary.tsx

Main session page:

/session/[id]

Don't create multiple pages for every state.

The session UI transforms based on agent actions.

28. Backend

I'd use:

FastAPI + Python

Structure:

backend/

main.py

api/
    sessions.py
    messages.py
    voice.py

agent/
    orchestrator.py
    prompt.py
    schemas.py
    state_machine.py
    safety.py

rag/
    ingest.py
    retrieve.py
    embeddings.py

services/
    claude.py
    elevenlabs.py

models/
    session.py

knowledge/
29. Core Endpoints
Create session
POST /sessions

Returns:

{
  "session_id": "..."
}
Send message
POST /sessions/{id}/messages

Request:

{
  "text": "I'm really anxious about my presentation."
}

Response:

{
  "message": "...",
  "stage": "BODY_LOCATION",
  "ui_action": {
    "type": "SHOW_BODY_MAP"
  }
}
Body selection
POST /sessions/{id}/body
Regulation result
POST /sessions/{id}/regulation
Complete
POST /sessions/{id}/complete
30. Safety Requirements

This is part of MVP.

SOMA must not position itself as:

“your AI therapist”

Prefer:

“emotional awareness companion”

IFS interpretations must remain tentative.

Use:

“Could there be something in you that's worried about being judged?”

Never:

“Your protector developed because your parents judged you.”

Particularly avoid:

AI-generated causal stories.

The model doesn't know why someone's psychological pattern exists unless the user tells it.

31. High-Risk State

If user expresses immediate danger to themselves or another person, normal IFS exploration stops.

IFS_EXPLORATION
        ↓
   SAFETY FLAG
        ↓
      SAFETY

Do not continue:

“What does the suicidal part want you to know?”

The system should instead move to an appropriate safety-oriented response and encourage immediate human/emergency support where warranted.

32. Explicitly Out of Scope

For hackathon MVP, DO NOT BUILD:

authentication
social features
therapist portal
diagnosis
mood tracking dashboard
wearable integration
calendar integration
multiple agents
sophisticated long-term memory
full historical body maps
automatic psychological profiles
notifications
streaks
gamification
community
journaling platform
native mobile app

These will kill your build time.

33. MVP Build Priority

If time gets tight, cut features in this order:

Must work

Text conversation
      ↓
Body map
      ↓
Intensity
      ↓
Regulation
      ↓
Recheck
      ↓
IFS exploration
      ↓
Summary

Then:

Claude + RAG

Then:

ElevenLabs TTS

Then:

ElevenLabs STT

Voice is impressive, but the product logic matters more than voice.

34. Demo Scenario

Use exactly one rehearsed scenario.

User:

“I have to present our project in an hour and I'm freaking out.”

SOMA:

“We don't need to figure everything out yet. Where do you notice that feeling most strongly?”

Body map appears.

User taps:

Chest

SOMA:

“What does it feel like?”

Tight

Intensity:

8

SOMA guides grounding.

Recheck:

5

SOMA:

“There's a little more room now. If you're okay with it, what does the worried part of you think might happen during the presentation?”

User:

“I'll blank and everyone will think I don't know what I'm doing.”

SOMA:

“So something in you may be working pretty hard to keep you from feeling incompetent in front of everyone.”

Eventually:

“What would that part need to know before you walk into the presentation?”

Then summary.

35. Demo Ending

The visual payoff should be:

                  SOMA

              Your check-in


                  chest
                 tightness

                8  →  5
             before   after


          What came up

     "I'm scared I'll look like
       I don't know what I'm doing."


        What may be underneath

         Fear of being judged


             What helped

     Grounding · noticing · curiosity

Then your pitch:

“Most AI starts by trying to explain what you're feeling. SOMA starts by helping you notice it. We use the body to regulate first, and IFS-informed exploration to understand what's underneath only when you're ready.”

That gives you a coherent hackathon product rather than an AI therapist with a body-map feature bolted onto it.