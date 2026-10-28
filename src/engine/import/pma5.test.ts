import { describe, expect, it } from 'vitest';
import { decodeEvents, decodeTimeSig, parsePma5Message, pma5ChordSymbol, pma5SongToChart, pma5StyleToMidi, readPma5Bank, unpack7 } from './pma5';
import { styleFromMidi } from '../style/learn';
import { validateStyle } from '../../model/style';
import { validateSong } from '../../model/song';

// --- a tiny PMA-5 dump writer, built from the protocol notes (not from the reader under test) ---
function pack7(d: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < d.length; i += 4) {
    const g = d.slice(i, i + 4);
    while (g.length < 4) g.push(0);
    out.push(g.reduce((h, b, k) => h | ((b >> 7) << k), 0), ...g.map((b) => b & 0x7f));
  }
  return out;
}
function dt1(addr: number[], data: number[]): number[] {
  const sum = (-(addr.reduce((a, b) => a + b, 0) + data.reduce((a, b) => a + b, 0))) & 0x7f;
  return [0xf0, 0x41, 0x10, 0x00, 0x05, 0x12, ...addr, ...data, sum, 0xf7];
}
/** A data block split into 140-byte pieces, piece number in the last two address bytes. */
function block(a0: number, a1: number, data: number[]): number[] {
  const out: number[] = [];
  for (let n = 0, i = 0; i < data.length || n === 0; n++, i += 140) out.push(...dt1([a0, a1, n >> 7, n & 0x7f], pack7(data.slice(i, i + 140))));
  return out;
}
const ev = (step: number, note: number, b2: number, b3: number) => [step, note, b2, b3];
const noteEv = (step: number, note: number, velIdx: number, len: number, track: number) => ev(step, note, (velIdx << 3) | ((len >> 6) & 7), ((len & 63) << 2) | track);
const pad = (s: string, n: number) => [...s.padEnd(n, ' ')].map((c) => c.charCodeAt(0));

function styleDir(name: string, bars: number, tempo: number, ts = 0x44) {
  const d60 = [ts, bars, tempo, 0, ...pad(name, 8), 0, 0, 0, 0];
  return { d60, d61: new Array(24).fill(0) };
}

function buildDump(): Uint8Array {
  const msgs: number[] = [...dt1([0, 0, 0, 0], [0, 0, 0, 0])];
  // Song 1 "DEMO": 4/4, Cmaj7 | Dm7 G7, tempo 120
  const control = [...ev(0, 0x89, 0x44, 0), ...ev(16, 0xc0, 0x8f, 26), ...ev(8, 0xc2, 0x8f, 17), ...ev(8, 0xc7, 0x8f, 49), ...ev(0, 0x8f, 0, 0)];
  msgs.push(...block(0x50, 0, [0, 120, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...pad('DEMO', 12)]));
  msgs.push(...block(0x52, 0, control), ...block(0x53, 0, [...ev(0, 0x8f, 0, 0)]));
  // User style 1 "ROCK8": one 4/4 bar. Kick on 1 and 3, snare on 2 and 4, eighth bass, one chord stab on 1.
  const data: number[] = [];
  const hits: Array<[number, number, number, number]> = [ // tick, note, track, length
    [0, 36, 3, 24], [96, 38, 3, 24], [192, 36, 3, 24], [288, 38, 3, 24],
    [0, 36, 2, 48], [48, 36, 2, 48], [96, 43, 2, 48], [144, 43, 2, 48], [192, 36, 2, 48], [240, 36, 2, 48], [288, 43, 2, 48], [336, 43, 2, 48],
    [0, 60, 0, 90], [0, 64, 0, 90], [0, 67, 0, 90],
  ];
  hits.sort((a, b) => a[0] - b[0]);
  hits.forEach((h, i) => { const next = hits[i + 1]?.[0] ?? 384; data.push(...noteEv(next - h[0], h[1], 5, h[3], h[2])); });
  data.push(...ev(0, 0x8f, 0, 0));
  const { d60, d61 } = styleDir('ROCK8', 1, 110);
  msgs.push(...block(0x60, 0, d60), ...block(0x61, 0, d61), ...block(0x62, 0, data));
  msgs.push(...dt1([0, 0, 0, 0x7f], [0, 0, 0, 0]));
  return Uint8Array.from(msgs);
}

