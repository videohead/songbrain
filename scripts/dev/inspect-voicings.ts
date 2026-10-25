import { Note } from 'tonal';
import { voiceProgression, bassFor } from '../../src/engine/voicing';
import { defaultSong } from '../../src/model/song';
const syms = defaultSong().sections[0].measures.map((m) => m.chords[0].symbol);
for (const style of ['rootless', 'drop2', 'guitar', 'shell'] as const) {
  console.log(style.padEnd(9), voiceProgression(syms, style).map((v, i) => syms[i] + ': ' + v.join(' ')).join(' | '));
}
let prev: number | null = null; const out: string[] = [];
syms.forEach((s, i) => { const hits = bassFor(s, 4, 'walking', syms[(i + 1) % syms.length], prev); out.push(s + ': ' + hits.map((h) => h.note).join(' ')); prev = Note.midi(hits[hits.length - 1].note)!; });
console.log('walking  ', out.join(' | '));
