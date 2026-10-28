/**
 * Roland PMA-5 backup reader (.syx bulk dumps).
 *
 * Written from the format notes in richb93/pma5tool's PROTOCOL.md (message layout, 5→4 7-bit packing, block
 * addresses, 4-byte event format). It has not been checked against a dump from real hardware: treat results as
 * best effort and read `warnings`.
 *
 * Covers: splitting and validating the SysEx messages, assembling the song and user-style blocks, decoding a
 * user style's pattern into MIDI-like notes, and turning a song's control track into a chord chart.
 *
 * The chord-type data (which of the PMA-5's 26 chord types a chord byte means) is reference data about the
 * unit's own format; it is held here as plain tables, and each type's quality is derived from its root-position
 * intervals rather than from any name list.
 */
import type { MidiFile, MidiNote, MidiTrack } from './midiRead';
import type { Song } from '../../model/song';

export const PMA5_PPQ = 96;

/** Velocity for the 3-bit index stored in a note event. */
const VELOCITY_TABLE = [24, 40, 55, 70, 85, 100, 114, 127];

export interface Pma5Message { cmd: number; addr: [number, number, number, number]; data: Uint8Array }

export interface Pma5Song {
  /** 1-based slot, as shown on the unit. */
  slot: number;
  name: string;
  tempo: number;
  /** Control track (time signature, chords, style changes): 4-byte events, step in 16th notes. */
  control: Uint8Array;
  noteBytes: number;
}

export interface Pma5Event { tick: number; note: number; b2: number; b3: number; step: number }

export interface Pma5Style {
  /** 1-based user style number (U001-U200). */
  slot: number;
  name: string;
  /** Pattern length in bars, as stored in the style directory. */
  bars: number;
  tempo: number;
  /** Raw time-signature byte from the style directory (its encoding is not documented). */
  timeSigByte: number;
  data: Uint8Array;
}

export interface Pma5Bank { songs: Pma5Song[]; styles: Pma5Style[]; warnings: string[] }

// ---------------------------------------------------------------------------
// SysEx
// ---------------------------------------------------------------------------

/** 5 transmitted bytes → 4 data bytes. The first byte of each group holds bit 7 of the next four. */
export function unpack7(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < data.length; i += 5) {
    const head = data[i];
    for (let k = 1; k <= 4 && i + k < data.length; k++) out.push(data[i + k] | (((head >> (k - 1)) & 1) << 7));
  }
  return Uint8Array.from(out);
}

/** Split a .syx file into its F0…F7 messages. */
export function splitSysex(bytes: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  let start = -1;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0xf0) start = i;
    else if (bytes[i] === 0xf7 && start >= 0) { out.push(bytes.subarray(start, i + 1)); start = -1; }
  }
  return out;
}

/** Parse one PMA-5 (Roland, model 00 05) data message. Returns null for anything else or a bad checksum. */
export function parsePma5Message(raw: Uint8Array): Pma5Message | null {
  // F0 41 dev 00 05 cmd a1 a2 a3 a4 data… sum F7
  if (raw.length < 12 || raw[0] !== 0xf0 || raw[1] !== 0x41 || raw[3] !== 0x00 || raw[4] !== 0x05 || raw[raw.length - 1] !== 0xf7) return null;
  const body = raw.subarray(6, raw.length - 2);
  const sum = raw[raw.length - 2];
  if (((-body.reduce((a, b) => a + b, 0)) & 0x7f) !== sum) return null;
  return { cmd: raw[5], addr: [raw[6], raw[7], raw[8], raw[9]], data: raw.subarray(10, raw.length - 2) };
}

// ---------------------------------------------------------------------------
// Bank
// ---------------------------------------------------------------------------

const text = (b: Uint8Array) => String.fromCharCode(...b).replace(/[^\x20-\x7e]/g, ' ').trim();

export function readPma5Bank(bytes: Uint8Array): Pma5Bank {
  const warnings: string[] = [];
  const pieces = new Map<string, Array<{ n: number; data: Uint8Array }>>();
  let messages = 0, bad = 0;
  for (const raw of splitSysex(bytes)) {
    const m = parsePma5Message(raw);
    if (!m) { bad++; continue; }
    messages++;
    const [a0, a1, a2, a3] = m.addr;
    if (m.cmd !== 0x12 || a0 < 0x30 || a0 > 0x7f || a0 === 0x7f) continue; // control messages
    const packed = m.data;
    if (packed.length % 5 === 0 && packed.some((_, i) => i % 5 === 0 && (packed[i] & 0xf0) !== 0)) warnings.push(`Block ${a0.toString(16)} ${a1.toString(16)} has an unexpected packing header.`);
    const key = `${a0}:${a1}`;
    (pieces.get(key) ?? pieces.set(key, []).get(key)!).push({ n: (a2 << 7) | a3, data: unpack7(packed) });
  }
  if (!messages) throw new Error('No PMA-5 SysEx data found in this file.');
  if (bad) warnings.push(`${bad} SysEx message(s) were skipped (wrong device or bad checksum).`);

  const block = (a0: number, a1: number): Uint8Array | null => {
    const ps = pieces.get(`${a0}:${a1}`);
    if (!ps) return null;
    const sorted = [...ps].sort((a, b) => a.n - b.n);
    const out = new Uint8Array(sorted.reduce((s, p) => s + p.data.length, 0));
    let o = 0;
    for (const p of sorted) { out.set(p.data, o); o += p.data.length; }
    return out;
  };

  const songs: Pma5Song[] = [];
  for (let ss = 0; ss < 20; ss++) {
    const dir = block(0x50, ss), control = block(0x52, ss);
    if (!dir || !control || !control.length) continue;
    songs.push({ slot: ss + 1, name: text(dir.subarray(12, 24)) || `Song ${ss + 1}`, tempo: dir[1], control, noteBytes: block(0x53, ss)?.length ?? 0 });
  }

  const styles: Pma5Style[] = [];
  for (let n = 0; n < 200; n++) {
    const hi = n < 100 ? 0x60 : 0x70, ss = n % 100;
    const dir = block(hi, ss), data = block(hi + 2, ss);
    if (!dir || !data || !data.length) continue;
    const name = text(dir.subarray(4, 12));
    if (!name) continue;
    styles.push({ slot: n + 1, name, bars: dir[1], tempo: dir[2], timeSigByte: dir[0], data });
  }
  return { songs, styles, warnings };
}

