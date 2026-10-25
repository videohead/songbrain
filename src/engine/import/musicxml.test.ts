import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { songFromMusicXmlDocument } from './musicxml';
import { songToMusicXml } from '../export/musicxml';
import { defaultSong } from '../../model/song';
import { parseChord } from '../harmony';
import { Note } from 'tonal';

const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml') as unknown as Document;

describe('MusicXML import (F5)', () => {
  it('round-trips the default song: title, key, tempo, meter, sections and chords', () => {
    const song = defaultSong();
    const { song: back, warnings } = songFromMusicXmlDocument(parse(songToMusicXml(song)));
    expect(warnings).toEqual([]);
    expect(back.title).toBe(song.title);
    expect(back.key).toBe(song.key);
    expect(back.tempo).toBe(song.tempo);
    expect(back.meter).toBe(song.meter);
    expect(back.sections.map((s) => s.name)).toEqual(song.sections.map((s) => s.name));
    song.sections.forEach((sec, si) => sec.measures.forEach((m, mi) => {
      const got = back.sections[si].measures[mi];
      expect(got.chords.length).toBe(m.chords.length);
      m.chords.forEach((c, ci) => {
        const a = parseChord(c.symbol), b = parseChord(got.chords[ci].symbol);
        expect(Note.chroma(b.root)).toBe(Note.chroma(a.root));
        expect(b.quality).toBe(a.quality);
        expect(got.chords[ci].beats).toBe(c.beats);
      });
    }));
  });
  it('handles a hand-written lead sheet with offsets, slash bass and no rehearsal marks', () => {
    const xml = `<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>Test</work-title></work>
<part-list><score-part id="P1"><part-name>Lead</part-name></score-part></part-list>
<part id="P1">
<measure number="1"><attributes><divisions>2</divisions><key><fifths>-3</fifths><mode>major</mode></key><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
<direction><sound tempo="96"/></direction>
<harmony><root><root-step>E</root-step><root-alter>-1</root-alter></root><kind>major-seventh</kind></harmony>
<note><rest/><duration>4</duration></note>
<harmony><root><root-step>B</root-step><root-alter>-1</root-alter></root><kind>dominant</kind><degree><degree-value>9</degree-value><degree-alter>-1</degree-alter><degree-type>add</degree-type></degree><bass><bass-step>D</bass-step></bass></harmony>
<note><rest/><duration>2</duration></note></measure>
<measure number="2"><note><rest measure="yes"/><duration>6</duration></note></measure>
</part></score-partwise>`;
    const { song } = songFromMusicXmlDocument(parse(xml));
    expect(song.key).toBe('Eb Major');
    expect(song.meter).toBe('3/4');
    expect(song.tempo).toBe(96);
    expect(song.sections[0].measures[0].chords).toEqual([{ symbol: 'Ebmaj7', beats: 2 }, { symbol: 'Bb7b9/D', beats: 1 }]);
    expect(song.sections[0].measures[1].chords).toEqual([{ symbol: 'Bb7b9/D', beats: 3 }]); // carried across the bar
  });
});
