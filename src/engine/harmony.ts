/**
 * Harmony Engine: chord symbol parsing, transposition, voicings and analysis.
 * Pure functions built on tonal.js. No UI, no audio.
 */
import { Chord, Interval, Note } from 'tonal';
import type { Song } from '../model/song';
import { flattenMeasures } from '../model/song';

export const NO_CHORD = 'N.C.';

export interface ParsedChord {
  symbol: string;
  root: string;        // pitch class, e.g. "Bb"
  bass: string | null; // slash bass, e.g. "D" in "Bb/D"
  type: string;        // tonal chord type name, e.g. "minor seventh"
  quality: 'major' | 'minor' | 'dominant' | 'diminished' | 'half-diminished' | 'augmented' | 'suspended' | 'unknown';
  notes: string[];     // pitch classes in chord order
  intervals: string[]; // tonal interval names, e.g. ["1P","3M","5P","7m","9m"]
  isNoChord: boolean;
}

export function isNoChord(symbol: string): boolean {
  const s = symbol.trim().toUpperCase().replace(/\./g, '');
  return s === '' || s === 'NC' || s === 'N' || s === '%';
}

/** Normalize common user spellings to ones tonal understands. */
export function normalizeSymbol(symbol: string): string {
  let s = symbol.trim();
  // Root letter case and unicode accidentals
  s = s.replace(/^([A-Ga-g])([#b♭♯]?)/, (_m, l: string, acc: string) => l.toUpperCase() + acc.replace('♭', 'b').replace('♯', '#'));
  // Slash bass: normalize separately
  let bass = '';
  const slash = /^(.*)\/([A-Ga-g][#b♭♯]?)$/.exec(s);
  if (slash && !/^(.*)\/(maj|ma|M)/i.test(s)) { s = slash[1]; bass = '/' + slash[2].replace(/^([a-g])/, (l) => l.toUpperCase()).replace('♭', 'b').replace('♯', '#'); }
  // Parenthesised alterations: C7(b9,#11) -> C7b9#11 ; Cm(maj7) -> CmMaj7
  s = s.replace(/[()]/g, '').replace(/,/g, '');
  s = s
    .replace(/Δ7?/g, 'maj7')
    .replace(/ø7/g, 'm7b5').replace(/ø/g, 'm7b5')
    .replace(/°7/g, 'dim7').replace(/°/g, 'dim')
    .replace(/(?<=[A-G][#b]?)o7\b/g, 'dim7').replace(/(?<=[A-G][#b]?)o\b/g, 'dim')
    .replace(/\-(?=\d|$|maj|Maj|M)/g, 'm')              // C-7 -> Cm7, C-Maj7 -> CmMaj7
    .replace(/(?<=[A-G][#b]?)min(?=\d|$)/g, 'm')        // Cmin7 -> Cm7
    .replace(/(?<=[A-G][#b]?)m\/?(maj|ma|M)7/gi, 'mMaj7') // Cm(maj7), Cm/maj7, CmM7 -> CmMaj7
    .replace(/(?<=[A-G][#b]?)M7/g, 'maj7')              // CM7 -> Cmaj7
    .replace(/(?<=[A-G][#b]?|\d)Maj(?=\d|$)/g, 'maj')   // CMaj7 -> Cmaj7 (but keep mMaj7)
    .replace(/\+5/g, '#5').replace(/\+9/g, '#9').replace(/\+11/g, '#11')
    .replace(/(?<=\d)\+$/g, '#5')                        // C7+ -> C7#5
    .replace(/(?<=[A-G][#b]?)\+7/g, 'aug7')              // C+7 -> Caug7
    .replace(/(?<=[A-G][#b]?)\+$/g, 'aug')               // C+ -> Caug
    .replace(/(7|9|13)sus$/g, '$1sus4')                  // C7sus -> C7sus4
    .replace(/^([A-G][#b]?)sus$/, '$1sus4')
    .replace(/6\/9|69/g, '6add9')
    .replace(/(?<=[A-G][#b]?)2$/, 'add9');
  return s + bass;
}

/** Progressively simpler spellings tonal is likely to know, keeping the root. */
function fallbacks(main: string): string[] {
  const out = [main];
  const push = (x: string) => { if (!out.includes(x)) out.push(x); };
  push(main.replace(/alt$/, '7#5#9'));
  push(main.replace(/13/, '7').replace(/11/, '7'));            // extensions → 7
  push(main.replace(/(#|b)(5|9|11|13)/g, ''));                  // drop alterations
  push(main.replace(/13|11|9/, '7').replace(/(#|b)(5|9|11|13)/g, ''));
  push(main.replace(/add\d+/g, ''));
  push(main.replace(/sus[24]?/g, ''));
  push(main.replace(/^([A-G][#b]?)(m|dim|aug|maj|sus).*$/, '$1$2'));
  push(main.replace(/^([A-G][#b]?).*$/, '$1'));
  return out;
}

export function parseChord(symbol: string): ParsedChord {
  if (isNoChord(symbol)) {
    return { symbol, root: '', bass: null, type: '', quality: 'unknown', notes: [], intervals: [], isNoChord: true };
  }
  const norm = normalizeSymbol(symbol);
  const [main, slash] = norm.split('/');
  const root = /^[A-G][#b]?/.exec(main)?.[0] ?? '';
  let c = Chord.get(main);
  if (c.empty || !c.tonic) {
    for (const alt of fallbacks(main)) { const t = Chord.get(alt); if (!t.empty && t.tonic) { c = t; break; } }
  }
  const notes = c.notes.length ? c.notes : root ? [root] : [];
  const intervals = c.intervals.length ? c.intervals : ['1P', '3M', '5P'];
  return {
    symbol,
    root: c.tonic ?? root,
    bass: slash ? Note.pitchClass(slash) : null,
    type: c.type,
    quality: classify(c.type, c.quality, intervals),
    notes,
    intervals,
    isNoChord: false,
  };
}

function classify(type: string, quality: string, intervals: string[]): ParsedChord['quality'] {
  const has = (iv: string) => intervals.includes(iv);
  const minorThird = has('3m'), majorThird = has('3M'), minorSeventh = has('7m'), dimSeventh = has('7d'), dimFifth = has('5d');
  if (minorThird && dimFifth && dimSeventh) return 'diminished';
  if (minorThird && dimFifth && minorSeventh) return 'half-diminished';
  if (minorThird && dimFifth && !has('7M')) return 'diminished';
  if (type.includes('half-diminished')) return 'half-diminished';
  if (type.includes('diminished') || quality === 'Diminished') return 'diminished';
  // Dominant family wins over "augmented"/"suspended" flavors: 7#5, 7alt, 7sus4 are all dominant chords.
  if (minorSeventh && !minorThird) return 'dominant';
  if (minorThird) return 'minor';
  if (type.includes('augmented') || quality === 'Augmented' || (has('5A') && !minorSeventh)) return 'augmented';
  if (type.includes('sus') || (!majorThird && (has('4P') || has('2M')) && !has('6M') && !has('7M'))) return 'suspended';
  if (type === 'fifth' || type === 'power') return 'major';
  if (majorThird || quality === 'Major') return 'major';
  return 'unknown';
}

/** Count accidentals in a pitch class (for enharmonic spelling choices). */
function accidentalCount(pc: string): number {
  return (pc.match(/[#b]/g) ?? []).length;
}

/** Respell a note to the simplest enharmonic, honoring a flat/sharp preference. */
export function respell(pc: string, preferFlats: boolean): string {
  let n = Note.simplify(pc);
  if (!n) return pc;
  if (accidentalCount(n) > 1) n = Note.enharmonic(n);
  // Avoid awkward spellings like E#, B#, Fb, Cb
  if (/^(E#|B#|Fb|Cb)$/.test(n)) n = Note.enharmonic(n);
  const alt = Note.enharmonic(n);
  if (accidentalCount(n) === 1 && accidentalCount(alt) === 1) {
    const isFlat = n.includes('b');
    if (preferFlats !== isFlat) n = alt;
  }
  return n;
}

/** Transpose a chord symbol by semitones, preserving the suffix text. */
export function transposeChordSymbol(symbol: string, semitones: number, preferFlats = true): string {
  if (isNoChord(symbol)) return symbol;
  const m = /^([A-Ga-g][#b♭♯]?)(.*)$/.exec(symbol.trim());
  if (!m) return symbol;
  const interval = Interval.fromSemitones(((semitones % 12) + 12) % 12);
  const moveRoot = (pc: string) => respell(Note.transpose(Note.pitchClass(normalizeSymbol(pc)), interval), preferFlats);
  const root = moveRoot(m[1]);
  let rest = m[2];
  // Slash bass
  const slash = /^(.*)\/([A-Ga-g][#b♭♯]?)$/.exec(rest);
  if (slash) rest = `${slash[1]}/${moveRoot(slash[2])}`;
  return root + rest;
}

export interface KeyInfo {
  tonic: string;
  mode: 'major' | 'minor';
  preferFlats: boolean;
}

export function parseKey(key: string): KeyInfo {
  const m = /^([A-Ga-g][#b♭♯]?)\s*(.*)$/.exec(key.trim());
  const tonic = m ? Note.pitchClass(normalizeSymbol(m[1])) : 'C';
  const modeText = (m?.[2] ?? '').toLowerCase();
  const mode: KeyInfo['mode'] = /min|m\b|-|aeol|dor/.test(modeText) && !/maj/.test(modeText) ? 'minor' : 'major';
  return { tonic, mode, preferFlats: keyPrefersFlats(tonic, mode) };
}

export function formatKey(k: KeyInfo): string {
  return `${k.tonic} ${k.mode === 'minor' ? 'Minor' : 'Major'}`;
}

/** Fifths on the circle (negative = flats). */
export function keyFifths(tonic: string, mode: 'major' | 'minor'): number {
  const majorTonic = mode === 'major' ? tonic : Note.transpose(tonic, '3m');
  const order = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
  const simple = Note.simplify(majorTonic);
  const idx = order.indexOf(simple);
  if (idx >= 0) return idx - 7;
  const enh = order.indexOf(Note.enharmonic(simple));
  return enh >= 0 ? enh - 7 : 0;
}

function keyPrefersFlats(tonic: string, mode: 'major' | 'minor'): boolean {
  return keyFifths(tonic, mode) < 0;
}

export function transposeKey(key: string, semitones: number): string {
  const k = parseKey(key);
  const interval = Interval.fromSemitones(((semitones % 12) + 12) % 12);
  let tonic = Note.simplify(Note.transpose(k.tonic, interval));
  // Pick spelling with fewer sharps/flats in the key signature
  const alt = Note.enharmonic(tonic);
  if (alt !== tonic && Math.abs(keyFifths(alt, k.mode)) < Math.abs(keyFifths(tonic, k.mode))) tonic = alt;
  return formatKey({ ...k, tonic });
}

export function semitonesBetweenKeys(fromKey: string, toKey: string): number {
  const a = Note.chroma(parseKey(fromKey).tonic) ?? 0;
  const b = Note.chroma(parseKey(toKey).tonic) ?? 0;
  return ((b - a) % 12 + 12) % 12;
}

// ---------------------------------------------------------------------------
// Voicings
// ---------------------------------------------------------------------------

export interface Voicing {
  /** Piano notes with octaves, e.g. ["Eb4","G4","Bb4","D5"] */
  piano: string[];
  /** Bass note with octave, e.g. "C2" */
  bass: string | null;
}

/**
 * Basic piano voicing: chord tones (minus root when 4+ notes) stacked in
 * close position starting from the first chord tone at or above E3, kept
 * inside a comfortable right-hand range. Bass plays the root (or slash bass).
 */
export function voiceChord(symbol: string): Voicing {
  const p = parseChord(symbol);
  if (p.isNoChord || !p.root) return { piano: [], bass: null };
  const tones = p.notes.length >= 4 ? p.notes.slice(1) : p.notes;
  const piano: string[] = [];
  let lastMidi = Note.midi('Eb3')! - 1;
  for (const pc of tones.slice(0, 4)) {
    let midi = Note.midi(pc + '3')!;
    while (midi <= lastMidi) midi += 12;
    piano.push(Note.fromMidi(midi));
    lastMidi = midi;
  }
  // Keep voicing from drifting too high: drop everything an octave if top > G5
  if (piano.length && Note.midi(piano[piano.length - 1])! > Note.midi('G5')!) {
    for (let i = 0; i < piano.length; i++) piano[i] = Note.fromMidi(Note.midi(piano[i])! - 12);
  }
  const bassPc = p.bass ?? p.root;
  let bassMidi = Note.midi(bassPc + '2')!;
  if (bassMidi < Note.midi('E1')!) bassMidi += 12;
  return { piano, bass: Note.fromMidi(bassMidi) };
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export interface ChordAnalysis {
  measure: number;        // 1-based global measure number
  section: string;
  symbol: string;
  roman: string;          // e.g. "iiø7", "V7", "bVIImaj7"
  function: string;       // tonic | subdominant | dominant | secondary dominant | chromatic | n.c.
  diatonic: boolean;
}

export interface ProgressionAnalysis {
  key: string;
  chords: ChordAnalysis[];
  patterns: string[];     // human readable detected idioms
  summary: string;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const MAJOR_DEGREES = [0, 2, 4, 5, 7, 9, 11];
const MINOR_DEGREES = [0, 2, 3, 5, 7, 8, 10];

function romanFor(rootChroma: number, tonicChroma: number, mode: 'major' | 'minor', p: ParsedChord): { roman: string; diatonic: boolean } {
  const rel = ((rootChroma - tonicChroma) % 12 + 12) % 12;
  const scale = mode === 'major' ? MAJOR_DEGREES : MINOR_DEGREES;
  let degree = scale.indexOf(rel);
  let accidental = '';
  if (degree < 0) {
    // Find nearest scale degree below and mark with sharp, or above and mark with flat
    const below = scale.findIndex((d, i) => d < rel && (scale[i + 1] ?? 12) > rel);
    const useFlat = true;
    if (useFlat) {
      degree = (below + 1) % 7;
      accidental = 'b';
    } else {
      degree = below;
      accidental = '#';
    }
  }
  let numeral = ROMAN[degree];
  const lower = p.quality === 'minor' || p.quality === 'diminished' || p.quality === 'half-diminished';
  if (lower) numeral = numeral.toLowerCase();
  const suffix = suffixFor(p);
  // Diatonic means root is in scale AND quality matches expectation loosely
  const expected = expectedQuality(degree, mode);
  const diatonic = accidental === '' && (expected === p.quality || (expected === 'minor' && p.quality === 'half-diminished' && mode === 'major' && degree === 6));
  return { roman: accidental + numeral + suffix, diatonic };
}

function expectedQuality(degree: number, mode: 'major' | 'minor'): ParsedChord['quality'] {
  const major: ParsedChord['quality'][] = ['major', 'minor', 'minor', 'major', 'dominant', 'minor', 'half-diminished'];
  const minor: ParsedChord['quality'][] = ['minor', 'half-diminished', 'major', 'minor', 'dominant', 'major', 'dominant'];
  const q = (mode === 'major' ? major : minor)[degree];
  return q;
}

function suffixFor(p: ParsedChord): string {
  switch (p.quality) {
    case 'half-diminished': return 'ø7';
    case 'diminished': return p.type.includes('seventh') ? '°7' : '°';
    case 'dominant': return p.type.includes('ninth') ? '9' : p.type.includes('thirteenth') ? '13' : '7';
    case 'major': return p.type.includes('seventh') ? 'maj7' : p.type.includes('sixth') ? '6' : '';
    case 'minor': return p.type.includes('seventh') ? '7' : p.type.includes('sixth') ? '6' : '';
    case 'augmented': return '+';
    case 'suspended': return 'sus';
    default: return '';
  }
}

function harmonicFunction(roman: string, p: ParsedChord, mode: 'major' | 'minor'): string {
  const base = roman.replace(/[^ivIV]/g, '').toUpperCase();
  const flat = roman.startsWith('b');
  if (!flat) {
    if (base === 'I' || base === 'VI' || (base === 'III' && mode === 'major')) return 'tonic';
    if (base === 'II' || base === 'IV') return 'subdominant';
    if (base === 'V' || base === 'VII') return 'dominant';
  }
  if (flat && base === 'VII' && mode === 'minor') return 'subdominant';
  if (flat && base === 'VI' && mode === 'minor') return 'subdominant';
  if (flat && base === 'III' && mode === 'minor') return 'tonic';
  if (p.quality === 'dominant') return 'secondary dominant';
  return 'chromatic';
}

export function analyzeProgression(song: Song): ProgressionAnalysis {
  const key = parseKey(song.key);
  const tonicChroma = Note.chroma(key.tonic) ?? 0;
  const flat = flattenMeasures(song);
  const chords: ChordAnalysis[] = [];
  const seq: Array<{ p: ParsedChord; measure: number; idx: number }> = [];

  flat.forEach(({ sectionIndex, measure }, i) => {
    for (const ch of measure.chords) {
      const p = parseChord(ch.symbol);
      if (p.isNoChord || !p.root) {
        chords.push({ measure: i + 1, section: song.sections[sectionIndex].name, symbol: ch.symbol, roman: '—', function: 'n.c.', diatonic: true });
        continue;
      }
      const { roman, diatonic } = romanFor(Note.chroma(p.root) ?? 0, tonicChroma, key.mode, p);
      chords.push({ measure: i + 1, section: song.sections[sectionIndex].name, symbol: ch.symbol, roman, function: harmonicFunction(roman, p, key.mode), diatonic });
      seq.push({ p, measure: i + 1, idx: chords.length - 1 });
    }
  });

  // Pattern detection on the chord sequence
  const patterns: string[] = [];
  const down5 = (a: string, b: string) => (((Note.chroma(a) ?? 0) - (Note.chroma(b) ?? 0)) % 12 + 12) % 12 === 7;
  for (let i = 0; i < seq.length; i++) {
    const a = seq[i], b = seq[i + 1], c = seq[i + 2];
    if (b && (a.p.quality === 'minor' || a.p.quality === 'half-diminished') && b.p.quality === 'dominant' && down5(a.p.root, b.p.root)) {
      if (c && down5(b.p.root, c.p.root) && (c.p.quality === 'major' || c.p.quality === 'minor')) {
        patterns.push(`ii–V–I in ${c.p.root}${c.p.quality === 'minor' ? ' minor' : ''}: ${a.p.symbol} → ${b.p.symbol} → ${c.p.symbol} (mm. ${a.measure}–${c.measure})`);
        chords[a.idx].function = chords[a.idx].function === 'chromatic' ? `ii of ${c.p.root}` : chords[a.idx].function;
        chords[b.idx].function = (Note.chroma(c.p.root) === tonicChroma) ? 'dominant' : `V of ${c.p.root}`;
      } else {
        patterns.push(`ii–V (unresolved): ${a.p.symbol} → ${b.p.symbol} (mm. ${a.measure}–${b.measure})`);
      }
    } else if (b && a.p.quality === 'dominant' && down5(a.p.root, b.p.root) && Note.chroma(b.p.root) !== tonicChroma) {
      patterns.push(`Secondary dominant: ${a.p.symbol} resolves to ${b.p.symbol} (m. ${a.measure})`);
      chords[a.idx].function = `V of ${b.p.root}`;
    } else if (b && a.p.quality === 'dominant' && (((Note.chroma(a.p.root) ?? 0) - (Note.chroma(b.p.root) ?? 0)) % 12 + 12) % 12 === 1) {
      patterns.push(`Tritone substitution: ${a.p.symbol} resolves down a half step to ${b.p.symbol} (m. ${a.measure})`);
      chords[a.idx].function = 'tritone sub';
    }
  }

  const nonDiatonic = chords.filter((c) => !c.diatonic).length;
  const summary = `${song.title} in ${formatKey(key)}: ${flat.length} measures, ${seq.length} chords, ${nonDiatonic} non-diatonic. ${patterns.length} idiom(s) detected.`;
  return { key: formatKey(key), chords, patterns, summary };
}
