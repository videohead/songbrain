import type { Song } from '../../model/song';
import type { Style, Substyle, SubstyleId } from '../../model/style';
import { normalizeStyle } from '../../model/style';
import { DEFAULT_STYLE_ID, PRESET_STYLES } from './presets';

export function styleIdForSection(song: Song, sectionIndex: number): string {
  const a = song.arrangement;
  return a?.sections?.[String(sectionIndex)] ?? a?.defaultStyle ?? DEFAULT_STYLE_ID;
}

export function substyleIdForSection(song: Song, sectionIndex: number): SubstyleId {
  return song.arrangement?.substyles?.[String(sectionIndex)] ?? 'a';
}

export function resolveStyle(song: Song, id: string): Style {
  const raw = song.styles?.[id] ?? PRESET_STYLES[id] ?? PRESET_STYLES[DEFAULT_STYLE_ID];
  return normalizeStyle(raw);
}

export function styleForSection(song: Song, sectionIndex: number): Style {
  return resolveStyle(song, styleIdForSection(song, sectionIndex));
}

/** Substyle for a section, falling back to A when B is requested but absent. */
export function substyleForSection(song: Song, sectionIndex: number): { style: Style; substyle: Substyle; id: SubstyleId } {
  const style = styleForSection(song, sectionIndex);
  const want = substyleIdForSection(song, sectionIndex);
  const substyle = (want === 'b' && style.substyles.b) ? style.substyles.b : style.substyles.a;
  return { style, substyle, id: want === 'b' && style.substyles.b ? 'b' : 'a' };
}

export function availableStyles(song: Song): Style[] {
  return Object.values({ ...PRESET_STYLES, ...(song.styles ?? {}) }).map(normalizeStyle);
}
