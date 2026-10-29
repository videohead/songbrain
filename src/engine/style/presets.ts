/** Built-in styles (v2). All 4/4. Beats are 0-based within the pattern. */
import type { CompHit, DrumHit, BassHit, Style } from '../../model/style';
import { GM_DRUMS as D } from '../../model/style';

const h = (beat: number, duration: number, velocity: number) => ({ beat, duration, velocity });
const comp = (beat: number, duration: number, velocity: number, voice: CompHit['voice'] = 'full', extra: Partial<CompHit> = {}): CompHit => ({ ...h(beat, duration, velocity), voice, ...extra });
const bass = (beat: number, duration: number, velocity: number, degree: BassHit['degree'], extra: Partial<BassHit> = {}): BassHit => ({ ...h(beat, duration, velocity), degree, ...extra });
const dr = (beat: number, velocity: number, drum: number, duration = 0.5): DrumHit => ({ ...h(beat, duration, velocity), drum });
const hats8 = (loud: number, soft: number, drum: number = D.hhClosed) => Array.from({ length: 8 }, (_, i) => dr(i * 0.5, i % 2 ? soft : loud, drum));

const swingRide = [dr(0, 84, D.ride, 1), dr(1, 72, D.ride), dr(1.5, 60, D.ride), dr(2, 84, D.ride, 1), dr(3, 72, D.ride), dr(3.5, 60, D.ride), dr(1, 70, D.hhPedal), dr(3, 70, D.hhPedal)];

export const SWING: Style = {
  id: 'swing', name: 'Swing', description: 'Medium swing. A: Charleston comping, walking bass, ride. B: busier comping with pushes, ride bell.',
  bars: 1, beatsPerBar: 4,
  feel: { swing: 0.6, pushPull: 0, humanize: 3, accents: [1, 0.9, 0.95, 0.9], rolePushPull: { drums: -2, chords: 3 } },
  substyles: {
    a: {
      comp: { variations: [
        { hits: [comp(0, 1.5, 82), comp(1.5, 0.5, 70), comp(3, 0.75, 66)], weight: 3 },
        { hits: [comp(0, 1, 80), comp(2.5, 0.5, 72), comp(3.5, 0.5, 68, 'full', { push: 0.5 })], weight: 2 },
        { hits: [comp(1, 1, 74), comp(2.5, 1.5, 70)], weight: 1 },
      ] },
      bass: { style: 'walking', variations: [] },
      drums: {
        variations: [{ hits: [...swingRide, dr(0, 46, D.kick), dr(2, 40, D.kick)] }],
        fills: [{ hits: [...swingRide.slice(0, 4), dr(2, 70, D.snare), dr(2.5, 60, D.snare), dr(3, 76, D.midTom), dr(3.5, 84, D.lowTom), dr(1, 70, D.hhPedal)] }],
      },
    },
    b: {
      comp: { variations: [
        { hits: [comp(0, 0.5, 86), comp(1.5, 0.5, 78), comp(2, 0.5, 80), comp(3.5, 0.5, 76, 'full', { push: 0.5 })], weight: 2 },
        { hits: [comp(0.5, 0.5, 80), comp(1.5, 0.5, 76), comp(2.5, 0.5, 78), comp(3.5, 0.5, 80, 'full', { push: 0.5 })], weight: 1 },
      ] },
      bass: { style: 'walking', variations: [] },
      drums: {
        variations: [{ hits: [...swingRide.map((x) => ({ ...x, velocity: Math.min(127, x.velocity + 10) })), dr(0, 56, D.kick), dr(2, 50, D.kick), dr(1.5, 62, D.snare), dr(3.5, 58, D.snare)] }],
        fills: [{ hits: [dr(0, 90, D.snare), dr(0.5, 70, D.snare), dr(1, 90, D.snare), dr(1.5, 80, D.highTom), dr(2, 86, D.midTom), dr(2.5, 80, D.midTom), dr(3, 96, D.lowTom), dr(3.5, 100, D.crash)] }],
      },
    },
  },
};

const clave = [dr(0, 80, D.sideStick), dr(1.5, 76, D.sideStick), dr(3, 78, D.sideStick), dr(5, 78, D.sideStick), dr(6, 76, D.sideStick)];
const bossaKick = [0, 1.5, 2, 3.5, 4, 5.5, 6, 7.5].map((b, i) => dr(b, i % 2 ? 70 : 80, D.kick));
const hats16bars2 = Array.from({ length: 16 }, (_, i) => dr(i * 0.5, i % 2 ? 48 : 60, D.hhClosed));

