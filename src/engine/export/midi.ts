/**
 * Standard MIDI File (type 1) writer. No dependencies.
 * Track 1: meta (tempo, meter). Then one track per song track, on that
 * track's MIDI channel with its GM program and mixer controllers, so a file
 * re-imported into a DAW lands exactly where live Web MIDI output plays.
 */
import { Note } from 'tonal';
import type { Song } from '../../model/song';
import { audibleTracks, parseMeter } from '../../model/song';
import { buildSchedule, PPQ } from '../schedule';

function vlq(n: number): number[] {
  const bytes = [n & 0x7f];
  n >>= 7;
  while (n > 0) { bytes.unshift((n & 0x7f) | 0x80); n >>= 7; }
  return bytes;
}
function u32(n: number): number[] { return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]; }
function u16(n: number): number[] { return [(n >>> 8) & 0xff, n & 0xff]; }
function str(s: string): number[] { return Array.from(s, (c) => c.charCodeAt(0) & 0x7f); }

interface Ev { tick: number; data: number[]; order: number }

function trackChunk(events: Ev[]): number[] {
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const body: number[] = [];
  let last = 0;
  for (const e of events) { body.push(...vlq(e.tick - last), ...e.data); last = e.tick; }
  body.push(...vlq(0), 0xff, 0x2f, 0x00);
  return [...str('MTrk'), ...u32(body.length), ...body];
}

export interface MidiExportOptions {
  /** Include muted / non-soloed tracks anyway (default false: export what you hear). */
  includeSilent?: boolean;
}

export function songToMidi(song: Song, opts: MidiExportOptions = {}): Uint8Array<ArrayBuffer> {
  const meter = parseMeter(song.meter);
  const sched = buildSchedule(song);
  const usPerQuarter = Math.round(60_000_000 / song.tempo);
  const tracks = opts.includeSilent ? sched.tracks : audibleTracks(sched.tracks);

  const meta: Ev[] = [
    { tick: 0, order: 0, data: [0xff, 0x03, ...vlq(song.title.length), ...str(song.title)] },
    { tick: 0, order: 1, data: [0xff, 0x51, 0x03, (usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff] },
    { tick: 0, order: 2, data: [0xff, 0x58, 0x04, meter.beats, Math.log2(meter.unit), 24, 8] },
  ];

  const chunks = [trackChunk(meta)];
  for (const t of tracks) {
    const ch = (t.channel - 1) & 0x0f;
    const evs: Ev[] = [
      { tick: 0, order: 0, data: [0xff, 0x03, ...vlq(t.name.length), ...str(t.name)] },
      { tick: 0, order: 1, data: [0xc0 | ch, t.program & 0x7f] },
      { tick: 0, order: 2, data: [0xb0 | ch, 7, t.level & 0x7f] },
      { tick: 0, order: 3, data: [0xb0 | ch, 10, t.pan & 0x7f] },
      { tick: 0, order: 4, data: [0xb0 | ch, 91, t.reverb & 0x7f] },
    ];
    // Same pitch on the same channel must not overlap (ambiguous in MIDI): clamp each note to end before the next onset of that pitch.
    const byPitch = new Map<number, Array<{ on: number; off: number; vel: number }>>();
    for (const n of sched.notes) {
      if (n.trackId !== t.id) continue;
      for (const name of n.notes) {
        const midi = Note.midi(name);
        if (midi == null) continue;
        (byPitch.get(midi) ?? byPitch.set(midi, []).get(midi)!).push({ on: n.tick, off: n.tick + Math.max(1, n.durationTicks - 1), vel: n.velocity & 0x7f });
      }
    }
    for (const [midi, list] of byPitch) {
      list.sort((a, b) => a.on - b.on);
      for (let i = 0; i < list.length; i++) {
        const cur = list[i], next = list[i + 1];
        if (next && next.on <= cur.on) { continue; } // duplicate onset: skip (keep the first)
        const off = next ? Math.min(cur.off, next.on - 1) : cur.off;
        evs.push({ tick: cur.on, order: 10, data: [0x90 | ch, midi, cur.vel] });
        evs.push({ tick: Math.max(cur.on + 1, off), order: 5, data: [0x80 | ch, midi, 0] });
      }
    }
    chunks.push(trackChunk(evs));
  }

  const header = [...str('MThd'), ...u32(6), ...u16(1), ...u16(chunks.length), ...u16(PPQ)];
  return new Uint8Array([...header, ...chunks.flat()]);
}
