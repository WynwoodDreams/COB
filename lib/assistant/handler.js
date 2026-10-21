'use strict';
// The request handler behind /api/assistant. One POST per visitor turn:
//   { messages: [{role, content, kind?}], recommendedIds: [] }
// and back comes one of
//   { kind: 'question', question }            a follow-up (at most MAX_FOLLOWUPS per conversation)
//   { kind: 'results', summary, matches, ... } up to five listings from the board, with why and what's missing
//   { kind: 'nomatch', summary, adjustments, closest }
//   { kind: 'answer', reply }                  a question about the recommended listings, answered from their text
//   { kind: 'reply', reply }                   anything else
// Every reply carries `source` ('board' or 'sample'), `model` and `updated`. GET returns the
// same status block so the page can show a disabled or sample-data state before anyone types.

const { loadListings, publicListing } = require('./listings');
const { retrieve, STRONG } = require('./retrieve');
const { createClient, configFromEnv, ModelError } = require('./model');
const prompts = require('./prompts');

const LIMITS = {
  maxMessages: 16,         // turns kept from the conversation (older ones are dropped client-side too)
  maxMessageChars: 1500,
  maxTotalChars: 9000,
  maxBodyBytes: 32 * 1024,
  maxFollowups: 3,
  maxMatches: 5,
  candidates: 12,
  perMinute: 8,            // per client address, per function instance
  perHour: 40,
  perDay: parseInt(process.env.ASSISTANT_DAILY_CAP, 10) || 400,  // per function instance, all visitors
};

// In-memory, per instance: on serverless this is a soft limit that resets when the instance
// does, which is still enough to stop a loop or a script from draining a promotion. A hard
// shared limit would need a store (KV, Upstash); the hook for it is `limiter` below.
function memoryLimiter(now = Date.now) {
  const byIp = new Map(); let day = { start: now(), n: 0 };
  return {
    check(ip) {
      const t = now();
      if (t - day.start > 86400000) day = { start: t, n: 0 };
      if (day.n >= LIMITS.perDay) return { ok: false, retryAfter: 3600, reason: 'daily' };
      const rec = byIp.get(ip) || { minute: [], hour: [] };
      rec.minute = rec.minute.filter(x => t - x < 60000); rec.hour = rec.hour.filter(x => t - x < 3600000);
      if (rec.minute.length >= LIMITS.perMinute) return { ok: false, retryAfter: 60, reason: 'minute' };
      if (rec.hour.length >= LIMITS.perHour) return { ok: false, retryAfter: 600, reason: 'hour' };
      rec.minute.push(t); rec.hour.push(t); byIp.set(ip, rec); day.n++;
      if (byIp.size > 5000) byIp.clear();
      return { ok: true };
    },
  };
}

function clientIp(req) {
  const h = req.headers || {};
  const xf = h['x-forwarded-for'] || h['X-Forwarded-For'];
  return String((Array.isArray(xf) ? xf[0] : xf) || h['x-real-ip'] || (req.socket && req.socket.remoteAddress) || 'unknown').split(',')[0].trim();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body !== undefined) { // Vercel parses JSON bodies; a raw string or object both land here
      if (typeof req.body === 'string') { try { resolve(JSON.parse(req.body)); } catch (e) { reject(new HttpError(400, 'The request body is not JSON.')); } }
      else resolve(req.body || {});
      return;
    }
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > LIMITS.maxBodyBytes) { reject(new HttpError(413, 'The request is too large.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(new HttpError(400, 'The request body is not JSON.')); } });
    req.on('error', reject);
  });
}

class HttpError extends Error { constructor(status, message, code = 'bad_request') { super(message); this.status = status; this.code = code; } }

function cleanMessages(raw) {
  if (!Array.isArray(raw) || !raw.length) throw new HttpError(400, 'Send at least one message.');
  const msgs = raw.slice(-LIMITS.maxMessages).map(m => {
    const role = m && m.role === 'assistant' ? 'assistant' : 'user';
    const content = String((m && m.content) || '').replace(/\s+/g, ' ').trim();
    const kind = m && typeof m.kind === 'string' ? m.kind.slice(0, 20) : '';
    return { role, content, kind };
  }).filter(m => m.content);
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') throw new HttpError(400, 'The last message must be from the visitor.');
  for (const m of msgs) if (m.content.length > LIMITS.maxMessageChars) throw new HttpError(400, `Keep each message under ${LIMITS.maxMessageChars} characters.`, 'too_long');
  if (msgs.reduce((n, m) => n + m.content.length, 0) > LIMITS.maxTotalChars) throw new HttpError(400, 'The conversation is too long; start a new one.', 'too_long');
  return msgs;
}

