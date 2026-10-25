# Song Brain

Song Brain is NOT a notation editor.

Song Brain is an agentic harmonic composition environment.

The core design principle is:

Chord Progressions are the source of truth.
Everything else is derived.

Derived artifacts include:

- MusicXML
- MIDI
- Playback
- Lead Sheet Rendering
- Style Arrangements
- Harmonic Analysis

## Product Philosophy

Band-in-a-Box:
Chord -> Style -> Audio

Song Brain:
Chord -> Musical Knowledge Graph -> Agent -> Output

The AI agent is a first-class feature, not an add-on.

All system components should expose structured musical objects that can be inspected and modified by agents.

## Internal Data Model

Do NOT use MusicXML as the internal representation.

Use structured JSON objects.

Example:

{
  "title": "Autumn Leaves",
  "key": "G Minor",
  "tempo": 140,
  "meter": "4/4",
  "sections": [
    {
      "name": "A",
      "measures": [
        {
          "chords": [
            {
              "symbol": "Cm7",
              "beats": 4
            }
          ]
        }
      ]
    }
  ]
}

MusicXML should be generated from this model.

## Agent Design Requirements

The user must be able to:

- Ask questions about harmony
- Request changes
- Apply transformations
- Analyze progressions
- Create new songs

Examples:

"Transpose to Bb"

"Make this more bebop"

"Insert a ii-V before measure 8"

"Explain measure 12"

"Convert to Bossa Nova"

Agent actions must manipulate structured musical data.

Never manipulate rendered notation directly.

## Architecture Principles

Keep all business logic separate from UI.

Required modules:

- Harmony Engine
- Progression Engine
- Style Engine
- Export Engine
- Playback Engine
- Agent Layer

## Technical Stack

Frontend:
- Everything gets built in Docker for portablility and extensibility
- React
- TypeScript
- Tailwind

Music Libraries:
- tonal.js
- Tone.js
- OpenSheetMusicDisplay or VexFlow

AI Layer:
- Provider agnostic
- OpenAI compatible interface

Persistence:
- JSON-first


Build only four bounded capabilities:

Chord chart grid
JSON song model
Tone.js playback
AI agent (MCP or API layer) with GetSong() and UpdateSong()

Everything else, including MusicXML export and style editing, can be layered on afterward. The moment an LLM can reliably inspect and modify a structured chord chart, you'll have proven the core thesis behind Song Brain.