'use strict';
// Where the assistant's sign-ins are kept. The beta gate collects a name and an email; the
// handler still writes one log line per conversation (Vercel keeps those for a limited
// time), and when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set it also inserts a row
// into the `cob_assistant_visitors` table through PostgREST, so the list outlives the logs.
// The table has row-level security on and no policies, so the service key is the only way
// in; it is read on the server and never reaches the browser. A failed insert is warned
// about and otherwise ignored: the visitor still gets their answer.

function createVisitorStore(env = process.env, { fetch: fetchImpl = globalThis.fetch, warn = () => {}, timeoutMs = 4000 } = {}) {
  const url = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY || '';
  const table = env.SUPABASE_VISITORS_TABLE || 'cob_assistant_visitors';
  const enabled = !!(url && key && fetchImpl);
  return {
    enabled,
    async record({ name, email, asked, at }) {
      if (!enabled) return false;
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
      try {
        const res = await fetchImpl(`${url}/rest/v1/${table}`, {
          method: 'POST',
          headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ name, email, asked: asked || null, at: at || new Date().toISOString() }),
          signal: ctl ? ctl.signal : undefined,
        });
        if (!res.ok) { warn('visitor store refused the row:', res.status, String(await res.text().catch(() => '')).slice(0, 200)); return false; }
        return true;
      } catch (e) {
        warn('visitor store unreachable:', e && e.message ? e.message : e); return false;
      } finally { if (timer) clearTimeout(timer); }
    },
  };
}

module.exports = { createVisitorStore };
