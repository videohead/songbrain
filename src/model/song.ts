import type { Arrangement, Style } from './style';
import { validateStyle } from './style';

/**
 * Song Brain internal data model.
 * Chord progressions are the source of truth; everything else is derived.
 * This file is pure TypeScript with no UI or library dependencies so it
 * can be shared by the browser, the server, and any agent.
 */

export interface Chord {
  /** Chord symbol, e.g. "Cm7", "F7", "BbMaj7", "G7b9", "N.C." */
  symbol: string;
  /** Duration in beats (as defined by the meter's denominator). */
  beats: number;
}

export interface Measure {
  chords: Chord[];
}

export interface Section {
  name: string;
  measures: Measure[];
}

/** What the playback engine generates for a track. */
export type TrackRole = 'chords' | 'bass' | 'drums';

export interface Track {
  id: string;
  name: string;
  role: TrackRole;
  /** General MIDI program number 0-127. Drives live MIDI out, MIDI export and MusicXML. */
  program: number;
  /** MIDI channel 1-16. Channel 10 is reserved for drums. */
  channel: number;
  /** CC 7, 0-127 */
  level: number;
  /** CC 10, 0-127, 64 = center */
  pan: number;
  /** CC 91 reverb send, 0-127 */
  reverb: number;
  mute: boolean;
  solo: boolean;
  /** Chord voicing style for role "chords". Default derives from the GM program family. */
  voicing?: 'close' | 'shell' | 'rootless' | 'drop2' | 'guitar';
  /** Bass line style for role "bass". Default "roots-fifths". */
  bassStyle?: 'roots' | 'roots-fifths' | 'walking';
}

export interface Song {
  title: string;
  /** e.g. "G Minor", "Bb Major" */
  key: string;
  tempo: number;
  /** e.g. "4/4", "3/4" */
  meter: string;
  sections: Section[];
  /** Instrumentation and mix. Optional: songs without it get defaultTracks(). */
  tracks?: Track[];
  /** Which style plays each section. Optional: defaults to the built-in swing style. */
  arrangement?: Arrangement;
  /** Styles embedded in the song (custom or edited), keyed by id. Built-ins need not be embedded. */
  styles?: Record<string, Style>;
}

export function defaultTracks(): Track[] {
  return [
    { id: 'piano', name: 'Piano', role: 'chords', program: 0, channel: 1, level: 100, pan: 64, reverb: 30, mute: false, solo: false },
    { id: 'bass', name: 'Bass', role: 'bass', program: 32, channel: 2, level: 110, pan: 64, reverb: 10, mute: false, solo: false },
    { id: 'drums', name: 'Drums', role: 'drums', program: 0, channel: 10, level: 100, pan: 64, reverb: 20, mute: false, solo: false },
  ];
}

/** Tracks of a song, falling back to the defaults. */
export function songTracks(song: Song): Track[] {
  return song.tracks && song.tracks.length ? song.tracks : defaultTracks();
}

/** Tracks that should sound, honoring solo and mute. */
export function audibleTracks(tracks: Track[]): Track[] {
  const soloed = tracks.filter((t) => t.solo);
  return (soloed.length ? soloed : tracks).filter((t) => !t.mute);
}

export function parseMeter(meter: string): { beats: number; unit: number } {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(meter.trim());
  if (!m) return { beats: 4, unit: 4 };
  return { beats: Number(m[1]), unit: Number(m[2]) };
}

export function beatsPerMeasure(song: Song): number {
  return parseMeter(song.meter).beats;
}

/** Flatten all measures in order, with their section/measure addresses. */
export function flattenMeasures(song: Song): Array<{ sectionIndex: number; measureIndex: number; measure: Measure }> {
  const out: Array<{ sectionIndex: number; measureIndex: number; measure: Measure }> = [];
  song.sections.forEach((s, si) => s.measures.forEach((m, mi) => out.push({ sectionIndex: si, measureIndex: mi, measure: m })));
  return out;
}

