/**
 * Server-side style library: built-in presets plus JSON files in the repo's `styles/` directory
 * (tracked in git, so trained and hand-built styles can be committed). Styles left in the legacy
 * `<dataDir>/styles` are still read; all saves go to the repo directory.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Style } from '../src/model/style';
import { validateStyle } from '../src/model/style';
import { PRESET_STYLES } from '../src/engine/style/presets';

export function createStyleLibrary(stylesDir: string, legacyDir?: string) {
  const dir = stylesDir;
  fs.mkdirSync(dir, { recursive: true });

  function loadDir(d: string, out: Record<string, Style>) {
    if (!fs.existsSync(d)) return;
    for (const f of fs.readdirSync(d).filter((f) => f.endsWith('.json')).sort()) {
      try {
        const st = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
        if (validateStyle(st).length === 0) out[st.id] = st;
      } catch { /* skip bad file */ }
    }
  }

  function loadCustom(): Record<string, Style> {
    const out: Record<string, Style> = {};
    if (legacyDir) loadDir(legacyDir, out);
    loadDir(dir, out); // the repo copy wins
    return out;
  }

  return {
    list(): Style[] { return Object.values({ ...PRESET_STYLES, ...loadCustom() }); },
    get(id: string): Style | null { return loadCustom()[id] ?? PRESET_STYLES[id] ?? null; },
    save(style: Style): string[] {
      const errors = validateStyle(style);
      if (errors.length) return errors;
      const file = path.join(dir, `${style.id.replace(/[^\w-]/g, '_')}.json`);
      fs.writeFileSync(file, JSON.stringify(style, null, 2) + '\n');
      // Inside Docker the server runs as root; hand the file to whoever owns the directory so git/editors can touch it.
      try { const st = fs.statSync(dir); fs.chownSync(file, st.uid, st.gid); } catch { /* not permitted: leave as is */ }
      return [];
    },
    isPreset(id: string) { return id in PRESET_STYLES; },
  };
}
