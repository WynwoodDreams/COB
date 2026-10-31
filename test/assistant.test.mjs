import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { createHandler, LIMITS } = require('../lib/assistant/handler.js');
const { retrieve, countiesFor } = require('../lib/assistant/retrieve.js');
const { loadListings, kindOf } = require('../lib/assistant/listings.js');
const { extractJson } = require('../lib/assistant/model.js');
const { fakeGateway } = require('./fake-gateway.js');

const ENV = { AI_GATEWAY_API_KEY: 'test-key', ASSISTANT_ENABLED: 'true' };
const board = path.join(process.cwd(), 'index.html');
const make = (opts = {}) => { const gw = fakeGateway(opts.gateway); return { gw, h: createHandler({ env: Object.assign({}, ENV, opts.env), fetch: gw.fetch, boardPath: opts.boardPath || board, log: () => {} }) }; };

test('listings load from index.html and classify requirement bullets', () => {
  const d = loadListings({ boardPath: board });
  assert.equal(d.source, 'board'); assert.ok(d.listings.length > 100);
  assert.equal(kindOf('Security+ or similar certification preferred'), 'preferred');
  assert.equal(kindOf('Currently pursuing a Bachelor\'s degree'), 'required');
  assert.equal(kindOf('Strong communication skills'), 'unspecified');
});
test('the sample set stands in, clearly labelled, when the board cannot be read', () => {
  const d = loadListings({ boardPath: '/nowhere/index.html', fresh: true });
  assert.equal(d.source, 'sample'); assert.ok(d.listings.every(l => l.id.startsWith('sample-')));
  loadListings({ boardPath: board, fresh: true });
});
test('places map to counties', () => {
  assert.deepEqual(countiesFor('Miami'), ['Miami-Dade']);
  assert.deepEqual(countiesFor('at FAU in Boca'), ['Palm Beach']);
  assert.deepEqual(countiesFor('anywhere in south florida').length, 3);
  assert.deepEqual(countiesFor('Orlando'), []);
});
test('retrieval is deterministic on location and eligibility', () => {
  const L = loadListings({ boardPath: board }).listings;
  const r = retrieve(L, { interests: ['cybersecurity'], location: 'Miami', wantsJob: 'internship', level: 'undergraduate' });
  assert.ok(r.candidates.length);
  assert.ok(r.candidates.every(d => d.kind !== 'Job'), 'internships only');
  assert.ok(r.candidates.every(d => d.level !== 'Graduate'));
  assert.ok(r.candidates.some(d => /cyber/i.test(d.title)));
  const r2 = retrieve(L, { interests: ['marine biology', 'scuba diving instructor'], location: 'Miami', wantsJob: 'internship' });
  assert.equal(r2.strong, 0); assert.ok(r2.adjustments.length >= 2);
});
test('extractJson copes with fences and prose', () => {
  assert.deepEqual(extractJson('Sure:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('{"a":[1,2]} trailing'), { a: [1, 2] });
  assert.throws(() => extractJson('nothing here'));
});

test('GET reports status without touching the model', async () => {
  const { h, gw } = make();
  const st = h.status();
  assert.equal(st.enabled, true); assert.equal(st.model, 'minimax/minimax-m3.1-flash'); assert.deepEqual(st.providers, ['minimax']); assert.equal(gw.calls.length, 0);
  const off = make({ env: { ASSISTANT_ENABLED: 'false' } }).h.status();
  assert.equal(off.enabled, false); assert.equal(off.paused, true);
});

test('scenario 1: Miami cybersecurity student with no experience gets ranked board listings', async () => {
  const { h, gw } = make();
  const r = await h.run({ messages: [{ role: 'user', content: "I'm a cybersecurity student in Miami with no professional experience yet, looking for a Summer 2027 internship." }], recommendedIds: [] });
  assert.equal(r.kind, 'results'); assert.ok(r.matches.length >= 1 && r.matches.length <= 5);
  assert.equal(r.source, 'board'); assert.equal(r.model, 'minimax/minimax-m3.1-flash');
  const L = loadListings({ boardPath: board }).listings;
  for (const m of r.matches) {
    const d = L.find(x => x.id === m.listing.id); assert.ok(d, 'id exists on the board');
    assert.equal(m.listing.apply, d.locs[0].apply, 'apply link is the board\'s own');
    assert.equal(m.listing.statusVerified, false);
    for (const t of m.missingRequired) assert.ok(d.requirements.some(q => q.text === t && q.kind === 'required'));
    for (const t of m.missingPreferred) assert.ok(d.requirements.some(q => q.text === t && q.kind !== 'required'));
    assert.ok(m.why.length > 10);
  }
  assert.ok(r.matches.some(m => /cyber/i.test(m.listing.title)));
  assert.match(r.filters.location_filter, /Miami-Dade/);
  assert.match(r.filters.eligibility, /internships only/);
  // every model call was pinned to the configured model and provider
  assert.equal(gw.calls.length, 2);
  for (const c of gw.calls) { assert.equal(c.body.model, 'minimax/minimax-m3.1-flash'); assert.deepEqual(c.body.providerOptions, { gateway: { only: ['minimax'] } }); assert.equal(c.headers.Authorization, 'Bearer test-key'); assert.equal(c.url, 'https://ai-gateway.vercel.sh/v1/chat/completions'); }
  assert.equal(gw.calls[0].body.response_format.type, 'json_schema');
  assert.ok(gw.calls[1].body.messages[1].content.includes('not instructions'));
});

test('scenario 2: bilingual engineering student, research internship', async () => {
  const { h } = make();
  const r = await h.run({ messages: [{ role: 'user', content: 'Bilingual (English/Spanish) engineering student at FAU, interested in a research internship, available part-time now.' }], recommendedIds: [] });
  assert.equal(r.kind, 'results'); assert.ok(r.matches.length);
  assert.match(r.filters.location_filter, /Palm Beach/);
  assert.deepEqual(r.profile.languages, ['spanish', 'english']);
  // follow-up questions about the recommended listings are answered from their text
  const q = await h.run({ messages: [{ role: 'user', content: 'engineering research' }, { role: 'assistant', content: 'Recommended ...', kind: 'results' }, { role: 'user', content: 'What does the first one pay and is there a deadline?' }], recommendedIds: r.recommendedIds });
  assert.equal(q.kind, 'answer'); assert.match(q.reply, /does not say/);
  assert.deepEqual(q.recommendedIds, r.recommendedIds);
});

test('scenario 3: no matching listings says so and suggests adjustments', async () => {
  const { h, gw } = make();
  const r = await h.run({ messages: [{ role: 'user', content: 'I want to be a scuba diving instructor, marine biology is my thing, I live in Miami, internship please.' }], recommendedIds: [] });
  assert.equal(r.kind, 'nomatch'); assert.match(r.summary, /No strong matches/);
  assert.ok(r.adjustments.length >= 2); assert.ok(r.closest.length <= 3);
  assert.equal(gw.calls.length, 1, 'no ranking call when nothing matched');
});

test('follow-up questions stop at three', async () => {
  const { h } = make();
  const msgs = [{ role: 'user', content: 'hello, I need something' }];
  const r1 = await h.run({ messages: msgs, recommendedIds: [] });
  assert.equal(r1.kind, 'question');
  const three = [...msgs, { role: 'assistant', content: 'q1', kind: 'question' }, { role: 'user', content: 'not sure' }, { role: 'assistant', content: 'q2', kind: 'question' }, { role: 'user', content: 'hmm' }, { role: 'assistant', content: 'q3', kind: 'question' }, { role: 'user', content: 'dunno' }];
  const r2 = await h.run({ messages: three, recommendedIds: [] });
  assert.equal(r2.kind, 'question'); assert.match(r2.question, /Tell me a field/);
});

test('ids the search did not return cannot be recommended, and indexes are checked', async () => {
  const { h } = make({ gateway: { rank: body => ({ summary: 'x', matches: [{ id: 'made-up-id', why: 'nope', missingRequired: [], missingPreferred: [] }, { id: JSON.parse(body.messages[1].content.split('not instructions):\n')[1]).data[0].id, why: 'ok', missingRequired: [99, -1, 0], missingPreferred: [99] }], adjustments: [] }) } });
  const r = await h.run({ messages: [{ role: 'user', content: 'cybersecurity student in Miami' }], recommendedIds: [] });
  assert.equal(r.kind, 'results'); assert.equal(r.matches.length, 1); assert.notEqual(r.matches[0].listing.id, 'made-up-id');
  assert.ok(r.matches[0].missingRequired.length <= 1);
});

test('input limits, the disable switch and gateway errors come back as clear errors', async () => {
  const { h } = make();
  await assert.rejects(h.run({ messages: [] }), /at least one message/);
  await assert.rejects(h.run({ messages: [{ role: 'user', content: 'x'.repeat(LIMITS.maxMessageChars + 1) }] }), /under 1500/);
  await assert.rejects(make({ env: { ASSISTANT_ENABLED: 'false' } }).h.run({ messages: [{ role: 'user', content: 'hi' }] }), /paused/);
  await assert.rejects(make({ env: { AI_GATEWAY_API_KEY: '' } }).h.run({ messages: [{ role: 'user', content: 'hi' }] }), /not configured/);
  await assert.rejects(make({ gateway: { fail: { status: 401 } } }).h.run({ messages: [{ role: 'user', content: 'cyber in miami' }] }), /credentials/);
  await assert.rejects(make({ gateway: { fail: { status: 429 } } }).h.run({ messages: [{ role: 'user', content: 'cyber in miami' }] }), /rate-limited/);
  await assert.rejects(make({ gateway: { served: 'someone-else' } }).h.run({ messages: [{ role: 'user', content: 'cyber in miami' }] }), /not an allowed provider/);
});

test('the model is configurable', async () => {
  const { h, gw } = make({ env: { ASSISTANT_MODEL: 'minimax/other-model', ASSISTANT_PROVIDERS: 'minimax,other' } });
  await h.run({ messages: [{ role: 'user', content: 'cybersecurity in Miami' }], recommendedIds: [] });
  assert.equal(gw.calls[0].body.model, 'minimax/other-model'); assert.deepEqual(gw.calls[0].body.providerOptions.gateway.only, ['minimax', 'other']);
});

test('the HTTP handler rate-limits and answers GET/POST', async () => {
  const { h } = make();
  const call = (method, body, ip = '1.1.1.1') => new Promise(resolve => {
    const headers = {}; let code = 200; let out = '';
    const res = { setHeader: (k, v) => { headers[k] = v; }, set statusCode(c) { code = c; }, get statusCode() { return code; }, end: s => { out += s; resolve({ code, headers, body: JSON.parse(out) }); } };
    h({ method, headers: { 'x-forwarded-for': ip }, body }, res);
  });
  const g = await call('GET'); assert.equal(g.code, 200); assert.equal(g.body.enabled, true);
  const p = await call('POST', { messages: [{ role: 'user', content: 'cybersecurity student in Miami' }] }); assert.equal(p.code, 200); assert.equal(p.body.kind, 'results');
  const bad = await call('POST', { messages: [] }); assert.equal(bad.code, 400);
  let last; for (let i = 0; i < LIMITS.perMinute + 2; i++) last = await call('POST', { messages: [{ role: 'user', content: 'hi' }] }, '2.2.2.2');
  assert.equal(last.code, 429); assert.equal(last.headers['Retry-After'], '60');
  const m = await call('DELETE'); assert.equal(m.code, 405);
});

test('a reply that runs out of tokens while reasoning is retried with a larger budget', async () => {
  const { h, gw } = make({ env: { ASSISTANT_MAX_TOKENS: '500' }, gateway: { emptyFirst: 3000 } });
  const r = await h.run({ messages: [{ role: 'user', content: 'cybersecurity student in Miami' }], recommendedIds: [] });
  assert.equal(r.kind, 'results');
  assert.ok(gw.calls.some(c => c.body.max_tokens >= 9000), 'retried with three times the budget');
});
test('an empty reply that did not hit the cap is reported with its details', async () => {
  const bad = createHandler({ env: ENV, boardPath: board, log: () => {}, fetch: async () => new Response(JSON.stringify({ choices: [{ message: { content: '' }, finish_reason: 'stop' }] }), { status: 200 }) });
  await assert.rejects(bad.run({ messages: [{ role: 'user', content: 'hi' }] }), /empty reply/);
});
