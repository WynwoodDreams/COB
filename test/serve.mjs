// A local server for the assistant: the static pages from this folder plus /api/assistant,
// the same handler Vercel runs. With --fake (or FAKE=1) the model is the scripted stand-in
// from fake-gateway.js, so the whole flow runs with no key and no network; without it the
// real gateway is called with AI_GATEWAY_API_KEY from the environment.
//   node test/serve.mjs [--fake] [--port 3000] [--sample]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createHandler } = require('../lib/assistant/handler.js');

const args = process.argv.slice(2);
const fake = args.includes('--fake') || process.env.FAKE === '1';
const sample = args.includes('--sample');
const port = parseInt(args[args.indexOf('--port') + 1], 10) || parseInt(process.env.PORT, 10) || 3000;
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const opts = { boardPath: sample ? path.join(root, 'no-such-board.html') : path.join(root, 'index.html') };
if (fake) { const { fakeGateway } = require('./fake-gateway.js'); opts.fetch = fakeGateway().fetch; opts.env = Object.assign({}, process.env, { AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY || 'fake-key' }); }
const handler = createHandler(opts);
const TYPES = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.pdf': 'application/pdf', '.json': 'application/json', '.js': 'text/javascript' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/assistant') return handler(req, res);
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  if (!path.extname(file)) file += '.html';
  const p = path.join(root, path.normalize(file));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('Content-Type', TYPES[path.extname(p)] || 'application/octet-stream');
  fs.createReadStream(p).pipe(res);
}).listen(port, () => console.log(`assistant preview on http://localhost:${port}/assistant.html  (${fake ? 'fake model' : 'live gateway'}${sample ? ', sample data' : ''})`));
