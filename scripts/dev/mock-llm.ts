/**
 * Minimal mock of an OpenAI-compatible streaming endpoint for testing the agent loop.
 * Turn 1 (no tool results in history): streams a GetSong tool call.
 * Turn 2 (after tool results): streams a text answer mentioning the key.
 * Usage: npx tsx scripts/dev/mock-llm.ts [port=4100]
 */
import http from 'node:http';

const port = Number(process.argv[2] ?? 4100);
const sse = (res: http.ServerResponse, chunks: unknown[]) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  for (const c of chunks) res.write(`data: ${JSON.stringify(c)}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
};
const delta = (d: Record<string, unknown>, finish: string | null = null) => ({ id: 'x', object: 'chat.completion.chunk', choices: [{ index: 0, delta: d, finish_reason: finish }] });

http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.url?.endsWith('/models')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'mock-small' }, { id: 'mock-large' }] }));
      return;
    }
    const { messages, stream } = JSON.parse(body || '{}');
    const lastTool = messages.filter((m: { role: string }) => m.role === 'tool').pop();
    if (!stream) { res.writeHead(400); res.end('mock expects stream: true'); return; }
    if (!lastTool) {
      sse(res, [
        delta({ role: 'assistant', content: '' }),
        delta({ tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'GetSong', arguments: '' } }] }),
        delta({ tool_calls: [{ index: 0, function: { arguments: '{}' } }] }),
        delta({}, 'tool_calls'),
      ]);
    } else {
      const key = JSON.parse(lastTool.content).song?.key ?? '?';
      sse(res, [delta({ role: 'assistant', content: 'Your song ' }), delta({ content: `is in ${key}.` }), delta({}, 'stop')]);
    }
  });
}).listen(port, () => console.log(`mock llm on ${port}`));
