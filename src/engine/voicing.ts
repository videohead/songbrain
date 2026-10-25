/**
 * Voicing engine: chord symbols → concrete notes per instrument style, with a
 * voice-leading pass that picks each voicing to move as little as possible
 * from the previous one. Also generates bass lines (roots, roots & fifths,
 * walking). Pure functions, no audio.
 */
import { Chord, Interval, Note } from 'tonal';
import { isNoChord, parseChord } from './harmony';
import { gmFamily } from '../model/gm';

export type VoicingStyle = 'close' | 'shell' | 'rootless' | 'drop2' | 'guitar';
export type BassStyle = 'roots' | 'roots-fifths' | 'walking';

export const VOICING_STYLES: Array<{ id: VoicingStyle; label: string }> = [
  { id: 'rootless', label: 'Rootless (jazz piano)' },
  { id: 'shell', label: 'Shell (3 & 7)' },
  { id: 'drop2', label: 'Drop-2' },
  { id: 'guitar', label: 'Guitar (drop-2, 4 strings)' },
  { id: 'close', label: 'Close position' },
];
export const BASS_STYLES: Array<{ id: BassStyle; label: string }> = [
  { id: 'roots', label: 'Roots' },
  { id: 'roots-fifths', label: 'Roots & fifths' },
  { id: 'walking', label: 'Walking' },
];

/** Sensible defaults by General MIDI family. */
export function defaultVoicingFor(program: number): VoicingStyle {
  switch (gmFamily(program)) {
    case 'Guitar': return 'guitar';
    case 'Piano': case 'Organ': return 'rootless';
    case 'Strings': case 'Ensemble': case 'Synth Pad': case 'Brass': case 'Reed': return 'drop2';
    default: return 'close';
  }
}

// ---------------------------------------------------------------------------
// Chord tones
// ---------------------------------------------------------------------------

/** Absolute pitch classes (chroma 0-11) of each functional slot. */
export interface ChordTones {
  root: number;
  third?: number;    // 3rd, or the sus 2nd/4th
  fifth?: number;
  sixth?: number;
  seventh?: number;
  ninth?: number;
  eleventh?: number; // only when altered (#11) or explicitly present
  thirteenth?: number;
  quality: ReturnType<typeof parseChord>['quality'];
}

export function chordTones(symbol: string): ChordTones | null {
  const p = parseChord(symbol);
  if (p.isNoChord || !p.root) return null;
  const rootChroma = Note.chroma(p.root);
  if (rootChroma == null) return null;
  const c = Chord.get(p.symbol.replace(/\/.*$/, ''));
  const intervals = c.intervals.length ? c.intervals : ['1P', p.quality === 'minor' ? '3m' : '3M', '5P'];
  const t: ChordTones = { root: rootChroma, quality: p.quality };
  for (const iv of intervals) {
    const num = Interval.num(iv);
    const chroma = (rootChroma + (Interval.semitones(iv) ?? 0) + 1200) % 12;
    switch (num) {
      case 1: break;
      case 2: case 4: if (t.third === undefined) t.third = chroma; break;
      case 3: t.third = chroma; break;
      case 5: t.fifth = chroma; break;
      case 6: t.sixth = chroma; break;
      case 7: t.seventh = chroma; break;
      case 9: t.ninth = chroma; break;
      case 11: t.eleventh = chroma; break;
      case 13: t.thirteenth = chroma; break;
      default: break;
    }
  }
  return t;
}

/** Pitch-class set for a style, ordered roughly low→high in "home" position. */
function pcSetFor(t: ChordTones, style: VoicingStyle): number[] {
  const seventhLike = t.seventh ?? t.sixth;
  const fifthSlot = t.thirteenth ?? (t.eleventh !== undefined && (t.eleventh - t.root + 12) % 12 === 6 ? t.eleventh : undefined) ?? t.fifth ?? (t.root + 7) % 12;
  const third = t.third ?? (t.root + 4) % 12;
  const naturalNinth = (t.root + 2) % 12;
  const ninthSlot = t.ninth ?? (t.quality === 'half-diminished' || t.quality === 'diminished' ? t.root : naturalNinth);
  const uniq = (xs: number[]) => xs.filter((x, i) => xs.indexOf(x) === i);

  switch (style) {
    case 'shell':
      return uniq(seventhLike !== undefined ? [third, seventhLike] : [third, fifthSlot]);
    case 'rootless':
      if (seventhLike === undefined) return uniq([third, fifthSlot, t.root, ninthSlot]); // triads: add 9 for color
      return uniq([third, fifthSlot, seventhLike, ninthSlot]);
    case 'guitar':
      // 4 voices max; rootless when a 7th exists (bass covers the root), else root-position triad + octave.
      if (seventhLike === undefined) return uniq([t.root, third, fifthSlot, t.root]);
      return uniq(t.ninth !== undefined ? [third, fifthSlot, seventhLike, t.ninth] : [t.root, third, fifthSlot, seventhLike]);
    case 'drop2':
      return uniq(seventhLike !== undefined ? [t.root, third, fifthSlot, seventhLike] : [t.root, third, fifthSlot]);
    case 'close':
    default: {
      const all = [t.root, third, fifthSlot, seventhLike, t.ninth].filter((x): x is number => x !== undefined);
      return uniq(all).slice(0, 5);
    }
  }
}

