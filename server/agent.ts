/**
 * Server-side agent loop for the chat panel.
 *
 * Talks to any OpenAI-compatible chat completions endpoint with streaming,
 * executes tool calls through the relay (so the editor tab stays the owner
 * of the song), and emits progress events the UI renders incrementally.
 */
import type { ToolExecutor } from './tools';
import { SYSTEM_PROMPT, toolDefinitions } from '../src/agent/tools';

export interface LlmSettings { baseUrl: string; apiKey: string; model: string }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
}

export type AgentEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool_call'; name: string; args: string }
  | { type: 'tool_result'; name: string; ok: boolean; summary: string }
  | { type: 'message'; message: ChatMessage }
  | { type: 'done'; history: ChatMessage[] }
  | { type: 'error'; error: string };

const MAX_STEPS = 8;

export function resolveLlm(override: Partial<LlmSettings> | undefined, env: LlmSettings): LlmSettings {
  const pick = (k: keyof LlmSettings) => (override?.[k]?.trim() ? override[k]!.trim() : env[k]);
  return { baseUrl: pick('baseUrl').replace(/\/+$/, ''), apiKey: pick('apiKey'), model: pick('model') };
}

export async function listModels(llm: LlmSettings): Promise<string[]> {
  const res = await fetch(`${llm.baseUrl}/models`, { headers: authHeaders(llm) });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const items: Array<{ id: string }> = data.data ?? data.models ?? [];
  return items.map((m) => m.id).filter(Boolean).sort();
}

function authHeaders(llm: LlmSettings): Record<string, string> {
  return { 'Content-Type': 'application/json', ...(llm.apiKey ? { Authorization: `Bearer ${llm.apiKey}` } : {}) };
}

/** One streamed completion; returns the assembled assistant message. */
async function streamCompletion(llm: LlmSettings, messages: ChatMessage[], onDelta: (t: string) => void, signal?: AbortSignal): Promise<ChatMessage> {
  const res = await fetch(`${llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: authHeaders(llm),
    body: JSON.stringify({ model: llm.model, messages, tools: toolDefinitions, tool_choice: 'auto', temperature: 0.3, stream: true }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`LLM request failed (${res.status}): ${(await res.text()).slice(0, 500)}`);

  let content = '';
  const calls = new Map<number, { id: string; name: string; arguments: string }>();
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  outer: while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') break outer;
      let json: any;
      try { json = JSON.parse(payload); } catch { continue; }
      if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
      const delta = json.choices?.[0]?.delta;
      if (!delta) continue;
      if (typeof delta.content === 'string' && delta.content) { content += delta.content; onDelta(delta.content); }
      for (const tc of delta.tool_calls ?? []) {
        const i = tc.index ?? 0;
        const cur = calls.get(i) ?? { id: '', name: '', arguments: '' };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.name += tc.function.name;
        if (tc.function?.arguments) cur.arguments += tc.function.arguments;
        calls.set(i, cur);
      }
    }
  }
  const msg: ChatMessage = { role: 'assistant', content: content || null };
  if (calls.size) {
    msg.tool_calls = [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([i, c]) => ({
      id: c.id || `call_${i}`, type: 'function', function: { name: c.name, arguments: c.arguments || '{}' },
    }));
  }
  return msg;
}

function summarize(name: string, ok: boolean, result: unknown, error?: string): string {
  if (!ok) return `error: ${error}`;
  if (name === 'GetSong') {
    const e = (result as { editor?: { cursorMeasure: number; selection: { from: number; to: number } | null } | null }).editor;
    return e ? `read song (cursor m.${e.cursorMeasure}${e.selection ? `, selected ${e.selection.from}–${e.selection.to}` : ''})` : 'read song';
  }
  if (name === 'AnalyzeProgression') return `analysis: ${(result as { summary?: string }).summary ?? 'ok'}`;
  return (result as { message?: string })?.message ?? 'ok';
}

export async function runAgentLoop(relay: ToolExecutor, llm: LlmSettings, history: ChatMessage[], emit: (e: AgentEvent) => void, signal?: AbortSignal): Promise<void> {
  const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }, ...history];
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const msg = await streamCompletion(llm, messages, (t) => emit({ type: 'delta', text: t }), signal);
      messages.push(msg);
      emit({ type: 'message', message: msg });
      if (!msg.tool_calls?.length) break;
      for (const call of msg.tool_calls) {
        emit({ type: 'tool_call', name: call.function.name, args: call.function.arguments });
        let args: Record<string, unknown> = {};
        let parseError: string | null = null;
        try { args = call.function.arguments.trim() ? JSON.parse(call.function.arguments) : {}; } catch (e) { parseError = `Could not parse tool arguments as JSON: ${(e as Error).message}`; }
        const result = parseError ? { ok: false as const, error: parseError } : await relay.executeTool(call.function.name, args);
        const content = result.ok ? JSON.stringify(result.result) : `ERROR: ${result.error}`;
        emit({ type: 'tool_result', name: call.function.name, ok: result.ok, summary: summarize(call.function.name, result.ok, result.ok ? result.result : undefined, result.ok ? undefined : result.error) });
        const toolMsg: ChatMessage = { role: 'tool', tool_call_id: call.id, name: call.function.name, content };
        messages.push(toolMsg);
        emit({ type: 'message', message: toolMsg });
      }
    }
    emit({ type: 'done', history: messages.slice(1) });
  } catch (e) {
    if ((e as Error).name === 'AbortError') { emit({ type: 'done', history: messages.slice(1) }); return; }
    emit({ type: 'error', error: (e as Error).message });
  }
}
