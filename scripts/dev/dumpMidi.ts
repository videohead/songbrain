/** Dev spike: dump MIDI events (tick, note, vel) per track for inspecting learned patterns. */
import fs from 'node:fs';
import { readMidi } from '../../src/engine/import/midiRead';

const file = process.argv[2];
const onlyDrums = process.argv.includes('--drums');
const f = readMidi(new Uint8Array(fs.readFileSync(file)));
console.log(`ppq=${f.ppq} format=${f.format} tempo=${f.tempoBpm} sig=${f.timeSignature.beats}/${f.timeSignature.unit}`);
for (const t of f.tracks) {
  const isDrums = t.channel === 10;
  if (onlyDrums && !isDrums) continue;
  console.log(`\nTRACK "${t.name}" ch=${t.channel} programs=[${t.programs}] notes=${t.notes.length}`);
  for (const n of t.notes) console.log(`  tick=${n.tick} dur=${n.durationTicks} note=${n.pitch} vel=${n.velocity}`);
}
