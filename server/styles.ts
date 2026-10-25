/** Server-side style library: built-in presets plus JSON files on the data volume. */
import fs from 'node:fs';
import path from 'node:path';
import type { Style } from '../src/model/style';
import { validateStyle } from '../src/model/style';
import { PRESET_STYLES } from '../src/engine/style/presets';

export function createStyleLibrary(dataDir: string) {
  const dir = path.join(dataDir, 'styles');
  fs.mkdirSync(dir, { recursive: true });

  function loadCustom(): Record<string, Style> {
    const out: Record<string, Style> = {};
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      try {
        const st = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (validateStyle(st).length === 0) out[st.id] = st;
      } catch { /* skip bad file */ }
    }
    return out;
  }

  return {
    list(): Style[] { return Object.values({ ...PRESET_STYLES, ...loadCustom() }); },
    get(id: string): Style | null { return loadCustom()[id] ?? PRESET_STYLES[id] ?? null; },
    save(style: Style): string[] {
      const errors = validateStyle(style);
      if (errors.length) return errors;
      fs.writeFileSync(path.join(dir, `${style.id.replace(/[^\w-]/g, '_')}.json`), JSON.stringify(style, null, 2));
      return [];
    },
    isPreset(id: string) { return id in PRESET_STYLES; },
  };
}