export const BOSSA: Style = {
  id: 'bossa', name: 'Bossa Nova', description: 'Two-bar bossa clave with syncopated comping and root-fifth bass. B: fuller comping, shaker.',
  bars: 2, beatsPerBar: 4,
  feel: { swing: 0, pushPull: 0, humanize: 2, accents: [1, 0.85, 0.95, 0.85] },
  substyles: {
    a: {
      comp: { variations: [{ hits: [comp(0, 1, 78), comp(1.5, 1, 72), comp(3, 1, 74), comp(5, 1, 74), comp(6, 1, 72)] }] },
      bass: { style: 'roots-fifths', variations: [{ hits: [
        bass(0, 1.5, 92, 'root'), bass(1.5, 1.5, 80, 'fifth'), bass(3, 0.5, 84, 'root'), bass(3.5, 0.5, 80, 'fifth'),
        bass(4, 1.5, 92, 'root'), bass(5.5, 1.5, 80, 'fifth'), bass(7, 0.5, 84, 'root'), bass(7.5, 0.5, 80, 'fifth'),
      ] }] },
      drums: { variations: [{ hits: [...clave, ...hats16bars2, ...bossaKick] }] },
    },
    b: {
      comp: { variations: [{ hits: [comp(0, 0.5, 80), comp(1, 0.5, 70, 'top'), comp(1.5, 1, 76), comp(3, 0.5, 76), comp(3.5, 0.5, 70, 'top', { push: 0.5 }), comp(5, 1, 78), comp(6, 0.5, 74), comp(7, 0.5, 72, 'top', { push: 1 })] }] },
      bass: { style: 'roots-fifths', variations: [{ hits: [
        bass(0, 1.5, 96, 'root'), bass(1.5, 1, 84, 'fifth'), bass(2.5, 0.5, 80, 'octave'), bass(3, 0.5, 86, 'root'), bass(3.5, 0.5, 80, 'fifth'),
        bass(4, 1.5, 96, 'root'), bass(5.5, 1, 84, 'fifth'), bass(6.5, 0.5, 80, 'octave'), bass(7, 0.5, 86, 'root'), bass(7.5, 0.5, 82, 'approach'),
      ] }] },
      drums: { variations: [{ hits: [...clave, ...hats16bars2, ...bossaKick, ...Array.from({ length: 16 }, (_, i) => dr(i * 0.5, i % 2 ? 40 : 56, D.shaker))] }] },
    },
  },
};

export const BALLAD: Style = {
  id: 'ballad', name: 'Ballad', description: 'Slow: sustained chord then gentle arpeggio, half-note bass, brushes. B: flowing 8th-note arpeggios.',
  bars: 1, beatsPerBar: 4,
  feel: { swing: 0.2, pushPull: 4, humanize: 4, accents: [1, 0.75, 0.9, 0.75] },
  substyles: {
    a: {
      comp: { variations: [
        { hits: [comp(0, 2, 72), comp(2, 1, 58, 'arpUp'), comp(3, 1, 56, 'arpUp')], weight: 2 },
        { hits: [comp(0, 1, 70, 'bottom'), comp(1, 1, 60, 'arpUp'), comp(2, 2, 72)], weight: 1 },
      ] },
      bass: { style: 'roots-fifths', variations: [] },
      drums: { variations: [{ hits: [...[0, 1, 2, 3].map((b) => dr(b, b % 2 ? 40 : 52, D.hhClosed, 1)), dr(0, 56, D.kick, 1), dr(2, 62, D.sideStick, 1)] }] },
    },
    b: {
      comp: { variations: [{ hits: Array.from({ length: 8 }, (_, i) => comp(i * 0.5, 0.6, i % 2 ? 54 : 62, i === 0 ? 'bottom' : 'arpUp')) }] },
      bass: { style: 'roots-fifths', variations: [{ hits: [bass(0, 2, 88, 'root'), bass(2, 1, 76, 'fifth'), bass(3, 1, 72, 'third')] }] },
      drums: { variations: [{ hits: [...hats8(52, 40), dr(0, 60, D.kick), dr(2, 70, D.sideStick), dr(3.5, 44, D.kick)] }] },
    },
  },
};