// ---------------------------------------------------------------------------
// Candidate generation + voice leading
// ---------------------------------------------------------------------------

interface StyleRange { low: number; high: number; home: number; maxSpan: number; drop2: boolean }

const RANGES: Record<VoicingStyle, StyleRange> = {
  close:    { low: 52, high: 79, home: 64, maxSpan: 14, drop2: false }, // E3–G5
  shell:    { low: 48, high: 72, home: 58, maxSpan: 12, drop2: false }, // C3–C5
  rootless: { low: 48, high: 76, home: 62, maxSpan: 12, drop2: false }, // C3–E5
  drop2:    { low: 48, high: 79, home: 62, maxSpan: 19, drop2: true },  // C3–G5
  guitar:   { low: 40, high: 76, home: 57, maxSpan: 19, drop2: true },  // E2–E5
};

function stackClose(rotation: number[], bottom: number): number[] {
  const out = [bottom];
  for (let i = 1; i < rotation.length; i++) {
    let m = out[i - 1] + 1;
    while (m % 12 !== rotation[i]) m++;
    out.push(m);
  }
  return out;
}

function candidates(pcs: number[], style: VoicingStyle): number[][] {
  const r = RANGES[style];
  const out: number[][] = [];
  const n = pcs.length;
  for (let rot = 0; rot < n; rot++) {
    const rotation = [...pcs.slice(rot), ...pcs.slice(0, rot)];
    for (let bottom = r.low; bottom <= r.high; bottom++) {
      if (bottom % 12 !== rotation[0]) continue;
      let v = stackClose(rotation, bottom);
      if (r.drop2 && v.length >= 4) { v = [...v]; v[v.length - 2] -= 12; v.sort((a, b) => a - b); }
      if (v[0] < r.low || v[v.length - 1] > r.high) continue;
      if (v[v.length - 1] - v[0] > r.maxSpan) continue;
      out.push(v);
    }
  }
  return out;
}

function movement(a: number[], b: number[]): number {
  if (a.length === b.length) return a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0);
  const d = (xs: number[], ys: number[]) => xs.reduce((s, x) => s + Math.min(...ys.map((y) => Math.abs(x - y))), 0);
  return (d(a, b) + d(b, a)) / 2;
}

const center = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;

/** Voice a whole progression with minimal movement between successive chords. */
export function voiceProgression(symbols: string[], style: VoicingStyle): string[][] {
  const r = RANGES[style];
  let prev: number[] | null = null;
  return symbols.map((sym) => {
    if (isNoChord(sym)) return [];
    const t = chordTones(sym);
    if (!t) return [];
    const cands = candidates(pcSetFor(t, style), style);
    if (!cands.length) return [];
    let best = cands[0];
    let bestCost = Infinity;
    for (const c of cands) {
      const drift = Math.abs(center(c) - r.home);
      const cost = prev ? movement(prev, c) + 0.2 * drift : drift;
      if (cost < bestCost) { bestCost = cost; best = c; }
    }
    prev = best;
    return best.map((m) => Note.fromMidi(m));
  });
}

// ---------------------------------------------------------------------------
// Bass lines
// ---------------------------------------------------------------------------

export interface BassHit { beatOffset: number; beats: number; note: string; velocity: number }

const BASS_LOW = 33; // A1
const BASS_HIGH = 55; // G3

