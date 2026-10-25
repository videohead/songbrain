import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentEvent, ChatAdapter, ChatMessage } from '../agent/adapter';
import { loadLlmSettings, saveLlmSettings, type LlmSettings } from '../agent/llmSettings';
import { LlmSettingsPanel } from './LlmSettingsPanel';

interface Props {
  adapter: ChatAdapter;
  readOnly?: boolean;
  onCollapse?: () => void;
}

interface Line { kind: 'user' | 'assistant' | 'tool' | 'error'; text: string }

const SUGGESTIONS = ['Transpose to Bb', 'Insert a ii-V before measure 8', 'Explain the selected bars', 'Make the last 4 bars more bebop', 'Analyze this progression'];

export function ChatPanel({ adapter, readOnly, onCollapse }: Props) {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [lines, setLines] = useState<Line[]>([{ kind: 'assistant', text: 'Hi, I\'m Song Brain. Ask me about the harmony or tell me what to change.' }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<LlmSettings>(() => loadLlmSettings());
  const [health, setHealth] = useState<{ ok: boolean; model?: string; baseUrl?: string; hasKey?: boolean } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { fetch('/api/health').then((r) => r.json()).then(setHealth).catch(() => setHealth({ ok: false })); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [lines]);

  const effectiveModel = settings.model || health?.model || '';
  const configured = Boolean(settings.apiKey || health?.hasKey);
  const pill = useMemo(() => {
    if (health === null) return { text: 'connecting…', cls: 'bg-zinc-800 text-zinc-400' };
    if (!health.ok) return { text: 'server offline', cls: 'bg-rose-900/50 text-rose-300' };
    if (!configured) return { text: 'no API key · configure', cls: 'bg-amber-900/50 text-amber-300' };
    return { text: effectiveModel || 'model?', cls: 'bg-emerald-900/50 text-emerald-300' };
  }, [health, configured, effectiveModel]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || busy) return;
    setInput('');
    setLines((l) => [...l, { kind: 'user', text: msg }]);
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let streaming = false; // whether the last line is a live assistant line being appended to
    const onEvent = (e: AgentEvent) => {
      switch (e.type) {
        case 'delta':
          setLines((l) => {
            if (streaming) { const copy = l.slice(); copy[copy.length - 1] = { kind: 'assistant', text: copy[copy.length - 1].text + e.text }; return copy; }
            streaming = true;
            return [...l, { kind: 'assistant', text: e.text }];
          });
          break;
        case 'tool_call':
          streaming = false;
          setLines((l) => [...l, { kind: 'tool', text: `→ ${e.name}(${e.args.length > 160 ? e.args.slice(0, 160) + '…' : e.args})` }]);
          break;
        case 'tool_result':
          setLines((l) => [...l, { kind: e.ok ? 'tool' : 'error', text: `← ${e.summary}` }]);
          break;
        case 'message':
          if (e.message.role === 'assistant') streaming = false;
          break;
        default:
          break;
      }
    };
    try {
      const next = await adapter.send([...history, { role: 'user', content: msg }], onEvent, ctrl.signal);
      setHistory(next);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setLines((l) => [...l, { kind: 'error', text: (err as Error).message }]);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  return (
    <div className="flex flex-col h-full">
      <header className="px-3 py-2 border-b border-zinc-800 flex items-center gap-2">
        <h2 className="font-semibold text-sm">Agent</h2>
        <button className={`ml-auto text-[10px] px-1.5 py-0.5 rounded ${pill.cls}`} title={`${effectiveModel} @ ${settings.baseUrl || health?.baseUrl || ''}`} onClick={() => setSettingsOpen((o) => !o)}>
          {pill.text}
        </button>
        <button className="btn" title="LLM settings" onClick={() => setSettingsOpen((o) => !o)}>⚙</button>
        <button className="btn" onClick={() => { setHistory([]); setLines([]); }} title="Clear conversation">Clear</button>
        {onCollapse && <button className="btn" onClick={onCollapse} title="Collapse agent panel">▸</button>}
      </header>

      {settingsOpen ? (
        <LlmSettingsPanel
          value={settings}
          serverDefaults={health}
          onSave={(s) => { setSettings(s); saveLlmSettings(s); }}
          onClose={() => setSettingsOpen(false)}
        />
      ) : (
        <>
          <div className="flex-1 min-h-0 overflow-auto p-3 space-y-2 text-sm">
            {lines.map((l, i) => (
              <div key={i} className={
                l.kind === 'user' ? 'ml-6 rounded-lg bg-amber-500/15 border border-amber-500/30 px-3 py-2 whitespace-pre-wrap'
                : l.kind === 'assistant' ? 'mr-6 rounded-lg bg-zinc-800/80 px-3 py-2 whitespace-pre-wrap'
                : l.kind === 'error' ? 'rounded-lg bg-rose-900/40 border border-rose-700/50 px-3 py-2 text-rose-200 text-xs whitespace-pre-wrap'
                : 'font-mono text-[11px] text-zinc-500 px-1 truncate'
              } title={l.kind === 'tool' ? l.text : undefined}>{l.text}</div>
            ))}
            {busy && <div className="text-xs text-zinc-500 animate-pulse px-1">thinking…</div>}
            <div ref={bottomRef} />
          </div>

          <div className="px-3 pb-2 flex flex-wrap gap-1">
            {SUGGESTIONS.map((s) => <button key={s} className="btn !text-[11px]" disabled={busy || readOnly} onClick={() => send(s)}>{s}</button>)}
          </div>
          <form className="p-3 border-t border-zinc-800 flex gap-2" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
            <input className="field flex-1" placeholder={readOnly ? 'Read-only tab: agent edits happen in the editor tab' : 'Ask or instruct… (e.g. “Convert the bridge to minor”)'} value={input} onChange={(e) => setInput(e.target.value)} disabled={busy || readOnly} />
            {busy
              ? <button type="button" className="btn" onClick={() => abortRef.current?.abort()}>Stop</button>
              : <button type="submit" className="btn btn-primary" disabled={readOnly}>Send</button>}
          </form>
        </>
      )}
    </div>
  );
}
