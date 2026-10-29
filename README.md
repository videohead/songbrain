# Song Brain

A text to MIDI harmonic composition environment where you are encouraged to explore chord progressions and chord combinations, set styles for specific song parts, and copy paste as text. Playback, MIDI and MusicXML are derived from the chords that you enter, and style choices that you make. You can also use an agentic LLM to explore your ideas and make modifications to the chord structure and styles directly in the interface, after connecting an LLM via an Open AI interface of MCP (included).

## Runs with Docker

```bash
cp .env.example .env        # set LLM_BASE_URL / LLM_API_KEY / LLM_MODEL
docker compose --profile dev up --build      # Dev hot reload at http://localhost:5173
docker compose --profile prod up --build     # production build
```

## Instruments and MIDI output

Open **Mixer** in the transport bar. Each track has a General MIDI instrument, a MIDI channel, level, pan, reverb send, mute and solo, plus a voicing style for comp tracks or a bass-line style for bass tracks. These live in the song JSON and are carried into MIDI and MusicXML export. Choose a Web MIDI output port to play through your DAW or hardware synth (Chrome, Edge, Firefox); the built-in synths are the fallback and the default.

## Styles

Chords say what; a **style** says how: comping rhythm and arpeggiation, bass-line pattern, drum pattern, and feel (swing, push-pull timing, accents). Pick a default style in the transport bar and override it per section in each section header. Built-in styles: Swing, Bossa Nova, Ballad, Straight 8ths, Funk, Minneapolis Pop-Funk (the default). Each has an **A** (verse) and **B** (chorus) substyle, toggled per section; patterns have weighted variations, fills on the last bar of a section, optional intro and ending, per-hit pushes (anticipating the next chord) and chord-type conditions. Variation choice is deterministic from the arrangement's seed, so playback and export match. Styles are JSON documents separate from the song; custom and learned ones are saved as one JSON file per style in the repo's `styles/` directory (tracked in git, so `git add styles/` to keep them; bind-mounted in both Docker profiles, override with `STYLES_DIR`) and can be embedded in the song for portability. Drums follow the style and export to MIDI (channel 10) and JSON.

**Learn a style from MIDI.** Submit a chord chart played by any MIDI application, such as a DAW, an intelligent automatic accompaniment program or a MIDI accompaniment generator program: enter the chart there, export a type 1 MIDI file, open the same chart in Song Brain, then press **Train style** in the top bar (drop the file, name it; add a B substyle with a second file). **Help (?)** has a step-by-step guide and a built-in 32-bar **training chart** designed for this (Load training chart). Count-in and ending bars are detected, tracks are assigned to comp/bass/drums, swing and push-pull are measured, and each bar becomes a weighted pattern variation. The style is saved to the library and set as the song's default.

## Style editor

**Style editor** (transport bar): lanes for comp, bass and drums with draggable hits, variation and fill tabs, A/B substyles, feel knobs (swing, push-pull, humanize, accents, per-role push-pull), loop audition of the current section, Duplicate-to-edit for presets, Save to library. An agent may edit the same documents through MCP calls `ListStyles`, `GetStyle`, `UpdateStyle`, `SaveStyle`, `SetSectionStyle`, `SetTransition` and `AuditionStyle`.

**Roland PMA-5.** **Open…** accepts a PMA-5 bulk backup (`.syx`). Song Brain lists the songs and user styles in it; a song loads as a chord chart (chords, meter, tempo), and user styles are converted with the same learner as **Train style**. Written from the format notes in [pma5tool](https://github.com/richb93/pma5tool)'s `PROTOCOL.md` (no code copied); see `src/engine/import/pma5.ts`. Not yet verified against real hardware dumps; `.blk` files are not read.

## Lead sheet, analysis and import

Switch the editor between **Chord grid** and **Lead sheet** (rendered with OpenSheetMusicDisplay from the MusicXML export; read-only). The grid's **Analysis** toggle shows Roman numerals and harmonic function under each chord. **Open…** accepts Song Brain JSON or a MusicXML lead sheet (`.musicxml` / `.xml`).

# Technical Information

## Tests

```bash
docker compose --profile dev run --rm songbrain-dev npm test
```

## Layout

- `src/model/song.ts` – the JSON song model and validator
- `src/engine/harmony.ts` – chord parsing, transposition, Roman-numeral analysis (tonal)
- `src/engine/voicing.ts` – voicing styles (rootless, shell, drop-2, guitar, close) with voice leading; bass lines (roots, roots & fifths, walking)
- `src/engine/progression.ts` – structural edits: transpose, insert/replace/delete measures, sections
- `src/model/style.ts`, `src/engine/style/` – style documents, built-in presets, feel application, per-section resolution
- `src/engine/schedule.ts` – song + styles → tick-based per-track note events (shared by playback and MIDI export)
- `src/engine/playback.ts` – transport, cursor, loop; sends notes to `output.ts` (Web MIDI sink or Tone synth sink)
- `src/engine/export/` – JSON, MIDI (SMF type 1, one track per song track), MusicXML lead sheet with per-track `<midi-instrument>`
- `src/engine/import/` – SMF reader (for the style learner) and MusicXML lead-sheet import
- `src/engine/style/learn.ts` – MIDI-to-style learner
- `src/agent/` – tool schemas and executors, the `ChatAdapter` interface the chat panel depends on, and per-browser LLM settings
- `src/ui/` – React: chord grid, transport/export bar, agent chat panel
- `server/` – Express: serves the app, relays tool calls to the editor tab (`relay.ts`), serves MCP (`mcp.ts`), runs the chat panel's streamed agent loop (`agent.ts`)

## Agentic Tools and Connectors

Any OpenAI-compatible endpoint works (OpenAI, LiteLLM, NVIDIA NIM, Ollama, vLLM, LM Studio). The `.env` values are the server defaults. Each browser can override server URL, API key and model from the ⚙ button in the Agent panel; "Load models" lists what the endpoint serves. The chat loop runs on the server and executes tools through the same relay MCP clients use.

## Connect an MCP client

The server exposes the song tools over MCP (Streamable HTTP) at `http://localhost:5173/mcp`. Keep a browser tab open: it holds the song, and the server relays each tool call to it.

Claude example:
```bash
# Claude Code
claude mcp add --transport http songbrain http://localhost:5173/mcp
```