describe('PMA-5 .syx reader', () => {
  it('unpacks 5→4 with bit 7 in the group head', () => {
    expect([...unpack7(Uint8Array.from([0b0101, 1, 2, 3, 4]))]).toEqual([0x81, 2, 0x83, 4]);
  });
  it('validates checksums', () => {
    const ok = Uint8Array.from(dt1([0x50, 0, 0, 0], [1, 2, 3]));
    expect(parsePma5Message(ok)).not.toBeNull();
    const bad = Uint8Array.from(ok); bad[bad.length - 2] ^= 1;
    expect(parsePma5Message(bad)).toBeNull();
  });
  it('lists songs and user styles, reassembling multi-piece blocks', () => {
    const bank = readPma5Bank(buildDump());
    expect(bank.songs.map((s) => [s.slot, s.name, s.tempo])).toEqual([[1, 'DEMO', 120]]);
    expect(bank.styles.map((s) => [s.slot, s.name, s.bars, s.tempo])).toEqual([[1, 'ROCK8', 1, 110]]);
  });
  it('reassembles blocks split into several pieces', () => {
    const notes = Array.from({ length: 300 }, (_, i) => i % 128);
    const dump = Uint8Array.from([...buildDump(), ...block(0x53, 0, notes)]);
    expect(readPma5Bank(dump).songs[0].noteBytes).toBe(300 + 4); // the dump's own 4-byte end marker + 300 more
  });
  it('rejects files with no PMA-5 data', () => {
    expect(() => readPma5Bank(Uint8Array.from([0xf0, 0x7e, 0x7f, 6, 1, 0xf7]))).toThrow(/No PMA-5/);
  });
});

describe('PMA-5 chords', () => {
  it('decodes time signature bytes', () => {
    expect(decodeTimeSig(0x44)).toEqual({ num: 4, den: 4 });
    expect(decodeTimeSig(0x68)).toEqual({ num: 6, den: 8 });
    expect(decodeTimeSig(0x00)).toBeNull();
  });
  it('names chords from root, type byte and bass', () => {
    expect(pma5ChordSymbol(0xc0, 0x8f, 27)).toBe('C');
    expect(pma5ChordSymbol(0xc2, 0x8f, 17)).toBe('Dm7');
    expect(pma5ChordSymbol(0xc7, 0x8f, 49)).toBe('G7');
    expect(pma5ChordSymbol(0xc0, 0x84, 27)).toBe('C/E');
    expect(pma5ChordSymbol(0xc1, 0x8f, 19)).toBe('Dbm');
    expect(pma5ChordSymbol(0xc0, 0x8f, 0)).toBe('N.C.');
  });
  it('builds a chart with uneven chords per bar', () => {
    const song = readPma5Bank(buildDump()).songs[0];
    const { song: chart } = pma5SongToChart(song);
    expect(chart.meter).toBe('4/4');
    expect(chart.tempo).toBe(120);
    expect(chart.sections[0].measures).toEqual([
      { chords: [{ symbol: 'Cmaj7', beats: 4 }] },
      { chords: [{ symbol: 'Dm7', beats: 2 }, { symbol: 'G7', beats: 2 }] },
    ]);
    expect(validateSong(chart).ok).toBe(true);
  });
});

describe('PMA-5 user style → Song Brain style', () => {
  const bank = readPma5Bank(buildDump());
  const conv = pma5StyleToMidi(bank.styles[0]);
  it('decodes events with velocity, length and part', () => {
    const { events, endTick } = decodeEvents(bank.styles[0].data);
    expect(endTick).toBe(384);
    expect(events[0]).toMatchObject({ tick: 0 });
    expect(conv.bars).toBe(1);
    expect(conv.beatsPerBar).toBe(4);
    expect(conv.midi.tracks.map((t) => t.notes.length)).toEqual([3, 8, 4]);
    expect(conv.midi.tracks[2].channel).toBe(10);
    expect(conv.midi.tracks[2].notes[0].velocity).toBe(100);
  });
  it('trains into a valid style with drums, bass and comping', () => {
    const { style } = styleFromMidi(conv.midi, { id: 'pma5-rock8', name: 'ROCK8', chart: [{ chords: [{ symbol: 'C', beats: 4 }] }], startBar: 0, patternBars: 1 });
    expect(validateStyle(style)).toEqual([]);
    expect(style.substyles.a.drums!.variations[0].hits.length).toBe(4);
    expect(style.substyles.a.bass!.variations.length).toBeGreaterThan(0);
    expect(style.substyles.a.comp!.variations.length).toBeGreaterThan(0);
  });
});