function createHandler(options = {}) {
  const env = options.env || process.env;
  const cfg = Object.assign(configFromEnv(env), options.config || {});
  const log = options.log || ((...a) => { if (env.ASSISTANT_DEBUG) console.log('[assistant]', ...a); });
  const client = createClient(cfg, { fetch: options.fetch, log });
  const limiter = options.limiter || memoryLimiter(options.now);
  const boardPath = options.boardPath;

  const status = () => {
    const data = loadListings({ boardPath });
    return { enabled: cfg.enabled && !!cfg.apiKey, configured: !!cfg.apiKey, paused: !cfg.enabled, model: cfg.model, providers: cfg.providers,
      source: data.source, listings: data.listings.length, updated: data.updated, limits: { maxMessageChars: LIMITS.maxMessageChars, maxFollowups: LIMITS.maxFollowups, maxMatches: LIMITS.maxMatches } };
  };

  async function run(body) {
    const st = status();
    if (!cfg.enabled) throw new HttpError(503, 'The assistant is paused for now. The listings and filters on the board still work.', 'paused');
    if (!cfg.apiKey) throw new HttpError(503, 'The assistant is not configured on this deployment (AI_GATEWAY_API_KEY is missing).', 'not_configured');
    const messages = cleanMessages(body.messages);
    const data = loadListings({ boardPath });
    const byId = new Map(data.listings.map(d => [d.id, d]));
    const recommended = (Array.isArray(body.recommendedIds) ? body.recommendedIds : []).map(id => byId.get(String(id))).filter(Boolean).slice(0, LIMITS.maxMatches);
    const questionsAsked = messages.filter(m => m.role === 'assistant' && m.kind === 'question').length;
    const base = { source: st.source, model: cfg.model, updated: st.updated, listings: st.listings };

    // 1. read the conversation
    const read = (await client.complete(prompts.readMessages(messages, { recommended, questionsAsked, maxFollowups: LIMITS.maxFollowups }), { schema: prompts.READ_SCHEMA, schemaName: 'intake', maxTokens: 700 })).json || {};
    const profile = normaliseProfile(read.profile);
    log('read', { intent: read.intent, profile, followUp: read.followUp });

    if (read.intent === 'question' && recommended.length) {
      const ans = await client.complete(prompts.answerMessages(messages, recommended), { allowPlain: true, temperature: 0.3, maxTokens: 900 });
      return Object.assign(base, { kind: 'answer', reply: String(ans.text || '').trim(), recommendedIds: recommended.map(d => d.id) });
    }
    if (read.intent === 'other' || (read.intent === 'question' && !recommended.length)) {
      const reply = String(read.reply || '').trim() || 'I can match you to the internships and entry-level jobs on this board and answer questions about the ones I find. Tell me what you study or want to work in, where in South Florida you are, and when you are available.';
      return Object.assign(base, { kind: 'reply', reply, recommendedIds: recommended.map(d => d.id) });
    }
    const hasField = profile.interests.length || profile.skills.length || profile.majors.length;
    if (read.followUp && questionsAsked < LIMITS.maxFollowups && !hasField) {
      return Object.assign(base, { kind: 'question', question: String(read.followUp).trim().slice(0, 300), profile, recommendedIds: recommended.map(d => d.id) });
    }
    if (!hasField) {
      return Object.assign(base, { kind: 'question', question: questionsAsked < LIMITS.maxFollowups ? 'What field or kind of work are you looking for? A major, a job family or a tool you know is enough.' : 'Tell me a field, major or job family to search for and I will look through the board.', profile, recommendedIds: recommended.map(d => d.id) });
    }

    // 2. deterministic retrieval
    const r = retrieve(data.listings, profile, { limit: LIMITS.candidates });
    log('retrieve', { counties: r.counties, candidates: r.scores, strong: r.strong, notes: r.notes });
    const notes = {
      location_filter: r.counties.length ? `limited to ${r.counties.join(', ')}` + (profile.remoteOk ? ' plus remote roles' : '') : 'no location given, so the whole board (Miami-Dade, Broward, Palm Beach) was searched',
      widened: r.notes.includes('widened-area') ? 'fewer than three listings matched in the named area, so nearby counties were included (those cards are marked "Outside your area")' : null,
      eligibility: `${r.wants === 'internship' ? 'internships only' : r.wants === 'job' ? 'entry-level jobs only' : 'internships and entry-level jobs'}; ${r.level === 'undergraduate' ? 'graduate-only listings excluded' : 'all levels'}`,
      term: r.wantedTerm ? `listings naming ${r.wantedTerm} ranked higher; listings that name no term were kept` : null,
      outsideArea: r.scores.filter(s => s.outsideArea).map(s => s.id),
      board_size: data.listings.length, searched: r.poolSize, matched: r.candidates.length,
    };
    if (!r.candidates.length || r.strong === 0) {
      const closest = r.candidates.slice(0, 3).map(d => publicListing(d));
      return Object.assign(base, { kind: 'nomatch', profile, filters: notes,
        summary: `No strong matches on the board right now for ${describe(profile)}. ${closest.length ? 'The closest listings are below, but none is a clear fit.' : 'Nothing on the board came close.'}`,
        adjustments: r.adjustments.slice(0, 4), closest, recommendedIds: closest.map(c => c.id) });
    }

    // 3. rank and explain
    const ranked = (await client.complete(prompts.rankMessages(profile, r.candidates, notes), { schema: prompts.RANK_SCHEMA, schemaName: 'ranking', maxTokens: cfg.maxTokens })).json || {};
    const candById = new Map(r.candidates.map(d => [d.id, d]));
    const seen = new Set(); const matches = [];
    for (const m of (Array.isArray(ranked.matches) ? ranked.matches : [])) {
      const d = m && candById.get(String(m.id));
      if (!d || seen.has(d.id)) continue;   // an id the search did not return cannot be recommended
      seen.add(d.id);
      const idx = arr => [...new Set((Array.isArray(arr) ? arr : []).map(n => parseInt(n, 10)).filter(n => n >= 0 && n < d.requirements.length))];
      const req = idx(m.missingRequired).filter(i => d.requirements[i].kind === 'required');
      const pref = idx(m.missingPreferred).filter(i => d.requirements[i].kind !== 'required' && !req.includes(i));
      matches.push({ listing: publicListing(d), why: String(m.why || '').trim().slice(0, 600), outsideArea: !!(r.scores.find(s => s.id === d.id) || {}).outsideArea,
        missingRequired: req.map(i => d.requirements[i].text), missingPreferred: pref.map(i => d.requirements[i].text) });
      if (matches.length >= LIMITS.maxMatches) break;
    }
    if (!matches.length) {
      const closest = r.candidates.slice(0, 3).map(d => publicListing(d));
      return Object.assign(base, { kind: 'nomatch', profile, filters: notes, summary: String(ranked.summary || '').trim() || `No strong matches on the board right now for ${describe(profile)}.`,
        adjustments: [...new Set([...(Array.isArray(ranked.adjustments) ? ranked.adjustments.map(String) : []), ...r.adjustments])].slice(0, 4), closest, recommendedIds: closest.map(c => c.id) });
    }
    return Object.assign(base, { kind: 'results', profile, filters: notes, summary: String(ranked.summary || '').trim().slice(0, 1200), matches,
      adjustments: matches.length < 3 ? [...new Set([...(Array.isArray(ranked.adjustments) ? ranked.adjustments.map(String) : []), ...r.adjustments])].slice(0, 4) : [],
      recommendedIds: matches.map(m => m.listing.id) });
  }

  // (req, res) in the Node style Vercel's functions use.
  async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const send = (code, obj) => { res.statusCode = code; res.end(JSON.stringify(obj)); };
    try {
      if (req.method === 'GET') return send(200, status());
      if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(405, { error: 'Use POST.', code: 'method' }); }
      const lim = limiter.check(clientIp(req));
      if (!lim.ok) { res.setHeader('Retry-After', String(lim.retryAfter)); return send(429, { error: lim.reason === 'daily' ? 'The assistant has reached its daily limit. Try again tomorrow, or use the filters on the board.' : 'Too many requests. Wait a minute and try again.', code: 'rate_limited', retryAfter: lim.retryAfter }); }
      const body = await readBody(req);
      return send(200, await run(body || {}));
    } catch (e) {
      if (e instanceof HttpError) return send(e.status, { error: e.message, code: e.code });
      if (e instanceof ModelError) { log('model error', e.code, e.detail); return send(e.status || 502, { error: e.message, code: e.code }); }
      log('error', e && e.stack || e);
      return send(500, { error: 'Something went wrong on the server.', code: 'server' });
    }
  }
  handler.run = run; handler.status = status; handler.cfg = cfg;
  return handler;
}

function normaliseProfile(p) {
  p = p && typeof p === 'object' ? p : {};
  const list = v => (Array.isArray(v) ? v : []).map(x => String(x || '').trim().toLowerCase()).filter(Boolean).slice(0, 12);
  return {
    interests: list(p.interests), skills: list(p.skills), majors: list(p.majors), languages: list(p.languages),
    experienceLevel: ['none', 'some', 'experienced'].includes(p.experienceLevel) ? p.experienceLevel : 'unknown',
    level: ['undergraduate', 'graduate', 'any'].includes(p.level) ? p.level : 'undergraduate',
    wantsJob: ['internship', 'job', 'either'].includes(p.wantsJob) ? p.wantsJob : 'internship',
    location: String(p.location || '').trim().slice(0, 120), remoteOk: !!p.remoteOk, availability: String(p.availability || '').trim().slice(0, 120),
  };
}
function describe(p) {
  const what = [...p.interests, ...p.majors, ...p.skills].slice(0, 3).join(', ') || 'what you described';
  return what + (p.location ? ` near ${p.location}` : '');
}

module.exports = { createHandler, LIMITS, memoryLimiter, cleanMessages, HttpError };
