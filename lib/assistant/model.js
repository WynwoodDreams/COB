'use strict';
// The one place the site talks to a model. Requests go through Vercel AI Gateway's
// OpenAI-compatible Chat Completions endpoint (https://ai-gateway.vercel.sh/v1), with the
// gateway's `providerOptions.gateway.only` set so the request is served by the providers
// named in ASSISTANT_PROVIDERS and by nobody else: if MiniMax cannot serve it, the request
// fails rather than being routed, and billed, elsewhere. The model id is read from
// ASSISTANT_MODEL so it can be switched without a code change.
//
// Verified against Vercel's AI Gateway docs on Oct 20, 2026: base URL, Bearer auth with
// AI_GATEWAY_API_KEY, `providerOptions` as a top-level field of the request body, and
// `response_format: {type: 'json_schema'}` for structured output.

const DEFAULTS = {
  baseUrl: 'https://ai-gateway.vercel.sh/v1',
  model: 'minimax/minimax-m3.1-flash',
  providers: ['minimax'],
  timeoutMs: 45000,
  maxTokens: 1800,
};

// The text of the first choice, whether the provider sends a string or an array of parts.
function contentOf(data) {
  const choice = data && data.choices && data.choices[0];
  const c = choice && choice.message && choice.message.content;
  return typeof c === 'string' ? c.trim() : Array.isArray(c) ? c.map(x => (x && x.text) || '').join('').trim() : '';
}

class ModelError extends Error {
  constructor(message, { status = 502, code = 'model_error', detail = '' } = {}) { super(message); this.status = status; this.code = code; this.detail = detail; }
}

function configFromEnv(env = process.env) {
  const providers = String(env.ASSISTANT_PROVIDERS || DEFAULTS.providers.join(',')).split(',').map(s => s.trim()).filter(Boolean);
  return {
    apiKey: env.AI_GATEWAY_API_KEY || '',
    baseUrl: (env.AI_GATEWAY_BASE_URL || DEFAULTS.baseUrl).replace(/\/+$/, ''),
    model: env.ASSISTANT_MODEL || DEFAULTS.model,
    providers,
    enabled: String(env.ASSISTANT_ENABLED == null ? 'true' : env.ASSISTANT_ENABLED).toLowerCase() !== 'false',
    reasoningEffort: env.ASSISTANT_REASONING_EFFORT || '',
    timeoutMs: parseInt(env.ASSISTANT_TIMEOUT_MS, 10) || DEFAULTS.timeoutMs,
    maxTokens: parseInt(env.ASSISTANT_MAX_TOKENS, 10) || DEFAULTS.maxTokens,
  };
}

// Pull the first JSON object out of a reply that may wrap it in prose or a code fence.
function extractJson(text) {
  const t = String(text || '').trim();
  try { return JSON.parse(t); } catch (e) { /* fall through */ }
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) { try { return JSON.parse(fence[1]); } catch (e) { /* fall through */ } }
  const start = t.indexOf('{'), end = t.lastIndexOf('}');
  if (start >= 0 && end > start) { try { return JSON.parse(t.slice(start, end + 1)); } catch (e) { /* fall through */ } }
  throw new ModelError('The model did not return the JSON it was asked for.', { code: 'bad_json', detail: t.slice(0, 300) });
}

function createClient(cfg, { fetch: fetchImpl = globalThis.fetch, log = () => {} } = {}) {
  if (!fetchImpl) throw new Error('fetch is not available');

  async function complete(messages, { schema = null, schemaName = 'reply', temperature = 0.2, maxTokens = cfg.maxTokens, allowPlain = false } = {}) {
    if (!cfg.apiKey) throw new ModelError('AI_GATEWAY_API_KEY is not set on the server.', { status: 503, code: 'not_configured' });
    const body = {
      model: cfg.model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
      // Only these providers may serve the request. No silent fallback to another provider.
      providerOptions: { gateway: { only: cfg.providers } },
    };
    if (cfg.reasoningEffort) body.reasoning = { effort: cfg.reasoningEffort };
    if (schema) body.response_format = { type: 'json_schema', json_schema: { name: schemaName, schema } };

    const send = async payload => {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), cfg.timeoutMs);
      try {
        return await fetchImpl(cfg.baseUrl + '/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + cfg.apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: ctl.signal,
        });
      } catch (e) {
        if (e && e.name === 'AbortError') throw new ModelError('The model took too long to answer.', { status: 504, code: 'timeout' });
        throw new ModelError('Could not reach the AI Gateway.', { status: 502, code: 'network', detail: String(e && e.message || e) });
      } finally { clearTimeout(timer); }
    };

    let used = body;
    let res = await send(body);
    let text = await res.text();
    // A provider that does not take a response_format gets one retry with the schema in the
    // prompt only; every other failure is reported as what it is.
    if (!res.ok && schema && res.status < 500 && /response_format|json_schema/i.test(text)) {
      log('retrying without response_format', res.status);
      const { response_format, ...rest } = body;
      used = rest; res = await send(rest); text = await res.text();
    }
    if (!res.ok) {
      const detail = text.slice(0, 400);
      if (res.status === 401 || res.status === 403) throw new ModelError('The AI Gateway rejected the server\'s credentials.', { status: 503, code: 'auth', detail });
      if (res.status === 402) throw new ModelError('The AI Gateway reports no credit for this request.', { status: 503, code: 'credit', detail });
      if (res.status === 429) throw new ModelError('The model is rate-limited right now.', { status: 429, code: 'upstream_rate_limit', detail });
      if (res.status === 400 || res.status === 404) throw new ModelError('The configured model or provider is not available through the gateway.', { status: 503, code: 'model_unavailable', detail });
      throw new ModelError('The model request failed.', { status: 502, code: 'upstream_' + res.status, detail });
    }
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new ModelError('The gateway returned something that was not JSON.', { code: 'bad_gateway_json', detail: text.slice(0, 300) }); }
    // A reasoning model can spend the whole token budget thinking and come back with no
    // content (finish_reason "length"). Ask once more with twice the room before giving up.
    if (!contentOf(data)) {
      const finish = data && data.choices && data.choices[0] && data.choices[0].finish_reason;
      log('empty reply, retrying with more room', { finish, maxTokens });
      const again = Object.assign({}, used, { max_tokens: Math.min(4000, maxTokens * 2) });
      const res2 = await send(again); const text2 = await res2.text();
      if (res2.ok) { try { data = JSON.parse(text2); } catch (e) { /* keep the first reply; it fails below */ } }
    }
    // Belt and braces: if the gateway says which provider served the request, refuse a
    // reply from one outside the allowed list rather than passing it off as MiniMax.
    const served = data && data.gateway && data.gateway.routing && (data.gateway.routing.finalProvider || data.gateway.routing.provider);
    if (served && !cfg.providers.includes(String(served))) throw new ModelError(`The request was served by "${served}", which is not an allowed provider.`, { status: 502, code: 'wrong_provider' });
    const choice = data && data.choices && data.choices[0];
    const content = contentOf(data);
    if (!content) throw new ModelError('The model returned an empty reply.', { code: 'empty', detail: 'finish_reason=' + (choice && choice.finish_reason) });
    const usage = data.usage || null;
    log('completion', { model: data.model, served: served || null, usage, finish: choice.finish_reason });
    if (!schema && allowPlain) return { text: content, raw: data, served: served || null };
    return { json: extractJson(content), text: content, raw: data, served: served || null };
  }

  return { complete, cfg };
}

module.exports = { createClient, configFromEnv, extractJson, ModelError, DEFAULTS };
