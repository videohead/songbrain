/**
 * Song Brain server: serves the web app, proxies chat completions to any
 * OpenAI-compatible provider, and hosts the editor relay + song mirror.
 */
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRelay } from './relay';
import { mountMcp } from './mcp';
import { createStyleLibrary } from './styles';
import { createToolExecutor } from './tools';
import { readMidi } from '../src/engine/import/midiRead';
import { styleFromMidi } from '../src/engine/style/learn';
import { validateStyle } from '../src/model/style';
import { toolDefinitions } from '../src/agent/tools';
import { listModels, resolveLlm, runAgentLoop, type LlmSettings } from './agent';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const isProd = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT ?? 5173);
const DATA_DIR = process.env.DATA_DIR ?? path.join(root, 'data');

const ENV_LLM: LlmSettings = {
  baseUrl: (process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, ''),
  apiKey: process.env.LLM_API_KEY ?? '',
  model: process.env.LLM_MODEL ?? 'gpt-4o-mini',
};
const envHasKey = Boolean(ENV_LLM.apiKey && !ENV_LLM.apiKey.startsWith('sk-...'));

const app = express();
const server = http.createServer(app);
const relay = createRelay(server, DATA_DIR);
const styles = createStyleLibrary(process.env.STYLES_DIR ?? path.join(root, 'styles'), path.join(DATA_DIR, 'styles'));
const tools = createToolExecutor(relay, styles);
app.use(express.json({ limit: '16mb' }));
mountMcp(app, tools, relay, styles);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model: ENV_LLM.model, baseUrl: ENV_LLM.baseUrl, hasKey: envHasKey, relay: relay.status() });
});

// ---- Relay API (what the MCP server will wrap) ----
app.get('/api/status', (_req, res) => res.json(relay.status()));
app.get('/api/song', (_req, res) => {
  const song = relay.mirror();
  if (!song) { res.status(404).json({ error: 'No song mirrored yet.' }); return; }
  res.json(song);
});
app.get('/api/styles', (_req, res) => res.json(styles.list()));
app.post('/api/styles', (req, res) => {
  const errors = styles.save(req.body);
  if (errors.length) { res.status(422).json({ ok: false, errors }); return; }
  res.json({ ok: true });
});
/** Learn a style from a MIDI performance of a known chart. Body: { midiBase64, chart: Measure[], id, name, patternBars?, startBar?, save? } */
app.post('/api/styles/learn', (req, res) => {
  const { midiBase64, chart, id, name, patternBars, startBar, save, source, substyle } = req.body ?? {};
  if (typeof midiBase64 !== 'string' || !Array.isArray(chart) || typeof id !== 'string' || typeof name !== 'string') {
    res.status(400).json({ ok: false, error: 'midiBase64, chart[], id and name are required' }); return;
  }
  try {
    const midi = readMidi(new Uint8Array(Buffer.from(midiBase64, 'base64')));
    // Substyle B is merged into the style already in the library under this id (learn A first).
    const into = substyle === 'b' ? styles.get(id) ?? undefined : undefined;
    if (substyle === 'b' && !into) { res.status(422).json({ ok: false, error: `Substyle B needs an existing style "${id}". Learn substyle A first.` }); return; }
    const { style, report } = styleFromMidi(midi, { id, name, chart, patternBars, startBar, source: source ?? 'MIDI upload', into, substyle: substyle === 'b' ? 'b' : 'a' });
    const errors = validateStyle(style);
    if (errors.length) { res.status(422).json({ ok: false, error: 'Learned style failed validation', errors, report }); return; }
    if (save) styles.save(style);
    res.json({ ok: true, style, report });
  } catch (e) {
    res.status(422).json({ ok: false, error: (e as Error).message });
  }
});

app.get('/api/tools', (_req, res) => res.json(toolDefinitions.map((t) => t.function)));
app.post('/api/tool', async (req, res) => {
  const { name, args } = req.body ?? {};
  if (typeof name !== 'string') { res.status(400).json({ ok: false, error: 'name required' }); return; }
  const result = await tools.executeTool(name, (args ?? {}) as Record<string, unknown>);
  res.status(result.ok ? 200 : 422).json(result);
});

// ---- Chat panel agent loop (server-side, streamed as SSE) ----
app.post('/api/agent/chat', async (req, res) => {
  const { messages, llm } = req.body ?? {};
  if (!Array.isArray(messages)) { res.status(400).json({ error: 'messages[] required' }); return; }
  const settings = resolveLlm(llm, ENV_LLM);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  const ctrl = new AbortController();
  // `res` close fires when the client goes away; `req` close fires as soon as the body is read, so don't use it.
  res.on('close', () => { if (!res.writableFinished) ctrl.abort(); });
  await runAgentLoop(tools, settings, messages, (e) => res.write(`data: ${JSON.stringify(e)}\n\n`), ctrl.signal);
  res.end();
});

app.post('/api/llm/models', async (req, res) => {
  const settings = resolveLlm(req.body?.llm, ENV_LLM);
  try { res.json({ ok: true, models: await listModels(settings), baseUrl: settings.baseUrl }); }
  catch (e) { res.status(502).json({ ok: false, error: (e as Error).message }); }
});

async function start() {
  if (isProd) {
    const dist = path.join(root, 'dist');
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({ root, server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
    app.use(vite.middlewares);
  }
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Song Brain ${isProd ? 'prod' : 'dev'} on http://localhost:${PORT}  (default model: ${ENV_LLM.model} @ ${ENV_LLM.baseUrl}${envHasKey ? '' : ', no env API key'}, data: ${DATA_DIR})`);
    console.log(`MCP endpoint: http://localhost:${PORT}/mcp  (Streamable HTTP, stateless)`);
  });
}

start();
