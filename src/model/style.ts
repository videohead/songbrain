/**
 * Style documents (v2). A style says HOW the chords are played: note selection
 * (voicing, arpeggiation) and feel (swing, push-pull timing, accents).
 *
 * v2 adds substyles (A/B), weighted pattern variations, fills, intro/ending,
 * pushes and chord-type conditions. v1 documents (a single comp/bass/drums
 * pattern at the top level) are still accepted and upgraded by normalizeStyle().
 */
import type { TrackRole } from './song';

export type VoicingStyleId = 'close' | 'shell' | 'rootless' | 'drop2' | 'guitar';
export type BassStyleId = 'roots' | 'roots-fifths' | 'walking';
export type ChordClass = 'major' | 'minor' | 'dominant' | 'half-diminished' | 'diminished' | 'other';
export type SubstyleId = 'a' | 'b';

export interface Feel {
  /** 0 = straight, 1 = full triplet swing on off-beat 8ths. */
  swing: number;
  /** Global timing offset in ticks; negative pushes ahead of the beat, positive lays back. */
  pushPull: number;
  /** Random timing jitter in ticks (deterministic per position). */
  humanize: number;
  /** Velocity multipliers per beat of the bar. */
  accents: number[];
  rolePushPull?: Partial<Record<TrackRole, number>>;
}

interface HitBase {
  /** 0-based beat within the pattern (fractional). */
  beat: number;
  duration: number;
  velocity: number;
  /**
   * Anticipation in beats: the hit sounds at `beat` but takes the chord that is
   * sounding `push` beats later, so a hit on the "and of 4" with push 0.5
   * anticipates the next bar's chord.
   */
  push?: number;
  /** Only play this hit when the chord is one of these classes. */
  chordTypes?: ChordClass[];
}

export type CompVoice = 'full' | 'top' | 'bottom' | 'arpUp' | 'arpDown';
export interface CompHit extends HitBase { voice: CompVoice }
export type BassDegree = 'root' | 'third' | 'fifth' | 'octave' | 'approach';
export interface BassHit extends HitBase { degree: BassDegree }
export interface DrumHit extends HitBase { drum: number }

export interface Pattern<H> {
  hits: H[];
  /** Relative probability among variations (default 1). */
  weight?: number;
  /** Length in bars (default: the style's `bars`). */
  bars?: number;
}

export interface RolePatterns<H> {
  variations: Pattern<H>[];
  /** Played on the last bar(s) of a section instead of a variation. */
  fills?: Pattern<H>[];
  intro?: Pattern<H>;
  ending?: Pattern<H>;
}

export interface Substyle {
  comp?: RolePatterns<CompHit> & { voicing?: VoicingStyleId };
  bass?: RolePatterns<BassHit> & { style: BassStyleId };
  drums?: RolePatterns<DrumHit>;
}

export interface Style {
  id: string;
  name: string;
  description?: string;
  /** Default pattern length in bars. */
  bars: number;
  beatsPerBar: number;
  feel: Feel;
  substyles: { a: Substyle; b?: Substyle };
  /** Learned-from / author metadata. */
  source?: string;
}

/** v1 shape, still accepted on input. */
export interface StyleV1 {
  id: string; name: string; description?: string; bars: number; beatsPerBar: number; feel: Feel;
  comp?: { hits: CompHit[]; voicing?: VoicingStyleId };
  bass?: { style: BassStyleId; hits?: BassHit[] };
  drums?: { hits: DrumHit[] };
}

export interface Transition {
  beforeSection: number;
  bars: number;
  kind: 'rush' | 'relax';
  amount: number;
}

export interface Arrangement {
  defaultStyle: string;
  /** Section index (string key) → style id. */
  sections?: Record<string, string>;
  /** Section index → substyle. Default "a". */
  substyles?: Record<string, SubstyleId>;
  /** Seed for deterministic variation choice (default 1). */
  seed?: number;
  /** Play fills on the last bar of each section (default true). */
  fills?: boolean;
  transitions?: Transition[];
}

export function isV1Style(s: unknown): s is StyleV1 {
  const x = s as Partial<Style & StyleV1>;
  return !!x && typeof x === 'object' && !('substyles' in x) && ('comp' in x || 'bass' in x || 'drums' in x);
}

/** Upgrade a v1 style to v2 (idempotent for v2 input). */
export function normalizeStyle(input: Style | StyleV1): Style {
  if (!isV1Style(input)) return input as Style;
  const a: Substyle = {};
  if (input.comp) a.comp = { variations: [{ hits: input.comp.hits }], voicing: input.comp.voicing };
  if (input.bass) a.bass = { style: input.bass.style, variations: input.bass.hits ? [{ hits: input.bass.hits }] : [] };
  if (input.drums) a.drums = { variations: [{ hits: input.drums.hits }] };
  return { id: input.id, name: input.name, description: input.description, bars: input.bars, beatsPerBar: input.beatsPerBar, feel: input.feel, substyles: { a } };
}