export const STRAIGHT8: Style = {
  id: 'straight8', name: 'Straight 8ths', description: 'Pop/rock: even 8th-note comping, quarter-note bass, backbeat. B: open hats, syncopated bass.',
  bars: 1, beatsPerBar: 4,
  feel: { swing: 0, pushPull: 0, humanize: 2, accents: [1, 0.85, 0.95, 0.85] },
  substyles: {
    a: {
      comp: { variations: [
        { hits: Array.from({ length: 8 }, (_, i) => comp(i * 0.5, 0.45, i % 2 ? 62 : 76)), weight: 3 },
        { hits: [comp(0, 1, 80), comp(1, 0.5, 64), comp(1.5, 0.5, 70), comp(2.5, 0.5, 70), comp(3, 0.5, 66), comp(3.5, 0.5, 72, 'full', { push: 0.5 })], weight: 1 },
      ] },
      bass: { style: 'roots', variations: [{ hits: [bass(0, 1, 96, 'root'), bass(1, 1, 84, 'root'), bass(2, 1, 90, 'fifth'), bass(3, 1, 84, 'root')] }] },
      drums: {
        variations: [{ hits: [...hats8(72, 56), dr(0, 100, D.kick), dr(2, 96, D.kick), dr(1, 100, D.snare), dr(3, 100, D.snare)] }],
        fills: [{ hits: [...hats8(72, 56).slice(0, 4), dr(0, 100, D.kick), dr(1, 100, D.snare), dr(2, 90, D.snare, 0.25), dr(2.25, 80, D.snare, 0.25), dr(2.5, 92, D.highTom, 0.25), dr(2.75, 84, D.highTom, 0.25), dr(3, 96, D.midTom), dr(3.5, 104, D.lowTom)] }],
      },
    },
    b: {
      comp: { variations: [{ hits: [comp(0, 0.5, 84), comp(0.5, 0.5, 66), comp(1, 0.5, 78), comp(1.5, 0.5, 66), comp(2, 0.5, 80), comp(2.5, 0.5, 68), comp(3, 0.5, 78), comp(3.5, 0.5, 80, 'full', { push: 0.5 })] }] },
      bass: { style: 'roots', variations: [{ hits: [bass(0, 0.75, 100, 'root'), bass(0.75, 0.25, 80, 'root'), bass(1.5, 0.5, 90, 'root'), bass(2, 0.5, 92, 'fifth'), bass(2.5, 0.5, 80, 'octave'), bass(3, 0.5, 90, 'root'), bass(3.5, 0.5, 88, 'approach')] }] },
      drums: {
        variations: [{ hits: [...hats8(80, 64, D.hhOpen), dr(0, 104, D.kick), dr(2.5, 92, D.kick), dr(1, 108, D.snare), dr(3, 108, D.snare), dr(0, 90, D.crash, 1)] }],
        fills: [{ hits: [dr(0, 104, D.kick), dr(1, 108, D.snare), dr(1.5, 90, D.snare, 0.25), dr(1.75, 90, D.snare, 0.25), dr(2, 100, D.highTom), dr(2.5, 100, D.midTom), dr(3, 104, D.lowTom), dr(3.5, 110, D.crash)] }],
      },
    },
  },
};

const hats16 = Array.from({ length: 16 }, (_, i) => dr(i * 0.25, i % 4 === 0 ? 80 : i % 2 ? 44 : 60, D.hhClosed, 0.25));

