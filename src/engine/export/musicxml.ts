/**
 * MusicXML lead-sheet export: one part, chord symbols as <harmony>,
 * whole-measure rests as the notated content. Generated from the Song model.
 */
import type { Song } from '../../model/song';
import { parseMeter, songTracks } from '../../model/song';
import { GM_PROGRAMS } from '../../model/gm';
import { keyFifths, parseChord, parseKey } from '../harmony';

const DIVISIONS = 4; // divisions per quarter note

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function pitchXml(pc: string, tag: 'root' | 'bass'): string {
  const step = pc[0];
  const alter = (pc.match(/#/g)?.length ?? 0) - (pc.match(/b/g)?.length ?? 0);
  return `<${tag}><${tag}-step>${step}</${tag}-step>${alter ? `<${tag}-alter>${alter}</${tag}-alter>` : ''}</${tag}>`;
}

/** Derive MusicXML harmony kind and degree alterations from the chord's intervals. */
function kindFor(p: ReturnType<typeof parseChord>): { kind: string; degrees: string } {
  const iv = new Set(p.intervals);
  const has = (x: string) => iv.has(x);
  const deg = (value: number, alter: number, type: 'add' | 'alter' | 'subtract' = 'add') => `<degree><degree-value>${value}</degree-value><degree-alter>${alter}</degree-alter><degree-type>${type}</degree-type></degree>`;
  let kind = 'other';
  const implied = new Set<string>();
  const q = p.quality;
  const m7 = has('7m'), M7 = has('7M'), M6 = has('6M'), M9 = has('9M'), P11 = has('11P'), M13 = has('13M');
  if (q === 'diminished') { kind = has('7d') ? 'diminished-seventh' : 'diminished'; implied.add('3m'); implied.add('5d'); implied.add('7d'); }
  else if (q === 'half-diminished') { kind = 'half-diminished'; ['3m', '5d', '7m'].forEach((x) => implied.add(x)); }
  else if (q === 'minor') {
    if (M7) { kind = 'major-minor'; implied.add('7M'); }
    else if (m7) { kind = M13 ? 'minor-13th' : P11 ? 'minor-11th' : M9 ? 'minor-ninth' : 'minor-seventh'; implied.add('7m'); if (kind !== 'minor-seventh') implied.add('9M'); if (kind === 'minor-11th' || kind === 'minor-13th') implied.add('11P'); if (kind === 'minor-13th') implied.add('13M'); }
    else if (M6) { kind = 'minor-sixth'; implied.add('6M'); }
    else kind = 'minor';
    implied.add('3m'); implied.add('5P');
  } else if (q === 'dominant') {
    const sus = !has('3M') && (has('4P') || has('2M'));
    if (sus) { kind = has('2M') && !has('4P') ? 'suspended-second' : 'suspended-fourth'; implied.add(has('2M') && !has('4P') ? '2M' : '4P'); }
    else { kind = M13 ? 'dominant-13th' : P11 ? 'dominant-11th' : M9 ? 'dominant-ninth' : 'dominant'; implied.add('3M'); implied.add('7m'); if (kind !== 'dominant') implied.add('9M'); if (kind === 'dominant-11th' || kind === 'dominant-13th') implied.add('11P'); if (kind === 'dominant-13th') implied.add('13M'); }
    implied.add('5P');
  } else if (q === 'augmented') { kind = m7 ? 'augmented-seventh' : 'augmented'; ['3M', '5A', '7m'].forEach((x) => implied.add(x)); }
  else if (q === 'suspended') { kind = has('2M') && !has('4P') ? 'suspended-second' : 'suspended-fourth'; implied.add(has('2M') && !has('4P') ? '2M' : '4P'); implied.add('5P'); }
  else if (q === 'major') {
    if (p.type === 'fifth' || p.type === 'power') { kind = 'power'; implied.add('5P'); }
    else if (M7) { kind = M13 ? 'major-13th' : M9 ? 'major-ninth' : 'major-seventh'; implied.add('7M'); if (kind !== 'major-seventh') implied.add('9M'); if (kind === 'major-13th') { implied.add('11P'); implied.add('13M'); } }
    else if (M6) { kind = 'major-sixth'; implied.add('6M'); }
    else kind = 'major';
    implied.add('3M'); implied.add('5P');
  }
  implied.add('1P');
  // Everything not implied by the kind becomes a degree element.
  let degrees = '';
  for (const x of p.intervals) {
    if (implied.has(x)) continue;
    const num = Number(/\d+/.exec(x)?.[0]);
    const qual = x.replace(/\d+/, '');
    if (!num) continue;
    const alterOf: Record<string, number> = { P: 0, M: 0, m: -1, d: num === 7 ? -2 : -1, A: 1 };
    const alter = alterOf[qual] ?? 0;
    const isAlteration = [5, 9, 11, 13].includes(num) && alter !== 0 && (kind.includes('ninth') || kind.includes('11th') || kind.includes('13th') || num === 5);
    if (num === 7 && kind.startsWith('suspended')) degrees += deg(7, alter === 0 ? -1 : alter, 'add');
    else degrees += deg(num, alter, isAlteration && num === 5 ? 'alter' : 'add');
  }
  return { kind, degrees };
}

export interface MusicXmlOptions {
  /** 'all' = one part per track (default); 'lead' = a single lead-sheet part. */
  parts?: 'all' | 'lead';
}

export function songToMusicXml(song: Song, opts: MusicXmlOptions = {}): string {
  const meter = parseMeter(song.meter);
  const key = parseKey(song.key);
  const fifths = keyFifths(key.tonic, key.mode);
  const quarterPerBeat = 4 / meter.unit;
  const measureDivisions = Math.round(meter.beats * quarterPerBeat * DIVISIONS);

  const measures: string[] = [];
  let number = 1;
  song.sections.forEach((section, si) => {
    section.measures.forEach((m, mi) => {
      const parts: string[] = [];
      parts.push(`<measure number="${number}">`);
      if (number === 1) {
        parts.push(`<attributes><divisions>${DIVISIONS}</divisions><key><fifths>${fifths}</fifths><mode>${key.mode}</mode></key><time><beats>${meter.beats}</beats><beat-type>${meter.unit}</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>`);
        parts.push(`<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${song.tempo}</per-minute></metronome></direction-type><sound tempo="${song.tempo}"/></direction>`);
      }
      if (mi === 0) {
        parts.push(`<direction placement="above"><direction-type><rehearsal>${esc(section.name)}</rehearsal></direction-type></direction>`);
        if (si > 0) parts.push(`<barline location="left"><bar-style>light-light</bar-style></barline>`);
      }
      // Harmony + rest for each chord, offset-free since each chord gets its own rest
      let beatPos = 0;
      for (const ch of m.chords) {
        const dur = Math.round(ch.beats * quarterPerBeat * DIVISIONS);
        const p = parseChord(ch.symbol);
        if (!p.isNoChord && p.root) {
          const { kind, degrees } = kindFor(p);
          const kindText = kind === 'other' ? ` text="${esc(ch.symbol.replace(/^[A-G][#b]?/, ''))}"` : '';
          parts.push(`<harmony>${pitchXml(p.root, 'root')}<kind${kindText}>${kind}</kind>${degrees}${p.bass ? pitchXml(p.bass, 'bass') : ''}</harmony>`);
        }
        parts.push(`<note><rest/><duration>${dur}</duration><voice>1</voice>${restType(dur, measureDivisions)}</note>`);
        beatPos += ch.beats;
      }
      if (m.chords.length === 0) parts.push(`<note><rest measure="yes"/><duration>${measureDivisions}</duration><voice>1</voice></note>`);
      void beatPos;
      if (si === song.sections.length - 1 && mi === section.measures.length - 1) {
        parts.push(`<barline location="right"><bar-style>light-heavy</bar-style></barline>`);
      }
      parts.push(`</measure>`);
      measures.push(parts.join(''));
      number++;
    });
  });

  // Lead-sheet harmony goes on the first track's part; other tracks get whole rests
  // so the file carries the full instrumentation (program, channel, volume, pan).
  const allTracks = songTracks(song).filter((t) => t.role !== 'drums'); // no percussion notation yet
  const tracks = opts.parts === 'lead' ? allTracks.slice(0, 1) : allTracks;
  const restMeasures: string[] = [];
  for (let n = 1; n <= measures.length; n++) {
    const attrs = n === 1 ? `<attributes><divisions>${DIVISIONS}</divisions><key><fifths>${fifths}</fifths><mode>${key.mode}</mode></key><time><beats>${meter.beats}</beats><beat-type>${meter.unit}</beat-type></time><clef><sign>F</sign><line>4</line></clef></attributes>` : '';
    restMeasures.push(`<measure number="${n}">${attrs}<note><rest measure="yes"/><duration>${measureDivisions}</duration><voice>1</voice></note></measure>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>${esc(song.title)}</work-title></work>
  <identification><encoding><software>Song Brain</software></encoding></identification>
  <part-list>
${tracks.map((t, i) => `    <score-part id="P${i + 1}"><part-name>${esc(t.name)}</part-name><score-instrument id="P${i + 1}-I1"><instrument-name>${esc(GM_PROGRAMS[t.program] ?? 'Instrument')}</instrument-name></score-instrument><midi-instrument id="P${i + 1}-I1"><midi-channel>${t.channel}</midi-channel><midi-program>${t.program + 1}</midi-program><volume>${Math.round((t.level / 127) * 100)}</volume><pan>${Math.round(((t.pan - 64) / 64) * 90)}</pan></midi-instrument></score-part>`).join('\n')}
  </part-list>
  <part id="P1">
${measures.map((m) => '    ' + m).join('\n')}
  </part>
${tracks.slice(1).map((_t, i) => `  <part id="P${i + 2}">
${restMeasures.map((m) => '    ' + m).join('\n')}
  </part>`).join('\n')}
</score-partwise>
`;
}

function restType(dur: number, measureDivisions: number): string {
  if (dur === measureDivisions) return '';
  const q = dur / DIVISIONS; // quarters
  if (q === 4) return '<type>whole</type>';
  if (q === 2) return '<type>half</type>';
  if (q === 3) return '<type>half</type><dot/>';
  if (q === 1) return '<type>quarter</type>';
  if (q === 1.5) return '<type>quarter</type><dot/>';
  if (q === 0.5) return '<type>eighth</type>';
  return '';
}
