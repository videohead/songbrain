/** LLM connection settings for the chat panel. Stored per browser; empty fields fall back to server env. */
export interface LlmSettings { baseUrl: string; apiKey: string; model: string }

const KEY = 'songbrain.llm.v1';
export const EMPTY_SETTINGS: LlmSettings = { baseUrl: '', apiKey: '', model: '' };

export function loadLlmSettings(): LlmSettings {
  try { return { ...EMPTY_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return { ...EMPTY_SETTINGS }; }
}

export function saveLlmSettings(s: LlmSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