export const FUNK: Style = {
  id: 'funk', name: 'Funk', description: 'Sixteenth-note hats, syncopated stabs, octave bass with approach notes. B: busier with open hats.',
  bars: 1, beatsPerBar: 4,
  feel: { swing: 0.15, pushPull: -2, humanize: 2, accents: [1, 0.9, 0.95, 0.9], rolePushPull: { bass: -2, chords: 2 } },
  substyles: {
    a: {
      comp: { variations: [
        { hits: [comp(0, 0.25, 84), comp(0.75, 0.25, 70, 'top'), comp(1.5, 0.25, 80), comp(2.5, 0.25, 76), comp(3.25, 0.25, 70, 'top')], weight: 2 },
        { hits: [comp(0, 0.25, 84), comp(1.5, 0.25, 80), comp(2.75, 0.25, 74), comp(3.5, 0.25, 78, 'full', { push: 0.5 })], weight: 1 },
      ] },
      bass: { style: 'roots', variations: [{ hits: [bass(0, 0.5, 100, 'root'), bass(0.75, 0.25, 84, 'octave'), bass(1.5, 0.5, 92, 'root'), bass(2.5, 0.5, 90, 'fifth'), bass(3.5, 0.5, 86, 'approach')] }] },
      drums: {
        variations: [{ hits: [...hats16, dr(0, 104, D.kick, 0.25), dr(1.75, 88, D.kick, 0.25), dr(2.5, 96, D.kick, 0.25), dr(1, 104, D.snare, 0.25), dr(3, 104, D.snare, 0.25), dr(3.75, 60, D.snare, 0.25)] }],
        fills: [{ hits: [...hats16.slice(0, 8), dr(0, 104, D.kick, 0.25), dr(1, 104, D.snare, 0.25), dr(2, 96, D.snare, 0.25), dr(2.25, 70, D.snare, 0.25), dr(2.5, 96, D.highTom, 0.25), dr(2.75, 70, D.highTom, 0.25), dr(3, 100, D.midTom, 0.25), dr(3.25, 80, D.midTom, 0.25), dr(3.5, 104, D.lowTom, 0.25), dr(3.75, 90, D.lowTom, 0.25)] }],
      },
    },
    b: {
      comp: { variations: [{ hits: [comp(0, 0.25, 88), comp(0.5, 0.25, 72, 'top'), comp(0.75, 0.25, 74, 'top'), comp(1.5, 0.25, 84), comp(2.25, 0.25, 70, 'top'), comp(2.5, 0.25, 80), comp(3.25, 0.25, 72, 'top'), comp(3.75, 0.25, 84, 'full', { push: 0.25 })] }] },
      bass: { style: 'roots', variations: [{ hits: [bass(0, 0.5, 104, 'root'), bass(0.75, 0.25, 86, 'octave'), bass(1, 0.25, 80, 'root'), bass(1.5, 0.5, 94, 'root'), bass(2.25, 0.25, 84, 'fifth'), bass(2.5, 0.5, 92, 'octave'), bass(3.25, 0.25, 82, 'fifth'), bass(3.5, 0.5, 90, 'approach')] }] },
      drums: { variations: [{ hits: [...hats16.map((x, i) => (i % 4 === 2 ? { ...x, drum: D.hhOpen, velocity: 72 } : x)), dr(0, 108, D.kick, 0.25), dr(1.75, 92, D.kick, 0.25), dr(2.5, 100, D.kick, 0.25), dr(3.25, 84, D.kick, 0.25), dr(1, 108, D.snare, 0.25), dr(3, 108, D.snare, 0.25), dr(3.75, 64, D.snare, 0.25)] }] },
    },
  },
};


/**
 * Original 1980s Minneapolis-style pop-funk groove at about 120 bpm: a drum-machine feel (tight kick, snare
 * layered with clap, shaker), a bouncy octave-pop bass and a light, syncopated guitar-like comp. Written by hand
 * in the spirit of that sound; it is not derived from any particular recording.
 */
const shaker16 = Array.from({ length: 16 }, (_, i) => dr(i * 0.25, i % 4 === 0 ? 70 : i % 2 ? 40 : 54, D.shaker, 0.25));

