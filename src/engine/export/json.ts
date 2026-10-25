import type { Song } from '../../model/song';
import { validateSong } from '../../model/song';

export function songToJson(song: Song): string {
  return JSON.stringify(song, null, 2);
}

export function songFromJson(text: string): Song {
  const parsed = JSON.parse(text);
  const v = validateSong(parsed);
  if (!v.ok) throw new Error('Invalid song JSON:\n' + v.errors.join('\n'));
  return parsed as Song;
}
