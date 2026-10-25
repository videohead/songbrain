/**
 * Standard MIDI File reader (type 0/1). No dependencies. Produces absolute-tick
 * notes per track with channel, program and name metadata, for the style learner.
 */
export interface MidiNote { tick: number; durationTicks: number; pitch: number; velocity: number; channel: number }
export interface MidiTrack { name: string; channel: number | null; programs: number[]; notes: MidiNote[] }
export interface MidiFile { ppq: number; format: number; tempoBpm: number; timeSignature: { beats: number; unit: number }; tracks: MidiTrack[] }

export function readMidi(bytes: Uint8Array): MidiFile {
  let pos = 0;
  const u8 = () => bytes[pos++];
  const u16 = () => ((u8() << 8) | u8()) >>> 0;
  const u32 = () => ((u8() << 24) | (u8() << 16) | (u8() << 8) | u8()) >>> 0;
  const str = (n: number) => { const s = String.fromCharCode(...bytes.slice(pos, pos + n)); pos += n; return s; };
  const vlq = () => { let v = 0, b; do { b = u8(); v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };

  if (str(4) !== 'MThd') throw new Error('Not a MIDI file');
  const hdrLen = u32();
  const format = u16();
  const ntrks = u16();
  const division = u16();
  pos += hdrLen - 6;
  if (division & 0x8000) throw new Error('SMPTE time division is not supported');
  const ppq = division;

  const file: MidiFile = { ppq, format, tempoBpm: 120, timeSignature: { beats: 4, unit: 4 }, tracks: [] };
  for (let t = 0; t < ntrks; t++) {
    if (str(4) !== 'MTrk') throw new Error(`Bad track chunk ${t}`);
    const len = u32();
    const end = pos + len;
    const track: MidiTrack = { name: '', channel: null, programs: [], notes: [] };
    const open = new Map<string, Array<{ tick: number; velocity: number }>>();
    let tick = 0;
    let running = 0;
    while (pos < end) {
      tick += vlq();
      let status = bytes[pos];
      if (status < 0x80) status = running; else { pos++; running = status; }
      if (status === 0xff) {
        const type = u8(); const l = vlq(); const start = pos;
        if (type === 0x03) track.name = str(l);
        else if (type === 0x51) { const us = (bytes[start] << 16) | (bytes[start + 1] << 8) | bytes[start + 2]; if (tick === 0 || file.tempoBpm === 120) file.tempoBpm = Math.round(60_000_000 / us); pos += l; }
        else if (type === 0x58) { file.timeSignature = { beats: bytes[start], unit: 2 ** bytes[start + 1] }; pos += l; }
        else pos += l;
        pos = start + l;
        continue;
      }
      if (status === 0xf0 || status === 0xf7) { const l = vlq(); pos += l; continue; }
      const kind = status & 0xf0, ch = status & 0x0f;
      if (kind === 0x90 || kind === 0x80) {
        const pitch = u8(), vel = u8();
        const key = `${ch}:${pitch}`;
        if (kind === 0x90 && vel > 0) {
          (open.get(key) ?? open.set(key, []).get(key)!).push({ tick, velocity: vel });
        } else {
          const o = open.get(key)?.shift();
          if (o) track.notes.push({ tick: o.tick, durationTicks: Math.max(1, tick - o.tick), pitch, velocity: o.velocity, channel: ch + 1 });
        }
        track.channel = track.channel ?? ch + 1;
      } else if (kind === 0xc0) { track.programs.push(u8()); track.channel = track.channel ?? ch + 1; }
      else if (kind === 0xd0) pos += 1;
      else pos += 2; // CC, pitch bend, poly AT
    }
    pos = end;
    track.notes.sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
    file.tracks.push(track);
  }
  return file;
}
