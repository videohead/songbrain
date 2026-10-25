/** Smoke-test the MCP endpoint with the official client. Usage: npx tsx scripts/dev/mcp-smoke.ts [http://localhost:5173/mcp] */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const url = new URL(process.argv[2] ?? 'http://localhost:5173/mcp');
const client = new Client({ name: 'smoke', version: '0.0.0' });
await client.connect(new StreamableHTTPClientTransport(url));
const tools = await client.listTools();
console.log('tools:', tools.tools.map((t) => t.name).join(', '));
const res = await client.listResources();
console.log('resources:', res.resources.map((r) => r.uri).join(', '));
const text = (r: Awaited<ReturnType<typeof client.callTool>>) => (r.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
const get = await client.callTool({ name: 'GetSong', arguments: {} });
const parsed = JSON.parse(text(get));
console.log('GetSong:', parsed.song?.title, parsed.song?.key, 'editor:', JSON.stringify(parsed.editor));
const tr = await client.callTool({ name: 'TransposeSong', arguments: { toKey: 'Eb' } });
console.log('TransposeSong:', text(tr).slice(0, 120), tr.isError ? '(isError)' : '');
const bad = await client.callTool({ name: 'InsertProgression', arguments: { beforeMeasure: 1, chords: [] } });
console.log('schema reject:', bad.isError ? 'isError' : 'no error', text(bad).slice(0, 100));
await client.close();
