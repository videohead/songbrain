/**
 * MusicXML import: harmony elements, key, time, tempo and rehearsal marks → Song.
 * One-way conversion on entry; chords remain the source of truth afterwards.
 * Works with the browser DOMParser or @xmldom/xmldom (pass a parsed Document).
 */
import type { Measure, Song, Section } from '../../model/song';
import { validateSong } from '../../model/song';

const FIFTHS_MAJOR = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
const FIFTHS_MINOR = ['Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#'];

const KIND_SUFFIX: Record<string, string> = {
  major: '', minor: 'm', augmented: 'aug', diminished: 'dim', dominant: '7', 'major-seventh': 'maj7', 'minor-seventh': 'm7', 'diminished-seventh': 'dim7',
  'augmented-seventh': '7#5', 'half-diminished': 'm7b5', 'major-minor': 'mMaj7', 'major-sixth': '6', 'minor-sixth': 'm6', 'dominant-ninth': '9', 'major-ninth': 'maj9', 'minor-ninth': 'm9',
  'dominant-11th': '11', 'major-11th': 'maj11', 'minor-11th': 'm11', 'dominant-13th': '13', 'major-13th': 'maj13', 'minor-13th': 'm13', 'suspended-second': 'sus2', 'suspended-fourth': 'sus4',
  power: '5', other: '', none: '',
};

function text(el: Element | null | undefined, tag: string): string | null {
  const n = el?.getElementsByTagName(tag)[0];
  return n?.textContent?.trim() ?? null;
}
function num(el: Element | null | undefined, tag: string): number | null {
  const t = text(el, tag);
  return t === null || t === '' || Number.isNaN(Number(t)) ? null : Number(t);
}
function pitch(el: Element | null | undefined, prefix: 'root' | 'bass'): string | null {
  const node = el?.getElementsByTagName(prefix)[0];
  if (!node) return null;
  const step = text(node, `${prefix}-step`);
  if (!step) return null;
  const alter = num(node, `${prefix}-alter`) ?? 0;
  return step + (alter > 0 ? '#'.repeat(alter) : 'b'.repeat(-alter));
}

function harmonyToSymbol(h: Element): string {
  const root = pitch(h, 'root');
  if (!root) return 'N.C.';
  const kindEl = h.getElementsByTagName('kind')[0];
  const kind = kindEl?.textContent?.trim() ?? 'major';
  const kindText = kindEl?.getAttribute('text');
  let suffix = kind === 'other' && kindText ? kindText : (KIND_SUFFIX[kind] ?? '');
  let susSeventh = false;
  for (const d of Array.from(h.getElementsByTagName('degree'))) {
    const v = num(d, 'degree-value'); const a = num(d, 'degree-alter') ?? 0; const type = text(d, 'degree-type') ?? 'add';
    if (v === null || type === 'subtract') continue;
    const acc = a > 0 ? '#' : a < 0 ? 'b' : '';
    if (v === 7 && kind.startsWith('suspended')) { susSeventh = true; continue; }
    if (v === 9 && a === 0 && (kind === 'major' || kind === 'minor' || kind === 'major-sixth' || kind === 'minor-sixth')) { suffix += kind.includes('sixth') ? '/9' : 'add9'; continue; }
    if (type === 'alter' && v === 5) { suffix += `${acc}5`; continue; }
    suffix += `${acc}${v}`;
  }
  if (susSeventh) suffix = suffix.replace(/^sus(\d)/, '7sus$1');
  const bass = pitch(h, 'bass');
  return root + suffix + (bass ? '/' + bass : '');
}

export interface ImportResult { song: Song; warnings: string[] }

