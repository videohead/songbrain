import type { Song } from '../model/song';

const A = ['Cmaj7', 'Am7', 'Dm7', 'G7', 'Cmaj7', 'Am7', 'Dm7', 'G7', 'Em7', 'A7', 'Dm7', 'G7', 'Cmaj7', 'Cmaj7', 'Cmaj7', 'Cmaj7'];
const B = ['Fmaj7', 'F#m7b5', 'Em7', 'A7', 'Dm7', 'G7', 'Em7', 'A7', 'D7', 'G7', 'C7', 'F7', 'Fm7', 'Bb7', 'Cdim', 'Cmaj7'];

/** The chart styles are trained against: 32 bars, one chord per bar, 4/4. */
export function trainingChartSong(): Song {
  const bars = (cs: string[]) => cs.map((symbol) => ({ chords: [{ symbol, beats: 4 }] }));
  return {
    title: 'Style Trainer',
    key: 'C Major',
    tempo: 120,
    meter: '4/4',
    sections: [{ name: 'A', measures: bars(A) }, { name: 'B', measures: bars(B) }],
  };
}
