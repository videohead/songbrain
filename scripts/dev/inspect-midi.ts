import fs from 'node:fs';
import { readMidi } from '../../src/engine/import/midiRead';
const f = readMidi(new Uint8Array(fs.readFileSync(process.argv[2])));
console.log(`format ${f.format}, ppq ${f.ppq}, ${f.tempoBpm} bpm, ${f.timeSignature.beats}/${f.timeSignature.unit}, ${f.tracks.length} tracks`);
const tpb = f.ppq;
for (const [i, t] of f.tracks.entries()) {
  if (!t.notes.length) { console.log(`#${i} "${t.name}" (no notes)`); continue; }
  const last = Math.max(...t.notes.map((n) => n.tick + n.durationTicks));
  const pitches = t.notes.map((n) => n.pitch);
  const poly = new Map<number, number>(); for (const n of t.notes) poly.set(n.tick, (poly.get(n.tick) ?? 0) + 1);
  const maxPoly = Math.max(...poly.values());
  console.log(`#${i} "${t.name}" ch${t.channel} prog=[${t.programs}] notes=${t.notes.length} bars≈${(last / tpb / f.timeSignature.beats).toFixed(1)} pitch ${Math.min(...pitches)}–${Math.max(...pitches)} maxPoly=${maxPoly}`);
  // Onset histogram by 1/12-beat position within the beat (shows swing)
  const hist = new Array(12).fill(0);
  for (const n of t.notes) hist[Math.round(((n.tick % tpb) / tpb) * 12) % 12]++;
  console.log('   onset pos within beat (1/12ths):', hist.join(' '));
  // First bar detail
  console.log('   bar 1:', t.notes.filter((n) => n.tick < 4 * tpb).map((n) => `${(n.tick / tpb).toFixed(2)}:${n.pitch}v${n.velocity}d${(n.durationTicks / tpb).toFixed(2)}`).join(' '));
}
