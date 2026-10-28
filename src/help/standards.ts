import { parseMeasureText } from '../engine/progression';
import type { Song } from '../model/song';
import { parseMeter } from '../model/song';

/**
 * Starter charts: common chord patterns heard across rock, hip-hop and funk. They are generic progressions,
 * not any one song, so they belong to no one. Bars are written as text: chords in a bar are separated by a
 * space, exactly as typed into a grid cell.
 */
export interface Standard {
  id: string;
  title: string;
  key: string;
  meter: string;
  tempo: number;
  /** Built-in style that suits the pattern. */
  style: string;
  genre: string;
  blurb: string;
  sections: Array<{ name: string; bars: string[] }>;
}

export const STANDARDS: Standard[] = [
  {
    id: 'pop-rock', title: 'Four-Chord Loop (I–V–vi–IV)', key: 'C', meter: '4/4', tempo: 120, style: 'straight8', genre: 'Rock / pop',
    blurb: 'The most common progression in modern rock and pop. One chord per bar.',
    sections: [{ name: 'Loop', bars: ['C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F'] }],
  },
  {
    id: 'fifties', title: '50s Progression (I–vi–IV–V)', key: 'C', meter: '4/4', tempo: 130, style: 'straight8', genre: 'Rock \u2019n\u2019 roll',
    blurb: 'The doo-wop and early rock \u2019n\u2019 roll turnaround.',
    sections: [{ name: 'Loop', bars: ['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G'] }],
  },
  {
    id: 'mixolydian', title: 'Mixolydian Rock (I–\u266dVII–IV)', key: 'D', meter: '4/4', tempo: 120, style: 'straight8', genre: 'Classic rock',
    blurb: 'The bright, open sound of classic rock. Try a hard, driving style.',
    sections: [{ name: 'Riff', bars: ['D', 'C', 'G', 'D', 'D', 'C', 'G', 'D'] }],
  },
  {
    id: 'rock-blues', title: '12-Bar Blues in A', key: 'A', meter: '4/4', tempo: 100, style: 'swing', genre: 'Blues / rock',
    blurb: 'The backbone of blues and rock \u2019n\u2019 roll. Three chords over twelve bars.',
    sections: [{ name: 'Blues', bars: ['A7', 'A7', 'A7', 'A7', 'D7', 'D7', 'A7', 'A7', 'E7', 'D7', 'A7', 'E7'] }],
  },
  {
    id: 'andalusian', title: 'Andalusian Descent (i–\u266dVII–\u266dVI–V)', key: 'A Minor', meter: '4/4', tempo: 110, style: 'straight8', genre: 'Rock / hip-hop',
    blurb: 'A dramatic minor descent that appears in rock, flamenco and hip-hop samples.',
    sections: [{ name: 'Loop', bars: ['Am', 'G', 'F', 'E', 'Am', 'G', 'F', 'E'] }],
  },
  {
    id: 'hiphop-minor', title: 'Minor Loop (i–\u266dVI–\u266dIII–\u266dVII)', key: 'A Minor', meter: '4/4', tempo: 90, style: 'straight8', genre: 'Hip-hop / trap',
    blurb: 'The epic minor loop behind a lot of hip-hop and trap beats. Slow it down for boom-bap.',
    sections: [{ name: 'Loop', bars: ['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G'] }],
  },
  {
    id: 'neo-soul', title: 'Jazzy Hip-Hop Loop', key: 'C', meter: '4/4', tempo: 85, style: 'ballad', genre: 'Hip-hop / neo-soul',
    blurb: 'Extended chords over a ii–V–I–vi loop, the sound of sampled jazz and lo-fi beats.',
    sections: [{ name: 'Loop', bars: ['Dm9', 'G13', 'Cmaj9', 'Am9', 'Dm9', 'G13', 'Cmaj9', 'Cmaj9'] }],
  },
  {
    id: 'funk-vamp', title: 'Funk Vamp (i7–IV9)', key: 'E Dorian', meter: '4/4', tempo: 100, style: 'funk', genre: 'Funk',
    blurb: 'A Dorian two-chord groove that stays on the one chord and lets the rhythm do the work.',
    sections: [{ name: 'Vamp', bars: ['Em7', 'Em7', 'Em7', 'A9', 'Em7', 'Em7', 'Em7', 'A9'] }],
  },
  {
    id: 'funk-one', title: 'One-Chord Funk (E9)', key: 'E', meter: '4/4', tempo: 105, style: 'funk', genre: 'Funk',
    blurb: 'Dominant ninth, a single chord with a lift to the IV. Funk is about the groove, not the changes.',
    sections: [{ name: 'Groove', bars: ['E9', 'E9', 'E9', 'E9', 'E9', 'E9', 'A9', 'E9'] }],
  },
];

export function songFromStandard(s: Standard): Song {
  const bpm = parseMeter(s.meter).beats;
  return {
    title: s.title,
    key: s.key,
    tempo: s.tempo,
    meter: s.meter,
    arrangement: { defaultStyle: s.style },
    sections: s.sections.map((sec) => ({ name: sec.name, measures: sec.bars.map((b) => parseMeasureText(b, bpm)) })),
  };
}
