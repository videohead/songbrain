/**
 * Chat adapter interface. The chat panel only depends on this, so the panel
 * (or the agent behind it) can be swapped without touching the rest of the app.
 */
import type { LlmSettings } from './llmSettings';

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

export interface ChatAdapter {
  /** Run one user turn. Resolves with the updated history (without the system prompt). */
  send(history: ChatMessage[], onEvent: (e: AgentEvent) => void, signal?: AbortSignal): Promise<ChatMessage[]>;
}

/** Default adapter: the server runs the model loop and executes tools through the relay. */
export function createServerLoopAdapter(getSettings: () => LlmSettings): ChatAdapter {
  return {
    async send(history, onEvent, signal) {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, llm: getSettings() }),
        signal,
      });
      if (!res.ok || !res.body) throw new Error(`Agent request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let final: ChatMessage[] | null = null;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const line = chunk.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          const ev = JSON.parse(line.slice(5)) as AgentEvent;
          if (ev.type === 'done') final = ev.history;
          if (ev.type === 'error') throw new Error(ev.error);
          onEvent(ev);
        }
      }
      return final ?? history;
    },
  };
}
