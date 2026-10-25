import { songToMusicXml } from '../../src/engine/export/musicxml';
import { defaultSong } from '../../src/model/song';
const syms = ['C7b9', 'C13', 'C7sus4', 'Cm(maj7)', 'C6/9', 'Cadd9', 'C7#5', 'C7alt', 'Cmaj7#11', 'Cm7b5', 'Cdim7', 'C5', 'Csus2', 'C9sus4', 'G7/B'];
const song = defaultSong(); song.sections = [{ name: 'X', measures: syms.map((s) => ({ chords: [{ symbol: s, beats: 4 }] })) }];
const xml = songToMusicXml(song);
(xml.match(/<harmony>.*?<\/harmony>/g) ?? []).forEach((h, i) => console.log(syms[i].padEnd(10), h.replace(/<root>.*?<\/root>/, '').replace(/<\/?harmony>/g, '').replace(/<degree>/g, ' [').replace(/<\/degree>/g, ']').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()));