// ---------------------------------------------------------------------------
// Pattern events
// ---------------------------------------------------------------------------

/** Decode a 4-byte-event list (`step note b2 b3`) into events with absolute ticks, up to the end marker. */
export function decodeEvents(data: Uint8Array): { events: Pma5Event[]; endTick: number } {
  const events: Pma5Event[] = [];
  let tick = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    const step = data[i], note = data[i + 1];
    if (note === 0x8f) return { events, endTick: tick };
    events.push({ tick, note, b2: data[i + 2], b3: data[i + 3], step });
    tick += step;
  }
  return { events, endTick: tick };
}

const STYLE_PARTS: Array<{ name: string; channel: number }> = [
  { name: 'Chord 1', channel: 5 },
  { name: 'Chord 2', channel: 6 },
  { name: 'Bass', channel: 7 },
  { name: 'Drums', channel: 10 },
];

export interface Pma5StyleMidi { midi: MidiFile; bars: number; beatsPerBar: number; warnings: string[] }

/**
 * Turn a user style's pattern into the same note structure the MIDI style trainer reads. Chord parts are merged
 * into one track (the trainer keeps one comping pattern). The pattern is recorded in C on the PMA-5.
 */
export function pma5StyleToMidi(style: Pma5Style): Pma5StyleMidi {
  const warnings: string[] = [];
  const { events, endTick } = decodeEvents(style.data);
  const parts: MidiNote[][] = [[], [], [], []];
  const held = new Map<string, MidiNote>();
  for (const e of events) {
    if (e.note > 127) continue; // controllers, pitch bend, program change, rests
    const part = e.b3 & 3;
    const key = `${part}:${e.note}`;
    if (e.b2 & 0x80) { // release of a held note
      const n = held.get(key);
      if (n) { n.durationTicks = Math.max(1, e.tick - n.tick); held.delete(key); }
      continue;
    }
    const note: MidiNote = {
      tick: e.tick,
      durationTicks: Math.max(1, ((e.b2 & 7) << 6) | (e.b3 >> 2)),
      pitch: e.note,
      velocity: VELOCITY_TABLE[(e.b2 >> 3) & 7],
      channel: STYLE_PARTS[part].channel,
    };
    if (e.b2 & 0x40) held.set(key, note);
    parts[part].push(note);
  }

  // Bar length comes from the directory's time-signature byte; the pattern length is only a cross-check.
  let bars = style.bars;
  const ts = decodeTimeSig(style.timeSigByte);
  let beatsPerBar = ts && ts.den === 4 ? ts.num : 4;
  if (!ts || ts.den !== 4) warnings.push('Only quarter-note time signatures are converted; assuming 4/4.');
  if (endTick > 0) {
    const barTicks = beatsPerBar * PMA5_PPQ;
    if (!bars || Math.abs(endTick - bars * barTicks) > PMA5_PPQ / 4) {
      const inferred = bars ? endTick / PMA5_PPQ / bars : 0;
      if (Number.isInteger(inferred) && inferred >= 2 && inferred <= 7) { warnings.push(`Time signature byte says ${beatsPerBar}/4 but the pattern fits ${inferred}/4; using ${inferred}/4.`); beatsPerBar = inferred; }
      else { warnings.push(`Pattern length (${endTick} ticks) doesn't match ${bars} bar(s) of ${beatsPerBar}/4; using ${Math.max(1, Math.round(endTick / barTicks))} bar(s).`); bars = Math.max(1, Math.round(endTick / barTicks)); }
    }
  }
  if (!bars) bars = 1;

  const chords = [...parts[0], ...parts[1]].sort((a, b) => a.tick - b.tick);
  const tracks: MidiTrack[] = [
    { name: 'Chords', channel: 5, programs: [], notes: chords },
    { name: 'Bass', channel: 7, programs: [], notes: parts[2] },
    { name: 'Drums', channel: 10, programs: [], notes: parts[3] },
  ];
  if (!tracks.some((t) => t.notes.length)) warnings.push('This style has no notes.');
  return { midi: { ppq: PMA5_PPQ, format: 1, tempoBpm: style.tempo || 120, timeSignature: { beats: beatsPerBar, unit: 4 }, tracks }, bars, beatsPerBar, warnings };
}