/** Import from an already-parsed MusicXML DOM (score-partwise). */
export function songFromMusicXmlDocument(doc: Document, fallbackTitle = 'Imported'): ImportResult {
  const warnings: string[] = [];
  const title = text(doc.documentElement, 'work-title') || text(doc.documentElement, 'movement-title') || fallbackTitle;
  // Use the part that carries harmony; else the first part.
  const parts = Array.from(doc.getElementsByTagName('part'));
  if (!parts.length) throw new Error('No <part> found (timewise MusicXML is not supported yet).');
  const part = parts.find((p) => p.getElementsByTagName('harmony').length) ?? parts[0];
  if (!part.getElementsByTagName('harmony').length) warnings.push('No chord symbols found; measures imported as N.C.');

  let divisions = 1, beats = 4, unit = 4, key = 'C Major', tempo = 120;
  const sections: Section[] = [];
  let current: Section = { name: 'A', measures: [] };
  let sawRehearsal = false;

  for (const m of Array.from(part.getElementsByTagName('measure'))) {
    const attrs = m.getElementsByTagName('attributes')[0];
    if (attrs) {
      divisions = num(attrs, 'divisions') ?? divisions;
      const time = attrs.getElementsByTagName('time')[0];
      if (time) { beats = num(time, 'beats') ?? beats; unit = num(time, 'beat-type') ?? unit; }
      const k = attrs.getElementsByTagName('key')[0];
      if (k) { const f = num(k, 'fifths') ?? 0; const mode = (text(k, 'mode') ?? 'major').toLowerCase(); key = mode === 'minor' ? `${FIFTHS_MINOR[f + 7] ?? 'A'} Minor` : `${FIFTHS_MAJOR[f + 7] ?? 'C'} Major`; }
    }
    for (const snd of Array.from(m.getElementsByTagName('sound'))) { const t = Number(snd.getAttribute('tempo')); if (t > 0) tempo = Math.round(t); }
    const reh = m.getElementsByTagName('rehearsal')[0]?.textContent?.trim();
    if (reh) {
      if (sawRehearsal || current.measures.length) { if (current.measures.length) sections.push(current); current = { name: reh, measures: [] }; }
      else current.name = reh;
      sawRehearsal = true;
    }
    // Walk music-data in order, tracking the time position; harmony binds to the current position.
    const quarterPerBeat = 4 / unit;
    const measureBeats = beats;
    const changes: Array<{ beat: number; symbol: string }> = [];
    let posDiv = 0;
    for (const child of Array.from(m.childNodes).filter((n): n is Element => n.nodeType === 1)) {
      const tag = child.nodeName;
      if (tag === 'harmony') {
        const offset = num(child, 'offset') ?? 0;
        changes.push({ beat: (posDiv + offset) / divisions / quarterPerBeat, symbol: harmonyToSymbol(child) });
      } else if (tag === 'note') {
        const dur = num(child, 'duration') ?? 0;
        const isChord = child.getElementsByTagName('chord').length > 0;
        const isGrace = child.getElementsByTagName('grace').length > 0;
        if (!isChord && !isGrace) posDiv += dur;
      } else if (tag === 'backup') posDiv -= num(child, 'duration') ?? 0;
      else if (tag === 'forward') posDiv += num(child, 'duration') ?? 0;
    }
    const measure: Measure = { chords: [] };
    if (!changes.length) {
      // Carry the previous chord across the bar, else N.C.
      const prev = current.measures.at(-1)?.chords.at(-1)?.symbol ?? sections.at(-1)?.measures.at(-1)?.chords.at(-1)?.symbol ?? 'N.C.';
      measure.chords.push({ symbol: prev, beats: measureBeats });
    } else {
      changes.sort((a, b) => a.beat - b.beat);
      if (changes[0].beat > 1e-6) { const prev = current.measures.at(-1)?.chords.at(-1)?.symbol ?? 'N.C.'; changes.unshift({ beat: 0, symbol: prev }); }
      // Merge duplicates at the same beat (keep last) and build durations.
      const uniq = changes.filter((c, i) => i === changes.length - 1 || Math.abs(changes[i + 1].beat - c.beat) > 1e-6);
      uniq.forEach((c, i) => {
        const end = i + 1 < uniq.length ? uniq[i + 1].beat : measureBeats;
        const len = Math.round((end - c.beat) * 4) / 4;
        if (len > 0) measure.chords.push({ symbol: c.symbol, beats: len });
      });
      // Fix rounding so the bar sums to the meter.
      const sum = measure.chords.reduce((s, c) => s + c.beats, 0);
      if (Math.abs(sum - measureBeats) > 1e-6 && measure.chords.length) measure.chords[measure.chords.length - 1].beats += measureBeats - sum;
    }
    current.measures.push(measure);
  }
  if (current.measures.length) sections.push(current);
  if (!sections.length) throw new Error('No measures found.');

  const song: Song = { title, key, tempo, meter: `${beats}/${unit}`, sections };
  const v = validateSong(song);
  if (!v.ok) throw new Error('Imported chart is invalid:\n' + v.errors.join('\n'));
  return { song, warnings };
}

/** Browser entry point: parse text with DOMParser (also handles .mxl? no — compressed files are not supported). */
export function songFromMusicXml(xml: string, fallbackTitle = 'Imported'): ImportResult {
  if (typeof DOMParser === 'undefined') throw new Error('No DOM parser available in this environment.');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err) throw new Error('Not valid XML: ' + (err.textContent ?? '').slice(0, 200));
  return songFromMusicXmlDocument(doc, fallbackTitle);
}
