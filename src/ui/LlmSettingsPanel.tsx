import { useEffect, useState } from 'react';
import type { LlmSettings } from '../agent/llmSettings';

interface Props {
  value: LlmSettings;
  serverDefaults: { baseUrl?: string; model?: string; hasKey?: boolean } | null;
  onSave: (s: LlmSettings) => void;
  onClose: () => void;
}

export function LlmSettingsPanel({ value, serverDefaults, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<LlmSettings>(value);
  const [models, setModels] = useState<string[] | null>(null);
  const [status, setStatus] = useState<{ kind: 'idle' | 'loading' | 'ok' | 'error'; text?: string }>({ kind: 'idle' });
  const [showKey, setShowKey] = useState(false);
  useEffect(() => setDraft(value), [value]);

  async function loadModels() {
    setStatus({ kind: 'loading' });
    try {
      const res = await fetch('/api/llm/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ llm: draft }) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setModels(data.models);
      setStatus({ kind: 'ok', text: `${data.models.length} models at ${data.baseUrl}` });
      if (!draft.model && data.models.length) setDraft((d) => ({ ...d, model: data.models[0] }));
    } catch (e) {
      setModels(null);
      setStatus({ kind: 'error', text: (e as Error).message });
    }
  }

  const field = (label: string, key: keyof LlmSettings, placeholder: string, type = 'text') => (
    <label className="block text-xs text-zinc-400">
      {label}
      <input
        className="field w-full mt-1 font-mono text-xs"
        type={type}
        value={draft[key]}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      />
    </label>
  );

  return (
    <div className="flex-1 min-h-0 overflow-auto p-3 space-y-3 text-sm">
      <p className="text-xs text-zinc-500">
        Any OpenAI-compatible endpoint: OpenAI, LiteLLM, NVIDIA NIM, Ollama, vLLM. Empty fields use the server's environment defaults
        {serverDefaults?.baseUrl ? <> (<span className="font-mono">{serverDefaults.model}</span> at <span className="font-mono">{serverDefaults.baseUrl}</span>{serverDefaults.hasKey ? '' : ', no key set'})</> : ''}.
        Settings are saved in this browser only.
      </p>
      {field('Server URL', 'baseUrl', serverDefaults?.baseUrl ?? 'https://api.openai.com/v1')}
      <div>
        {field('API key', 'apiKey', serverDefaults?.hasKey ? '(using server key)' : 'sk-…', showKey ? 'text' : 'password')}
        <label className="flex items-center gap-1 text-[11px] text-zinc-500 mt-1"><input type="checkbox" checked={showKey} onChange={(e) => setShowKey(e.target.checked)} /> show key</label>
      </div>
      <div>
        <div className="flex items-end gap-2">
          <div className="flex-1">{field('Model', 'model', serverDefaults?.model ?? 'gpt-4o-mini')}</div>
          <button className="btn" onClick={loadModels} disabled={status.kind === 'loading'}>{status.kind === 'loading' ? 'Loading…' : 'Load models'}</button>
        </div>
        {models && (
          <select className="field w-full mt-2 text-xs" value={models.includes(draft.model) ? draft.model : ''} onChange={(e) => setDraft({ ...draft, model: e.target.value })}>
            <option value="">— pick from {models.length} models —</option>
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
        {status.text && <div className={`mt-1 text-[11px] ${status.kind === 'error' ? 'text-rose-300' : 'text-emerald-300'}`}>{status.text}</div>}
      </div>
      <div className="flex gap-2 pt-1">
        <button className="btn btn-primary" onClick={() => { onSave(draft); onClose(); }}>Save</button>
        <button className="btn" onClick={() => { setDraft({ baseUrl: '', apiKey: '', model: '' }); }}>Clear (use server defaults)</button>
        <button className="btn ml-auto" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
