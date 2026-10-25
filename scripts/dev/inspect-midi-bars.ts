import fs from 'node:fs';
import { readMidi } from '../../src/engine/import/midiRead';
import { Note } from 'tonal';
const f = readMidi(new Uint8Array(fs.readFileSync(process.argv[2])));
const tpb = f.ppq, bpb = f.timeSignature.beats, tpbar = tpb * bpb;
for (const t of f.tracks) {
  if (!t.notes.length) continue;
  console.log(`== ${t.name.trim()} first onset tick ${t.notes[0].tick} (bar ${(t.notes[0].tick / tpbar + 1).toFixed(2)})`);
  const bars = new Map<number, string[]>();
  for (const n of t.notes) {
    const bar = Math.floor(n.tick / tpbar);
    const beat = ((n.tick % tpbar) / tpb + 1).toFixed(2);
    const name = t.channel === 10 ? String(n.pitch) : Note.fromMidi(n.pitch);
    (bars.get(bar) ?? bars.set(bar, []).get(bar)!).push(`${beat}:${name}`);
  }
  for (const [bar, ev] of [...bars.entries()].sort((a, b) => a[0] - b[0])) console.log(`  bar ${String(bar + 1).padStart(2)}: ${ev.join(' ')}`);
}
