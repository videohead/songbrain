import type { Measure, Song } from './song';

/** Fixed jazz chart (G minor ii-V-I workout) for tests, so they don't depend on the app's demo song. */
export function jazzFixtureSong(): Song {
  const bar = (symbol: string): Measure => ({ chords: [{ symbol, beats: 4 }] });
  const split = (a: string, b: string): Measure => ({ chords: [{ symbol: a, beats: 2 }, { symbol: b, beats: 2 }] });
  return {
    title: 'Falling Leaves',
    key: 'G Minor',
    tempo: 140,
    meter: '4/4',
    sections: [
      { name: 'A', measures: [bar('Cm7'), bar('F7'), bar('BbMaj7'), bar('EbMaj7'), bar('Am7b5'), bar('D7'), bar('Gm6'), bar('Gm6')] },
      { name: 'B', measures: [bar('Am7b5'), bar('D7b9'), bar('Gm6'), bar('Gm6'), bar('Cm7'), bar('F7'), bar('BbMaj7'), bar('EbMaj7')] },
      { name: 'C', measures: [bar('Am7b5'), bar('D7b9'), split('Gm7', 'C7'), split('Fm7', 'Bb7'), bar('EbMaj7'), split('Am7b5', 'D7b9'), bar('Gm6'), bar('Gm6')] },
    ],
  };
}