function clampOct(m: number): number {
  while (m < BASS_LOW) m += 12;
  while (m > BASS_HIGH) m -= 12;
  return m;
}
function nearest(chroma: number, ref: number): number {
  return clampOct(chroma + 12 * Math.round((ref - chroma) / 12));
}
/** The first note with this chroma strictly above `ref`, folded back if out of range. */
function above(chroma: number, ref: number): number {
  let m = ref + 1;
  while (m % 12 !== chroma) m++;
  return clampOct(m);
}

/**
 * Bass notes for one chord. `nextSymbol` lets walking lines approach the next root.
 * `prevNote` (midi) keeps the line connected across chords.
 */
export function bassFor(symbol: string, beats: number, style: BassStyle, nextSymbol: string | null, prevNote: number | null): BassHit[] {
  const t = chordTones(symbol);
  if (!t) return [];
  const slashBass = parseChord(symbol).bass;
  const rootChroma = slashBass ? (Note.chroma(slashBass) ?? t.root) : t.root;
  const ref = prevNote ?? 43;
  const root = nearest(rootChroma, ref);
  const fifth = above(t.fifth ?? (t.root + 7) % 12, root);
  const third = above(t.third ?? (t.root + 4) % 12, root);
  const name = (m: number) => Note.fromMidi(m);

  if (style === 'roots') {
    const hits = beats >= 4 ? [0, beats / 2] : [0];
    return hits.map((b) => ({ beatOffset: b, beats: beats / hits.length, note: name(root), velocity: 90 }));
  }
  if (style === 'roots-fifths') {
    if (beats >= 4) return [{ beatOffset: 0, beats: beats / 2, note: name(root), velocity: 92 }, { beatOffset: beats / 2, beats: beats / 2, note: name(fifth), velocity: 84 }];
    if (beats === 3) return [{ beatOffset: 0, beats: 2, note: name(root), velocity: 92 }, { beatOffset: 2, beats: 1, note: name(fifth), velocity: 84 }];
    return [{ beatOffset: 0, beats, note: name(root), velocity: 92 }];
  }
  // walking: quarter notes
  const n = Math.max(1, Math.round(beats));
  const nextT = nextSymbol ? chordTones(nextSymbol) : null;
  const nextRootChroma = nextT ? (parseChord(nextSymbol!).bass ? Note.chroma(parseChord(nextSymbol!).bass!) ?? nextT.root : nextT.root) : null;
  const line: number[] = [root];
  for (let b = 1; b < n; b++) {
    const last = b === n - 1;
    if (last && nextRootChroma !== null && n > 1) {
      const prevN = line[line.length - 1];
      const target = nearest(nextRootChroma, prevN);
      // Chromatic approach that continues the line's direction and never repeats the previous note.
      let pick = prevN > target ? target + 1 : target - 1;
      if (pick === prevN) pick = prevN > target ? target - 1 : target + 1;
      line.push(clampOct(pick));
    } else if (b % 2 === 1) {
      line.push(b === 1 ? third : fifth);
    } else {
      line.push(line[0] + 12 <= BASS_HIGH ? (b === 2 ? fifth : line[0] + 12) : fifth);
    }
  }
  return line.map((m, i) => ({ beatOffset: i, beats: 1, note: name(m), velocity: i === 0 ? 96 : 82 }));
}

/** Resolve one bass degree for a chord (midi), used by style bass patterns. */
export function bassNoteFor(symbol: string, degree: 'root' | 'third' | 'fifth' | 'octave' | 'approach', nextSymbol: string | null, prevNote: number | null): number | null {
  const t = chordTones(symbol);
  if (!t) return null;
  const slashBass = parseChord(symbol).bass;
  const rootChroma = slashBass ? (Note.chroma(slashBass) ?? t.root) : t.root;
  const root = nearest(rootChroma, prevNote ?? 43);
  switch (degree) {
    case 'root': return root;
    case 'third': return above(t.third ?? (t.root + 4) % 12, root);
    case 'fifth': return above(t.fifth ?? (t.root + 7) % 12, root);
    case 'octave': return root + 12 <= BASS_HIGH ? root + 12 : root;
    case 'approach': {
      const nt = nextSymbol ? chordTones(nextSymbol) : null;
      if (!nt) return above(t.fifth ?? (t.root + 7) % 12, root);
      const nb = parseChord(nextSymbol!).bass;
      const target = nearest(nb ? (Note.chroma(nb) ?? nt.root) : nt.root, prevNote ?? root);
      const from = prevNote ?? root;
      let pick = from > target ? target + 1 : target - 1;
      if (pick === from) pick = from > target ? target - 1 : target + 1;
      return clampOct(pick);
    }
  }
}