// ---------------------------------------------------------------------------
// Song control track → chord chart
// ---------------------------------------------------------------------------

/** Time-signature byte: numerator in the high nibble, denominator code (4, 8 or C = 16) in the low nibble. */
export function decodeTimeSig(byte: number): { num: number; den: number } | null {
  const num = byte >> 4, code = byte & 15;
  const den = code === 4 ? 4 : code === 8 ? 8 : code === 0xc ? 16 : 0;
  return num >= 1 && den ? { num, den } : null;
}

/** Chord byte (b3 & 0x3F) → chord type 0-25, 0xFF = none. */
const CHORD_TYPE_OF_BYTE = Uint8Array.from('ff06ffffffffffff090cffffffff0e0d0a121110ff0f14ff08ff0100ff0207ffff17ff16ffffffffff04ff15ffff13ff0503ff1affff0bffff19ff18ffffff00'.match(/../g)!.map((h) => parseInt(h, 16)));

/** Symbol suffix for each of the 26 chord types, from the type's root-position intervals. */
const CHORD_SUFFIX = ['', 'maj7', 'maj9', '7', '7b5', '13', '7b9', '7#9', '6', '6/9', 'm6', 'm6/9', '9', 'add9', 'madd9', 'mMaj9', 'm', 'mMaj7', 'm7', 'm7b5', 'm9', 'dim7', 'sus4', '7sus4', 'aug', '7#5'];

const ROOT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Chord symbol for a control-track chord event `Cr b2 b3`. */
export function pma5ChordSymbol(status: number, b2: number, b3: number): string {
  const root = status & 15;
  const type = CHORD_TYPE_OF_BYTE[b3 & 0x3f];
  if (root > 11 || type === 0xff || type >= CHORD_SUFFIX.length) return 'N.C.';
  const bass = b2 & 15;
  const slash = bass !== 15 && bass !== root && bass <= 11 ? `/${ROOT_NAMES[bass]}` : '';
  return `${ROOT_NAMES[root]}${CHORD_SUFFIX[type]}${slash}`;
}

export interface Pma5Chart { song: Song; warnings: string[] }

/** Convert a song's control track into a Song Brain chart: meter, one measure per bar, chords with beat lengths. */
export function pma5SongToChart(s: Pma5Song): Pma5Chart {
  const warnings: string[] = [];
  let tick = 0, num = 4, den = 4, haveSig = false, styleChanges = 0, end = -1;
  const chords: Array<{ tick: number; symbol: string }> = [];
  for (let i = 0; i + 3 < s.control.length; i += 4) {
    const step = s.control[i], c = s.control[i + 1], b2 = s.control[i + 2], b3 = s.control[i + 3];
    if (c === 0x8f) { end = tick; break; }
    if (c === 0x89 && !haveSig) {
      const ts = decodeTimeSig(b2);
      if (ts) { num = ts.num; den = ts.den; haveSig = true; } else warnings.push('Unreadable time signature; assuming 4/4.');
    } else if ((c & 0xf0) === 0xc0) chords.push({ tick, symbol: pma5ChordSymbol(c, b2, b3) });
    else if (c === 0xd0) styleChanges++;
    tick += step;
  }
  if (end < 0) end = tick;
  const unit = 16 / den; // 16th notes per beat
  const barLen = num * unit;
  const bars = Math.max(1, Math.ceil(end / barLen));
  if (!chords.length) warnings.push('This song has no chord events.');
  if (styleChanges) warnings.push(`${styleChanges} style/variation change(s) in the song were not converted; pick a style in Song Brain.`);

  const measures = [];
  let carry = 'N.C.', ci = 0;
  for (let b = 0; b < bars; b++) {
    const start = b * barLen, stop = start + barLen;
    const marks: Array<{ at: number; symbol: string }> = [];
    while (ci < chords.length && chords[ci].tick < stop) {
      if (chords[ci].tick <= start) carry = chords[ci].symbol; else marks.push({ at: chords[ci].tick, symbol: chords[ci].symbol });
      ci++;
    }
    const segs = [{ at: start, symbol: carry }, ...marks];
    const out: Array<{ symbol: string; beats: number }> = [];
    segs.forEach((seg, k) => {
      const beats = ((segs[k + 1]?.at ?? stop) - seg.at) / unit;
      if (out.length && out[out.length - 1].symbol === seg.symbol) out[out.length - 1].beats += beats;
      else out.push({ symbol: seg.symbol, beats });
    });
    carry = segs[segs.length - 1].symbol;
    measures.push({ chords: out });
  }
  return { song: { title: s.name, key: 'C', tempo: s.tempo || 120, meter: `${num}/${den}`, sections: [{ name: 'Song', measures }] }, warnings };
}
