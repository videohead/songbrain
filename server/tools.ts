/**
 * Server-side tool executor: routes each tool to the editor tab via the relay,
 * except library-backed style tools, which the server answers itself.
 */
import type { Relay } from './relay';
import type { createStyleLibrary } from './styles';
import type { ToolResult } from '../src/agent/tools';
import { normalizeStyle, type Style } from '../src/model/style';

type StyleLibrary = ReturnType<typeof createStyleLibrary>;

export interface ToolExecutor { executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult> }

export function createToolExecutor(relay: Relay, styles: StyleLibrary): ToolExecutor {
  return {
    async executeTool(name, args) {
      switch (name) {
        case 'ListStyles': {
          const fromTab = await relay.executeTool('ListStyles', {});
          const tab = fromTab.ok ? (fromTab.result as Array<{ id: string }>) : [];
          const lib = styles.list().map(normalizeStyle).map((s) => ({ id: s.id, name: s.name, description: s.description, bars: s.bars, feel: s.feel, substyles: Object.keys(s.substyles), roles: Object.keys(s.substyles.a), bass: s.substyles.a.bass?.style, source: s.source, where: styles.isPreset(s.id) ? 'preset' : 'library' }));
          const seen = new Set(tab.map((x) => x.id));
          return { ok: true, result: [...tab, ...lib.filter((x) => !seen.has(x.id))] };
        }
        case 'GetStyle': {
          const r = await relay.executeTool('GetStyle', args);
          if (r.ok) return r;
          const id = args.id as string | undefined;
          const lib = id ? styles.get(id) : null;
          return lib ? { ok: true, result: { style: normalizeStyle(lib), source: 'library' } } : r;
        }
        case 'UpdateStyle': {
          const r = await relay.executeTool('UpdateStyle', args);
          if (r.ok) { const errs = styles.save(normalizeStyle(args.style as Style)); if (errs.length) return { ok: true, result: { ...(r.result as object), libraryWarning: errs.join('; ') } }; }
          return r;
        }
        case 'SaveStyle': {
          const id = String(args.id ?? '');
          const r = await relay.executeTool('GetStyle', { id });
          if (!r.ok) return r;
          const style = (r.result as { style: Style }).style;
          const errs = styles.save(style);
          return errs.length ? { ok: false, error: errs.join('; ') } : { ok: true, result: { message: `Style "${id}" saved to the library.` } };
        }
        default:
          return relay.executeTool(name, args);
      }
    },
  };
}