export function totalMeasures(song: Song): number {
  return song.sections.reduce((n, s) => n + s.measures.length, 0);
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/** Structural validation of a song object (e.g. one produced by an LLM). */
export function validateSong(input: unknown): ValidationResult {
  const errors: string[] = [];
  const s = input as Partial<Song> | null;
  if (!s || typeof s !== 'object') return { ok: false, errors: ['song must be an object'] };
  if (typeof s.title !== 'string') errors.push('title must be a string');
  if (typeof s.key !== 'string') errors.push('key must be a string');
  if (typeof s.tempo !== 'number' || !(s.tempo > 0)) errors.push('tempo must be a positive number');
  if (typeof s.meter !== 'string' || !/^\d+\s*\/\s*\d+$/.test(s.meter)) errors.push('meter must look like "4/4"');
  if (!Array.isArray(s.sections)) {
    errors.push('sections must be an array');
    return { ok: false, errors };
  }
  if (s.tracks !== undefined) {
    if (!Array.isArray(s.tracks)) errors.push('tracks must be an array when present');
    else {
      const ids = new Set<string>();
      s.tracks.forEach((t, ti) => {
        const int = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
        if (typeof t?.id !== 'string' || !t.id) errors.push(`tracks[${ti}].id must be a non-empty string`);
        else if (ids.has(t.id)) errors.push(`tracks[${ti}].id "${t.id}" is duplicated`);
        else ids.add(t.id);
        if (typeof t?.name !== 'string') errors.push(`tracks[${ti}].name must be a string`);
        if (t?.role !== 'chords' && t?.role !== 'bass' && t?.role !== 'drums') errors.push(`tracks[${ti}].role must be "chords", "bass" or "drums"`);
        if (!int(t?.program, 0, 127)) errors.push(`tracks[${ti}].program must be an integer 0-127`);
        if (!int(t?.channel, 1, 16)) errors.push(`tracks[${ti}].channel must be an integer 1-16`);
        for (const k of ['level', 'pan', 'reverb'] as const) if (!int(t?.[k], 0, 127)) errors.push(`tracks[${ti}].${k} must be an integer 0-127`);
        for (const k of ['mute', 'solo'] as const) if (typeof t?.[k] !== 'boolean') errors.push(`tracks[${ti}].${k} must be a boolean`);
        if (t?.voicing !== undefined && !['close', 'shell', 'rootless', 'drop2', 'guitar'].includes(t.voicing)) errors.push(`tracks[${ti}].voicing is not a known style`);
        if (t?.bassStyle !== undefined && !['roots', 'roots-fifths', 'walking'].includes(t.bassStyle)) errors.push(`tracks[${ti}].bassStyle is not a known style`);
      });
    }
  }
  if (s.arrangement !== undefined) {
    const a = s.arrangement;
    if (!a || typeof a !== 'object' || typeof a.defaultStyle !== 'string') errors.push('arrangement.defaultStyle must be a string');
    else {
      if (a.sections !== undefined && (typeof a.sections !== 'object' || Object.values(a.sections).some((v) => typeof v !== 'string'))) errors.push('arrangement.sections must map section index to style id');
      if (a.substyles !== undefined && (typeof a.substyles !== 'object' || Object.values(a.substyles).some((v) => v !== 'a' && v !== 'b'))) errors.push('arrangement.substyles must map section index to "a" or "b"');
      if (a.seed !== undefined && !Number.isInteger(a.seed)) errors.push('arrangement.seed must be an integer');
      if (a.fills !== undefined && typeof a.fills !== 'boolean') errors.push('arrangement.fills must be a boolean');
      if (a.transitions !== undefined) {
        if (!Array.isArray(a.transitions)) errors.push('arrangement.transitions must be an array');
        else a.transitions.forEach((t, i) => {
          if (!(Number.isInteger(t?.beforeSection) && t.beforeSection >= 0)) errors.push(`transitions[${i}].beforeSection must be a section index`);
          if (!(typeof t?.bars === 'number' && t.bars > 0)) errors.push(`transitions[${i}].bars must be > 0`);
          if (t?.kind !== 'rush' && t?.kind !== 'relax') errors.push(`transitions[${i}].kind must be rush or relax`);
          if (!(typeof t?.amount === 'number' && t.amount >= 0 && t.amount <= 1)) errors.push(`transitions[${i}].amount must be 0..1`);
        });
      }
    }
  }
  if (s.styles !== undefined) {
    if (!s.styles || typeof s.styles !== 'object' || Array.isArray(s.styles)) errors.push('styles must be an object keyed by id');
    else for (const [id, st] of Object.entries(s.styles)) {
      for (const err of validateStyle(st)) errors.push(`styles.${id}: ${err}`);
      if ((st as Style)?.id !== id) errors.push(`styles.${id}: id must match key`);
    }
  }
  const bpm = typeof s.meter === 'string' ? parseMeter(s.meter).beats : 4;
  s.sections.forEach((sec, si) => {
    if (typeof sec?.name !== 'string') errors.push(`sections[${si}].name must be a string`);
    if (!Array.isArray(sec?.measures)) {
      errors.push(`sections[${si}].measures must be an array`);
      return;
    }
    sec.measures.forEach((m, mi) => {
      if (!Array.isArray(m?.chords)) {
        errors.push(`sections[${si}].measures[${mi}].chords must be an array`);
        return;
      }
      let sum = 0;
      m.chords.forEach((c, ci) => {
        if (typeof c?.symbol !== 'string' || !c.symbol.trim()) errors.push(`sections[${si}].measures[${mi}].chords[${ci}].symbol must be a non-empty string`);
        if (typeof c?.beats !== 'number' || !(c.beats > 0)) errors.push(`sections[${si}].measures[${mi}].chords[${ci}].beats must be positive`);
        else sum += c.beats;
      });
      if (m.chords.length > 0 && Math.abs(sum - bpm) > 1e-6) {
        errors.push(`sections[${si}].measures[${mi}] chords total ${sum} beats but meter has ${bpm}`);
      }
    });
  });
  return { ok: errors.length === 0, errors };
}

export function cloneSong(song: Song): Song {
  return JSON.parse(JSON.stringify(song));
}

export function emptyMeasure(beats: number): Measure {
  return { chords: [{ symbol: 'N.C.', beats }] };
}

/** Default demo song: a public-domain-style ii-V-I workout in G minor / Bb major. */
export function defaultSong(): Song {
  const bar = (symbol: string): Measure => ({ chords: [{ symbol, beats: 4 }] });
  const split = (a: string, b: string): Measure => ({ chords: [{ symbol: a, beats: 2 }, { symbol: b, beats: 2 }] });
  return {
    title: 'Falling Leaves',
    key: 'G Minor',
    tempo: 140,
    meter: '4/4',
    sections: [
      {
        name: 'A',
        measures: [bar('Cm7'), bar('F7'), bar('BbMaj7'), bar('EbMaj7'), bar('Am7b5'), bar('D7'), bar('Gm6'), bar('Gm6')],
      },
      {
        name: 'B',
        measures: [bar('Am7b5'), bar('D7b9'), bar('Gm6'), bar('Gm6'), bar('Cm7'), bar('F7'), bar('BbMaj7'), bar('EbMaj7')],
      },
      {
        name: 'C',
        measures: [bar('Am7b5'), bar('D7b9'), split('Gm7', 'C7'), split('Fm7', 'Bb7'), bar('EbMaj7'), split('Am7b5', 'D7b9'), bar('Gm6'), bar('Gm6')],
      },
    ],
  };
}