export const MINNEAPOLIS: Style = {
  id: 'minneapolis', name: 'Minneapolis Pop-Funk',
  description: '80s pop-funk at ~120 bpm: tight drum-machine kick, snare with clap, shaker, bouncy octave bass and a light syncopated comp. A: groove. B: busier with open hats. Original, not derived from a recording.',
  bars: 1, beatsPerBar: 4,
  feel: { swing: 0.08, pushPull: 2, humanize: 2, accents: [1, 0.85, 0.95, 0.85], rolePushPull: { bass: -1, chords: 3 } },
  substyles: {
    a: {
      comp: { variations: [
        { hits: [comp(0, 0.25, 82), comp(0.75, 0.25, 66, 'top'), comp(1.5, 0.25, 78), comp(2, 0.25, 64, 'top'), comp(2.75, 0.25, 76), comp(3.5, 0.25, 72, 'top', { push: 0.5 })], weight: 3 },
        { hits: [comp(0, 0.5, 80), comp(1.5, 0.25, 76), comp(2.5, 0.25, 70, 'top'), comp(3.25, 0.25, 74), comp(3.75, 0.25, 70, 'full', { push: 0.25 })], weight: 2 },
        { hits: [comp(0, 0.25, 84), comp(0.5, 0.25, 62, 'top'), comp(1, 0.25, 72), comp(1.75, 0.25, 68, 'top'), comp(2.5, 0.25, 78), comp(3, 0.25, 62, 'top'), comp(3.5, 0.25, 74, 'full', { push: 0.5 })], weight: 1 },
      ] },
      bass: { style: 'roots', variations: [
        { hits: [bass(0, 0.5, 100, 'root'), bass(0.75, 0.25, 84, 'octave'), bass(1.5, 0.25, 88, 'root'), bass(2, 0.5, 94, 'root'), bass(2.75, 0.25, 82, 'octave'), bass(3.25, 0.25, 84, 'fifth'), bass(3.5, 0.5, 88, 'approach')], weight: 2 },
        { hits: [bass(0, 0.75, 100, 'root'), bass(1.5, 0.25, 86, 'octave'), bass(2, 0.5, 92, 'root'), bass(3, 0.25, 84, 'fifth'), bass(3.5, 0.5, 90, 'approach')], weight: 1 },
      ] },
      drums: {
        variations: [{ hits: [...shaker16, ...hats8(66, 48), dr(0, 108, D.kick, 0.25), dr(1.75, 84, D.kick, 0.25), dr(2.5, 96, D.kick, 0.25), dr(1, 108, D.snare, 0.25), dr(1, 78, D.clap, 0.25), dr(3, 108, D.snare, 0.25), dr(3, 78, D.clap, 0.25)] }],
        fills: [{ hits: [...shaker16.slice(0, 8), dr(0, 108, D.kick, 0.25), dr(1, 108, D.snare, 0.25), dr(1, 78, D.clap, 0.25), dr(2, 96, D.snare, 0.25), dr(2.25, 72, D.snare, 0.25), dr(2.5, 98, D.highTom, 0.25), dr(2.75, 76, D.highTom, 0.25), dr(3, 100, D.midTom, 0.25), dr(3.25, 80, D.midTom, 0.25), dr(3.5, 106, D.lowTom, 0.25), dr(3.75, 90, D.lowTom, 0.25)] }],
      },
    },
    b: {
      comp: { variations: [{ hits: [comp(0, 0.25, 88), comp(0.5, 0.25, 70, 'top'), comp(0.75, 0.25, 72, 'top'), comp(1.5, 0.25, 82), comp(2, 0.25, 70, 'top'), comp(2.5, 0.25, 80), comp(3.25, 0.25, 72, 'top'), comp(3.75, 0.25, 84, 'full', { push: 0.25 })] }] },
      bass: { style: 'roots', variations: [{ hits: [bass(0, 0.5, 104, 'root'), bass(0.75, 0.25, 86, 'octave'), bass(1.25, 0.25, 80, 'root'), bass(1.5, 0.5, 92, 'root'), bass(2.25, 0.25, 84, 'fifth'), bass(2.5, 0.25, 94, 'octave'), bass(3, 0.25, 82, 'root'), bass(3.5, 0.5, 90, 'approach')] }] },
      drums: { variations: [{ hits: [...shaker16, ...hats8(74, 52).map((x) => (x.beat === 3.5 ? { ...x, drum: D.hhOpen } : x)), dr(0, 112, D.kick, 0.25), dr(0.75, 80, D.kick, 0.25), dr(1.75, 90, D.kick, 0.25), dr(2.5, 100, D.kick, 0.25), dr(1, 110, D.snare, 0.25), dr(1, 82, D.clap, 0.25), dr(3, 110, D.snare, 0.25), dr(3, 82, D.clap, 0.25), dr(3.75, 60, D.snare, 0.25)] }] },
    },
  },
};

export const PRESET_STYLES: Record<string, Style> = Object.fromEntries([SWING, BOSSA, BALLAD, STRAIGHT8, FUNK, MINNEAPOLIS].map((s) => [s.id, s]));
export const DEFAULT_STYLE_ID = 'minneapolis';
