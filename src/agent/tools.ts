/**
 * Agent Layer: tool definitions (OpenAI function-calling schema) and executors.
 * Tools only ever read or replace the structured Song model.
 */
import type { Measure, Song } from '../model/song';
import { totalMeasures, validateSong } from '../model/song';
import { analyzeProgression } from '../engine/harmony';
import { insertMeasures, measuresFromSymbols, replaceMeasures, transposeSong } from '../engine/progression';
import { normalizeStyle, validateStyle, type Style, type StyleV1, type Transition } from '../model/style';
import { DEFAULT_STYLE_ID, PRESET_STYLES } from '../engine/style/presets';
import { cloneSong } from '../model/song';

export interface EditorContext {
  /** 1-based global measure number at the playback/edit cursor. */
  cursorMeasure: number;
  /** Selected measure range (1-based, inclusive), or null when nothing is selected. */
  selection: { from: number; to: number } | null;
  playback: 'stopped' | 'playing' | 'paused';
}

export interface SongStore {
  get(): Song;
  set(song: Song, description: string): void;
  /** Optional: UI context so prompts like "make this more bebop" have a referent. */
  context?(): EditorContext;
  /** Optional: start looped playback of a section (used by AuditionStyle). */
  audition?(sectionIndex: number): void;
}

export interface ToolDefinition {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export const toolDefinitions: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'GetSong',
      description: 'Return { song, editor }. `song` is the current song JSON (title, key, tempo, meter, sections with measures and chords); `editor` has the cursor measure and selected measure range when a browser tab is connected. Call this before reasoning about or modifying the song. Pass `song` (not the whole result) to UpdateSong.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'UpdateSong',
      description: 'Replace the entire song with a new JSON object. Use for arbitrary edits (reharmonization, changing chords, renaming sections, changing tempo/meter/title). The chords in each measure must total the meter\'s beats. Always start from the result of GetSong and change only what the user asked.',
      parameters: {
        type: 'object',
        properties: {
          song: {
            type: 'object',
            description: 'Complete song object.',
            properties: {
              title: { type: 'string' },
              key: { type: 'string', description: 'e.g. "G Minor" or "Bb Major"' },
              tempo: { type: 'number' },
              meter: { type: 'string', description: 'e.g. "4/4"' },
              tracks: {
                type: 'array',
                description: 'Instrumentation and mix (optional). Copy unchanged from GetSong unless the user asks about instruments or levels.',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' }, name: { type: 'string' }, role: { type: 'string', enum: ['chords', 'bass', 'drums'] },
                    program: { type: 'integer', description: 'General MIDI program 0-127' }, channel: { type: 'integer', description: 'MIDI channel 1-16' },
                    level: { type: 'integer' }, pan: { type: 'integer' }, reverb: { type: 'integer' }, mute: { type: 'boolean' }, solo: { type: 'boolean' },
                    voicing: { type: 'string', enum: ['close', 'shell', 'rootless', 'drop2', 'guitar'], description: 'Chord voicing style (chords tracks)' },
                    bassStyle: { type: 'string', enum: ['roots', 'roots-fifths', 'walking'], description: 'Bass line style (bass tracks)' },
                  },
                  required: ['id', 'name', 'role', 'program', 'channel', 'level', 'pan', 'reverb', 'mute', 'solo'],
                },
              },
              arrangement: {
                type: 'object',
                description: 'Which playing style each section uses. sections maps section index (string) to a style id; defaultStyle applies elsewhere. Built-in ids: swing, bossa, ballad, straight8, funk.',
                properties: {
                  defaultStyle: { type: 'string' },
                  sections: { type: 'object', additionalProperties: { type: 'string' } },
                  substyles: { type: 'object', description: 'section index → "a" or "b" (B is the busier/chorus variant of the style)', additionalProperties: { type: 'string', enum: ['a', 'b'] } },
                  seed: { type: 'integer', description: 'Seed for deterministic pattern variation choice' },
                  fills: { type: 'boolean', description: 'Play drum/comp fills on the last bar of each section (default true)' },
                  transitions: { type: 'array', items: { type: 'object', properties: { beforeSection: { type: 'integer' }, bars: { type: 'number' }, kind: { type: 'string', enum: ['rush', 'relax'] }, amount: { type: 'number' } }, required: ['beforeSection', 'bars', 'kind', 'amount'] } },
                },
                required: ['defaultStyle'],
              },
              styles: { type: 'object', description: 'Embedded custom styles keyed by id. Copy unchanged unless asked to edit a style.', additionalProperties: true },
              sections: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    measures: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          chords: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: { symbol: { type: 'string' }, beats: { type: 'number' } },
                              required: ['symbol', 'beats'],
                            },
                          },
                        },
                        required: ['chords'],
                      },
                    },
                  },
                  required: ['name', 'measures'],
                },
              },
            },
            required: ['title', 'key', 'tempo', 'meter', 'sections'],
          },
          summary: { type: 'string', description: 'One line describing the change, for the undo history.' },
        },
        required: ['song', 'summary'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'TransposeSong',
      description: 'Transpose the whole song. Provide either a target key (e.g. "Bb", "Eb Major", "F Minor") or a number of semitones (positive = up).',
      parameters: {
        type: 'object',
        properties: {
          toKey: { type: 'string', description: 'Target key or tonic. If only a tonic is given the current mode is kept.' },
          semitones: { type: 'integer', description: 'Semitones to transpose by, -11..11.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'AnalyzeProgression',
      description: 'Analyze the current progression: Roman numerals relative to the key, harmonic function per chord, and detected idioms (ii-V-I, secondary dominants, tritone subs). Use this to answer questions about harmony or to explain a measure.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'InsertProgression',
      description: 'Insert new measures before a given 1-based global measure number (use totalMeasures+1 to append). Chords are given as symbols; by default each symbol fills one measure. Set chordsPerMeasure to 2 to put two chords per measure (e.g. a ii-V in one bar). Optionally replace existing measures instead of inserting.',
      parameters: {
        type: 'object',
        properties: {
          beforeMeasure: { type: 'integer', description: '1-based global measure number to insert before.' },
          chords: { type: 'array', items: { type: 'string' }, description: 'Chord symbols in order, e.g. ["Dm7","G7"].' },
          chordsPerMeasure: { type: 'integer', description: 'How many chords share each measure (default 1).' },
          replaceCount: { type: 'integer', description: 'If > 0, replace this many existing measures starting at beforeMeasure instead of inserting.' },
        },
        required: ['beforeMeasure', 'chords'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ListStyles',
      description: 'List available playing styles: built-in presets, styles embedded in the song, and the server library. Returns id, name, description, feel summary and which substyles (a/b) exist.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'GetStyle',
      description: 'Return a full style document by id (preset, embedded in the song, or library). Without id, returns the style of the section at the editor cursor. Use before UpdateStyle.',
      parameters: { type: 'object', properties: { id: { type: 'string' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'UpdateStyle',
      description: 'Create or replace a style document and embed it in the song (also saved to the library). To edit a preset, GetStyle it, change it, give it a NEW id and name, then assign it with SetSectionStyle. A style has: id, name, description, bars, beatsPerBar, feel {swing 0..1, pushPull ticks (negative = ahead), humanize ticks, accents[] per beat, rolePushPull {chords,bass,drums}}, substyles {a, b?} each with comp {variations:[{hits:[{beat,duration,velocity,voice: full|top|bottom|arpUp|arpDown, push?, chordTypes?}], weight?, bars?}], fills?, intro?, ending?, voicing?}, bass {style: roots|roots-fifths|walking, variations:[{hits:[{beat,duration,velocity,degree: root|third|fifth|octave|approach}]}]}, drums {variations:[{hits:[{beat,duration,velocity,drum: GM note}]}], fills?}. Beats are 0-based within the pattern.',
      parameters: {
        type: 'object',
        properties: { style: { type: 'object', additionalProperties: true }, summary: { type: 'string' } },
        required: ['style', 'summary'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'SetSectionStyle',
      description: 'Assign a style and/or substyle to a section (by index or name), or set the song default with section "default". substyle "b" is the busier/chorus variant.',
      parameters: {
        type: 'object',
        properties: {
          section: { type: 'string', description: 'Section index (0-based), section name, or "default".' },
          styleId: { type: 'string' },
          substyle: { type: 'string', enum: ['a', 'b'] },
        },
        required: ['section'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'SetTransition',
      description: 'Set or remove the transition INTO a section: over the last `bars` of the previous section, "rush" pushes ahead of the beat, raises energy and keeps density; "relax" lays back, softens and thins the texture. amount 0..1.',
      parameters: {
        type: 'object',
        properties: {
          beforeSection: { type: 'string', description: 'Index or name of the section the transition leads into.' },
          bars: { type: 'number' },
          kind: { type: 'string', enum: ['rush', 'relax'] },
          amount: { type: 'number' },
          remove: { type: 'boolean' },
        },
        required: ['beforeSection'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'AuditionStyle',
      description: 'Apply a style (and optional substyle) to a section (default: the section at the cursor) and start looped playback of that section so the user can hear it.',
      parameters: {
        type: 'object',
        properties: { styleId: { type: 'string' }, substyle: { type: 'string', enum: ['a', 'b'] }, section: { type: 'string' } },
      },
    },
  },
];

export type ToolResult = { ok: true; result: unknown } | { ok: false; error: string };

export function executeTool(store: SongStore, name: string, rawArgs: string | Record<string, unknown>): ToolResult {
  let args: Record<string, unknown>;
  try {
    args = typeof rawArgs === 'string' ? (rawArgs.trim() ? JSON.parse(rawArgs) : {}) : rawArgs;
  } catch (e) {
    return { ok: false, error: `Could not parse tool arguments as JSON: ${(e as Error).message}` };
  }
  try {
    switch (name) {
      case 'GetSong':
        return { ok: true, result: { song: store.get(), editor: store.context?.() ?? null } };

      case 'UpdateSong': {
        const v = validateSong(args.song);
        if (!v.ok) return { ok: false, error: 'Song failed validation. Fix and retry:\n' + v.errors.join('\n') };
        store.set(args.song as Song, String(args.summary ?? 'Agent updated song'));
        return { ok: true, result: { message: 'Song updated.', measures: totalMeasures(args.song as Song) } };
      }

      case 'TransposeSong': {
        const song = store.get();
        if (args.toKey === undefined && args.semitones === undefined) return { ok: false, error: 'Provide toKey or semitones.' };
        const out = transposeSong(song, { toKey: args.toKey as string | undefined, semitones: args.semitones as number | undefined });
        store.set(out, `Transposed to ${out.key}`);
        return { ok: true, result: { message: `Transposed from ${song.key} to ${out.key}.`, key: out.key } };
      }

      case 'AnalyzeProgression':
        return { ok: true, result: analyzeProgression(store.get()) };

      case 'InsertProgression': {
        const song = store.get();
        const chords = args.chords as string[];
        if (!Array.isArray(chords) || chords.length === 0) return { ok: false, error: 'chords must be a non-empty array of symbols.' };
        const per = Math.max(1, Number(args.chordsPerMeasure ?? 1));
        const before = Number(args.beforeMeasure);
        const measures: Measure[] = measuresFromSymbols(song, chords, per);
        const replaceCount = Number(args.replaceCount ?? 0);
        const out = replaceCount > 0 ? replaceMeasures(song, before, before + replaceCount - 1, measures) : insertMeasures(song, before, measures);
        store.set(out, `${replaceCount > 0 ? 'Replaced' : 'Inserted'} ${measures.length} measure(s) at ${before}: ${chords.join(' ')}`);
        return { ok: true, result: { message: `${replaceCount > 0 ? 'Replaced' : 'Inserted'} ${measures.length} measure(s) before measure ${before}.`, totalMeasures: totalMeasures(out) } };
      }

      case 'ListStyles': {
        const song = store.get();
        const all = { ...PRESET_STYLES, ...(song.styles ?? {}) };
        return { ok: true, result: Object.values(all).map(normalizeStyle).map(styleSummary) };
      }

      case 'GetStyle': {
        const song = store.get();
        const id = args.id as string | undefined;
        if (!id) {
          const ctx = store.context?.();
          const si = ctx ? sectionIndexOfMeasure(song, ctx.cursorMeasure) : 0;
          const sid = song.arrangement?.sections?.[String(si)] ?? song.arrangement?.defaultStyle ?? DEFAULT_STYLE_ID;
          const st = song.styles?.[sid] ?? PRESET_STYLES[sid];
          return st ? { ok: true, result: { style: normalizeStyle(st), sectionIndex: si, source: song.styles?.[sid] ? 'song' : 'preset' } } : { ok: false, error: `Style "${sid}" not found.` };
        }
        const st = song.styles?.[id] ?? PRESET_STYLES[id];
        if (!st) return { ok: false, error: `Style "${id}" is not a preset or embedded in the song.` };
        return { ok: true, result: { style: normalizeStyle(st), source: song.styles?.[id] ? 'song' : 'preset' } };
      }

      case 'UpdateStyle': {
        const raw = args.style as Style | StyleV1;
        const errors = validateStyle(raw);
        if (errors.length) return { ok: false, error: 'Style failed validation. Fix and retry:\n' + errors.join('\n') };
        const style = normalizeStyle(raw);
        if (PRESET_STYLES[style.id] && JSON.stringify(PRESET_STYLES[style.id]) !== JSON.stringify(style)) {
          return { ok: false, error: `"${style.id}" is a built-in preset. Give your edited style a new id and name, then assign it with SetSectionStyle.` };
        }
        const song = cloneSong(store.get());
        song.styles = { ...(song.styles ?? {}), [style.id]: style };
        store.set(song, String(args.summary ?? `Updated style ${style.id}`));
        return { ok: true, result: { message: `Style "${style.id}" saved and embedded in the song.`, style: styleSummary(style) } };
      }

      case 'SetSectionStyle': {
        const song = cloneSong(store.get());
        const sec = String(args.section ?? '');
        const styleId = args.styleId as string | undefined;
        const substyle = args.substyle as 'a' | 'b' | undefined;
        if (styleId && !song.styles?.[styleId] && !PRESET_STYLES[styleId]) return { ok: false, error: `Unknown style "${styleId}". Use ListStyles.` };
        const arr = song.arrangement ?? { defaultStyle: DEFAULT_STYLE_ID };
        if (sec === 'default') {
          if (!styleId) return { ok: false, error: 'styleId required for "default".' };
          arr.defaultStyle = styleId;
        } else {
          const si = resolveSection(song, sec);
          if (si === null) return { ok: false, error: `Unknown section "${sec}".` };
          if (styleId) arr.sections = { ...(arr.sections ?? {}), [String(si)]: styleId };
          if (substyle) { arr.substyles = { ...(arr.substyles ?? {}) }; if (substyle === 'a') delete arr.substyles[String(si)]; else arr.substyles[String(si)] = 'b'; }
        }
        song.arrangement = arr;
        store.set(song, `Style ${sec}: ${[styleId, substyle && `substyle ${substyle.toUpperCase()}`].filter(Boolean).join(', ')}`);
        return { ok: true, result: { message: 'Arrangement updated.', arrangement: song.arrangement } };
      }

      case 'SetTransition': {
        const song = cloneSong(store.get());
        const si = resolveSection(song, String(args.beforeSection ?? ''));
        if (si === null) return { ok: false, error: `Unknown section "${args.beforeSection}".` };
        if (si === 0) return { ok: false, error: 'There is no section before the first one to transition from.' };
        const arr = song.arrangement ?? { defaultStyle: DEFAULT_STYLE_ID };
        const rest = (arr.transitions ?? []).filter((t) => t.beforeSection !== si);
        if (args.remove) { arr.transitions = rest; song.arrangement = arr; store.set(song, `Removed transition into section ${si}`); return { ok: true, result: { message: 'Transition removed.' } }; }
        const tr: Transition = { beforeSection: si, bars: Number(args.bars ?? 2), kind: (args.kind as 'rush' | 'relax') ?? 'rush', amount: Math.max(0, Math.min(1, Number(args.amount ?? 0.6))) };
        if (!(tr.bars > 0)) return { ok: false, error: 'bars must be > 0' };
        arr.transitions = [...rest, tr];
        song.arrangement = arr;
        store.set(song, `${tr.kind} ${tr.bars} bars into section ${si}`);
        return { ok: true, result: { message: `Transition set: ${tr.kind} over ${tr.bars} bar(s) into section ${si} (amount ${tr.amount}).`, transition: tr } };
      }

      case 'AuditionStyle': {
        const song = cloneSong(store.get());
        const ctx = store.context?.();
        const si = args.section !== undefined ? resolveSection(song, String(args.section)) : (ctx ? sectionIndexOfMeasure(song, ctx.cursorMeasure) : 0);
        if (si === null) return { ok: false, error: `Unknown section "${args.section}".` };
        const styleId = args.styleId as string | undefined;
        const substyle = args.substyle as 'a' | 'b' | undefined;
        if (styleId || substyle) {
          if (styleId && !song.styles?.[styleId] && !PRESET_STYLES[styleId]) return { ok: false, error: `Unknown style "${styleId}".` };
          const arr = song.arrangement ?? { defaultStyle: DEFAULT_STYLE_ID };
          if (styleId) arr.sections = { ...(arr.sections ?? {}), [String(si)]: styleId };
          if (substyle) { arr.substyles = { ...(arr.substyles ?? {}) }; if (substyle === 'a') delete arr.substyles[String(si)]; else arr.substyles[String(si)] = 'b'; }
          song.arrangement = arr;
          store.set(song, `Audition ${styleId ?? ''}${substyle ? ' ' + substyle.toUpperCase() : ''} on section ${si}`);
        }
        if (store.audition) { store.audition(si); return { ok: true, result: { message: `Playing section ${si} (${song.sections[si]?.name}) in a loop.` } }; }
        return { ok: true, result: { message: 'Style applied. No playback available from this client; the user can press Play.' } };
      }

      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function styleSummary(s: Style) {
  return { id: s.id, name: s.name, description: s.description, bars: s.bars, feel: s.feel, substyles: Object.keys(s.substyles).filter((k) => (s.substyles as Record<string, unknown>)[k]), roles: Object.keys(s.substyles.a), bass: s.substyles.a.bass?.style, source: s.source };
}

function resolveSection(song: Song, ref: string): number | null {
  if (/^\d+$/.test(ref)) { const i = Number(ref); return song.sections[i] ? i : null; }
  const i = song.sections.findIndex((x) => x.name.toLowerCase() === ref.toLowerCase());
  return i >= 0 ? i : null;
}

function sectionIndexOfMeasure(song: Song, measureNumber: number): number {
  let n = 0;
  for (let i = 0; i < song.sections.length; i++) { n += song.sections[i].measures.length; if (measureNumber <= n) return i; }
  return Math.max(0, song.sections.length - 1);
}

export const SYSTEM_PROMPT = `You are Song Brain, an expert jazz/pop harmony assistant embedded in a chord chart editor.

The chord chart is a structured JSON song (title, key, tempo, meter, sections → measures → chords with beats). Chord progressions are the vibe; notation, MIDI and playback are derived from them. You never edit notation; you edit the song model through tools.

Rules:
- Call GetSong before making changes so you work from the current state. Measure numbers in conversation are 1-based and global across sections. GetSong returns { song, editor }; editor.selection and editor.cursorMeasure tell you what "this", "here" or "these bars" refer to.
- Prefer the specific tools (TransposeSong, InsertProgression) when they fit; use UpdateSong for everything else.
- When using UpdateSong, send the complete song, keeping untouched parts identical, including the tracks array (instrumentation and mix) if present. Every measure's chord beats must total the meter.
- The song may have tracks: each has a General MIDI program (0-127), a MIDI channel, level/pan/reverb (0-127), mute and solo, and optionally a voicing style (chords tracks: close, shell, rootless, drop2, guitar) or bassStyle (bass tracks: roots, roots-fifths, walking). Change these only when asked about instruments, voicings, bass lines or the mix. Drums tracks (role drums, channel 10) are style-driven.
- Playing style (rhythm, comping pattern, bass line, drums, swing and timing feel) comes from the song's arrangement: arrangement.defaultStyle and arrangement.sections[sectionIndex]. Built-in style ids: swing, bossa, ballad, straight8, funk. To put bossa on the bridge, set arrangement.sections["1"] = "bossa" via UpdateSong. Each style has substyle "a" (verse, lighter) and usually "b" (chorus, busier): set arrangement.substyles["2"] = "b" to lift a section. Styles may define weighted pattern variations, fills, intro/ending, per-hit pushes (anticipations) and chordTypes conditions.
- Style tools: ListStyles, GetStyle, UpdateStyle (new id for edited presets), SetSectionStyle, SetTransition (rush/relax into a section), AuditionStyle (apply and loop a section). Prefer these over UpdateSong for style and arrangement changes. When asked to change how something is played (busier, sparser, laid back, swing harder, walking bass, add a fill), GetStyle the section's style, edit the relevant hits/feel, UpdateStyle under a new id, then SetSectionStyle.
- Use conventional chord symbols: Cm7, F7, BbMaj7, Am7b5, D7b9, G7#11, Ebm6, Dsus4, F/A.
- After changing the song, briefly tell the user what changed and why, in musician's language. Keep answers concise.
- For questions ("explain measure 12", "what key is this"), use AnalyzeProgression and answer in plain terms.`;
