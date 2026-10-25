/**
 * Progression Engine: structural operations on the Song model.
 * All functions are pure and return a new Song.
 */
import type { Chord, Measure, Song } from '../model/song';
import { beatsPerMeasure, cloneSong, emptyMeasure, flattenMeasures, totalMeasures } from '../model/song';
import { semitonesBetweenKeys, transposeChordSymbol, transposeKey, parseKey } from './harmony';

export interface MeasureAddress {
  sectionIndex: number;
  measureIndex: number;
}

/** Convert a 1-based global measure number into a section/measure address. */
export function locateMeasure(song: Song, measureNumber: number): MeasureAddress | null {
  const flat = flattenMeasures(song);
  const entry = flat[measureNumber - 1];
  return entry ? { sectionIndex: entry.sectionIndex, measureIndex: entry.measureIndex } : null;
}

export function transposeSong(song: Song, opts: { semitones?: number; toKey?: string }): Song {
  const semitones = opts.toKey !== undefined ? semitonesBetweenKeys(song.key, opts.toKey) : (opts.semitones ?? 0);
  const out = cloneSong(song);
  out.key = opts.toKey ? normalizeKeyText(opts.toKey, song.key) : transposeKey(song.key, semitones);
  const preferFlats = parseKey(out.key).preferFlats;
  for (const s of out.sections) for (const m of s.measures) for (const c of m.chords) c.symbol = transposeChordSymbol(c.symbol, semitones, preferFlats);
  return out;
}

/** "Bb" -> "Bb Minor" if the source key was minor and no mode was given. */
function normalizeKeyText(toKey: string, fromKey: string): string {
  const hasMode = /maj|min|m\b|-/i.test(toKey.replace(/^[A-G][#b]?/, ''));
  const from = parseKey(fromKey);
  const to = parseKey(hasMode ? toKey : `${toKey} ${from.mode}`);
  return `${to.tonic} ${to.mode === 'minor' ? 'Minor' : 'Major'}`;
}

/** Build measures from chord symbols; each symbol gets a full measure unless `perMeasure` groups them. */
export function measuresFromSymbols(song: Song, symbols: string[], chordsPerMeasure = 1): Measure[] {
  const bpm = beatsPerMeasure(song);
  const measures: Measure[] = [];
  for (let i = 0; i < symbols.length; i += chordsPerMeasure) {
    const group = symbols.slice(i, i + chordsPerMeasure);
    const each = bpm / group.length;
    measures.push({ chords: group.map((symbol): Chord => ({ symbol, beats: each })) });
  }
  return measures;
}

/**
 * Insert measures before the given 1-based global measure number.
 * A measureNumber of totalMeasures+1 appends to the last section.
 */
export function insertMeasures(song: Song, beforeMeasure: number, measures: Measure[]): Song {
  const out = cloneSong(song);
  const total = totalMeasures(out);
  if (out.sections.length === 0) out.sections.push({ name: 'A', measures: [] });
  if (beforeMeasure > total) {
    out.sections[out.sections.length - 1].measures.push(...measures);
    return out;
  }
  const addr = locateMeasure(out, Math.max(1, beforeMeasure));
  if (!addr) throw new Error(`Measure ${beforeMeasure} does not exist (song has ${total}).`);
  out.sections[addr.sectionIndex].measures.splice(addr.measureIndex, 0, ...measures);
  return out;
}

/** Replace a range of measures [from, to] (1-based global, inclusive) with new measures. */
export function replaceMeasures(song: Song, from: number, to: number, measures: Measure[]): Song {
  let out = deleteMeasures(song, from, to);
  out = insertMeasures(out, from, measures);
  return out;
}

export function deleteMeasures(song: Song, from: number, to: number = from): Song {
  const out = cloneSong(song);
  for (let n = to; n >= from; n--) {
    const addr = locateMeasure(out, n);
    if (!addr) continue;
    out.sections[addr.sectionIndex].measures.splice(addr.measureIndex, 1);
  }
  return out;
}

export function setMeasure(song: Song, addr: MeasureAddress, measure: Measure): Song {
  const out = cloneSong(song);
  out.sections[addr.sectionIndex].measures[addr.measureIndex] = measure;
  return out;
}

export function appendMeasure(song: Song, sectionIndex: number): Song {
  const out = cloneSong(song);
  out.sections[sectionIndex].measures.push(emptyMeasure(beatsPerMeasure(out)));
  return out;
}

export function addSection(song: Song, name?: string, measureCount = 8): Song {
  const out = cloneSong(song);
  const auto = String.fromCharCode(65 + out.sections.length);
  out.sections.push({ name: name ?? auto, measures: Array.from({ length: measureCount }, () => emptyMeasure(beatsPerMeasure(out))) });
  return out;
}

export function renameSection(song: Song, sectionIndex: number, name: string): Song {
  const out = cloneSong(song);
  out.sections[sectionIndex].name = name;
  return out;
}

export function removeSection(song: Song, sectionIndex: number): Song {
  const out = cloneSong(song);
  out.sections.splice(sectionIndex, 1);
  return out;
}

/** Parse a measure's text like "Cm7 F7" or "Dm7 | G7" into chords with even beat division. */
export function parseMeasureText(text: string, bpm: number): Measure {
  const parts = text.split(/[\s|]+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return emptyMeasure(bpm);
  // Support explicit beats via "Cm7:2 F7:2"
  const explicit = parts.map((p) => {
    const m = /^(.*?):(\d+(?:\.\d+)?)$/.exec(p);
    return m ? { symbol: m[1], beats: Number(m[2]) } : { symbol: p, beats: NaN };
  });
  const assigned = explicit.filter((c) => !Number.isNaN(c.beats)).reduce((a, c) => a + c.beats, 0);
  const unassigned = explicit.filter((c) => Number.isNaN(c.beats)).length;
  const remaining = Math.max(0, bpm - assigned);
  const each = unassigned ? remaining / unassigned : 0;
  return { chords: explicit.map((c) => ({ symbol: c.symbol, beats: Number.isNaN(c.beats) ? each : c.beats })) };
}

export function measureToText(m: Measure, bpm: number): string {
  const even = m.chords.length && m.chords.every((c) => Math.abs(c.beats - bpm / m.chords.length) < 1e-6);
  return m.chords.map((c) => (even ? c.symbol : `${c.symbol}:${c.beats}`)).join(' ');
}