/** GM percussion note numbers used by presets and the UI. */
export const GM_DRUMS = {
  kick: 36, kick2: 35, sideStick: 37, snare: 38, clap: 39, snare2: 40,
  hhClosed: 42, hhPedal: 44, hhOpen: 46, crash: 49, ride: 51, rideBell: 53, tambourine: 54, cowbell: 56, shaker: 70,
  lowTom: 45, midTom: 47, highTom: 50,
} as const;

export const GM_DRUM_NAMES: Record<number, string> = {
  35: 'Kick 2', 36: 'Kick', 37: 'Side Stick', 38: 'Snare', 39: 'Clap', 40: 'Snare 2', 42: 'Closed Hat', 44: 'Pedal Hat', 46: 'Open Hat',
  49: 'Crash', 51: 'Ride', 53: 'Ride Bell', 54: 'Tambourine', 56: 'Cowbell', 70: 'Shaker', 45: 'Low Tom', 47: 'Mid Tom', 50: 'High Tom',
};

export const GM_DRUM_KITS: Array<{ program: number; name: string }> = [
  { program: 0, name: 'Standard Kit' }, { program: 8, name: 'Room Kit' }, { program: 16, name: 'Power Kit' }, { program: 24, name: 'Electronic Kit' },
  { program: 25, name: 'TR-808' }, { program: 32, name: 'Jazz Kit' }, { program: 40, name: 'Brush Kit' }, { program: 48, name: 'Orchestra Kit' },
];

const CHORD_CLASSES: ChordClass[] = ['major', 'minor', 'dominant', 'half-diminished', 'diminished', 'other'];

export function validateStyle(input: unknown): string[] {
  const e: string[] = [];
  const raw = input as Partial<Style> | null;
  if (!raw || typeof raw !== 'object') return ['style must be an object'];
  if (typeof raw.id !== 'string' || !raw.id) e.push('style.id required');
  if (typeof raw.name !== 'string') e.push('style.name required');
  if (!(typeof raw.bars === 'number' && raw.bars >= 1)) e.push('style.bars must be >= 1');
  if (!(typeof raw.beatsPerBar === 'number' && raw.beatsPerBar >= 1)) e.push('style.beatsPerBar must be >= 1');
  const f = raw.feel;
  if (!f || typeof f !== 'object') e.push('style.feel required');
  else {
    if (!(typeof f.swing === 'number' && f.swing >= 0 && f.swing <= 1)) e.push('feel.swing must be 0..1');
    if (typeof f.pushPull !== 'number') e.push('feel.pushPull must be a number');
    if (!(typeof f.humanize === 'number' && f.humanize >= 0)) e.push('feel.humanize must be >= 0');
    if (!Array.isArray(f.accents) || !f.accents.every((a) => typeof a === 'number' && a >= 0)) e.push('feel.accents must be numbers');
  }
  if (e.length) return e;
  const s = normalizeStyle(input as Style | StyleV1);
  if (!s.substyles?.a || typeof s.substyles.a !== 'object') { e.push('style.substyles.a required'); return e; }

  const checkPattern = (p: Pattern<HitBase> | undefined, name: string) => {
    if (p === undefined) return;
    if (!p || !Array.isArray(p.hits)) { e.push(`${name}.hits must be an array`); return; }
    const total = (p.bars ?? s.bars) * s.beatsPerBar;
    if (p.weight !== undefined && !(typeof p.weight === 'number' && p.weight >= 0)) e.push(`${name}.weight must be >= 0`);
    p.hits.forEach((h, i) => {
      if (!(typeof h.beat === 'number' && h.beat >= 0 && h.beat < total)) e.push(`${name}.hits[${i}].beat out of range`);
      if (!(typeof h.duration === 'number' && h.duration > 0)) e.push(`${name}.hits[${i}].duration must be > 0`);
      if (!(typeof h.velocity === 'number' && h.velocity >= 1 && h.velocity <= 127)) e.push(`${name}.hits[${i}].velocity must be 1..127`);
      if (h.push !== undefined && !(typeof h.push === 'number' && h.push >= 0)) e.push(`${name}.hits[${i}].push must be >= 0`);
      if (h.chordTypes !== undefined && (!Array.isArray(h.chordTypes) || !h.chordTypes.every((c) => CHORD_CLASSES.includes(c)))) e.push(`${name}.hits[${i}].chordTypes invalid`);
    });
  };
  const checkRole = (r: RolePatterns<HitBase> | undefined, name: string) => {
    if (r === undefined) return;
    if (!Array.isArray(r.variations)) { e.push(`${name}.variations must be an array`); return; }
    r.variations.forEach((p, i) => checkPattern(p, `${name}.variations[${i}]`));
    r.fills?.forEach((p, i) => checkPattern(p, `${name}.fills[${i}]`));
    checkPattern(r.intro, `${name}.intro`);
    checkPattern(r.ending, `${name}.ending`);
  };
  for (const id of ['a', 'b'] as const) {
    const sub = s.substyles[id];
    if (!sub) continue;
    checkRole(sub.comp, `${id}.comp`);
    checkRole(sub.bass, `${id}.bass`);
    checkRole(sub.drums, `${id}.drums`);
    if (sub.bass && !['roots', 'roots-fifths', 'walking'].includes(sub.bass.style)) e.push(`${id}.bass.style invalid`);
  }
  return e;
}
