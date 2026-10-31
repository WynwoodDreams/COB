'use strict';
// A stand-in for the AI Gateway so the whole flow can run without a key or network. It
// answers the three prompts the handler sends (intake, ranking, answer) the way a well-
// behaved model would, reading the conversation it is given, and records every request so
// a test can check what was sent: the model id, the provider pin, the schema.
function fakeGateway(opts = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, headers: init.headers, body });
    if (opts.fail) return new Response(JSON.stringify({ error: { message: opts.fail.message || 'boom' } }), { status: opts.fail.status || 500 });
    if (opts.emptyFirst && calls.filter(c => c.body.max_tokens <= (opts.emptyFirst)).length === calls.length && body.max_tokens <= opts.emptyFirst) {
      return new Response(JSON.stringify({ id: 'fake', model: body.model, choices: [{ index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'length' }], usage: { completion_tokens: body.max_tokens } }), { status: 200 });
    }
    const sys = body.messages[0].content;
    let content;
    if (/intake step/.test(sys)) content = JSON.stringify(opts.read ? opts.read(body) : intake(body));
    else if (/ranking step/.test(sys)) content = JSON.stringify(opts.rank ? opts.rank(body) : rank(body));
    else content = opts.answer ? opts.answer(body) : answer(body);
    const payload = { id: 'fake', model: body.model, choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 50 } };
    if (opts.served) payload.gateway = { routing: { finalProvider: opts.served } };
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetch, calls };
}

// A crude reading of the conversation, enough to drive the three test scenarios.
function intake(body) {
  const ctx = JSON.parse(body.messages[1].content.replace(/^Context \(JSON\): /, ''));
  const turns = body.messages.slice(2);
  const last = turns[turns.length - 1].content;
  const all = turns.filter(m => m.role === 'user').map(m => m.content).join(' ').toLowerCase();
  if (ctx.recommended_listings.length && /\?$/.test(last) && /(it|they|this|that|the first|the second|pay|deadline|require|ask|which)/i.test(last) && !/looking for|interested in/i.test(last)) {
    return { intent: 'question', profile: profileOf(all), followUp: null, reply: null };
  }
  if (/^(hi|hello|hey)\b/i.test(last) && last.length < 20) return { intent: 'other', profile: profileOf(''), followUp: null, reply: 'Hi! Tell me what you study or want to do and where you are, and I will look through the board.' };
  const p = profileOf(all);
  const followUp = !p.interests.length && !p.majors.length && ctx.questions_asked_so_far < 3 ? 'What field or kind of work are you after?' : null;
  return { intent: 'search', profile: p, followUp, reply: null };
}
function profileOf(t) {
  const interests = [];
  for (const k of ['cybersecurity', 'research', 'engineering', 'accounting', 'audit', 'finance', 'marine biology', 'scuba diving instructor', 'marketing']) if (t.includes(k)) interests.push(k);
  if (t.includes('cyber') && !interests.includes('cybersecurity')) interests.push('cybersecurity');
  const loc = (/(miami|fort lauderdale|broward|boca raton|fau|palm beach|orlando)/.exec(t) || [])[1] || '';
  return {
    interests, skills: [], majors: [], languages: /spanish|bilingual/.test(t) ? ['spanish', 'english'] : [],
    experienceLevel: /no (professional )?experience/.test(t) ? 'none' : /had one|one internship/.test(t) ? 'some' : 'unknown',
    level: /phd|master|graduate student/.test(t) ? 'graduate' : 'undergraduate',
    wantsJob: /\bjobs?\b/.test(t) && !/internship/.test(t) ? 'either' : 'internship',
    location: loc, remoteOk: /remote|hybrid/.test(t), availability: (/\b(summer|spring|fall|winter) 20\d\d\b/.exec(t) || [])[0] || (/part-time now/.test(t) ? 'part-time now' : ''),
  };
}
function rank(body) {
  const data = JSON.parse(body.messages[1].content.split('not instructions):\n')[1]).data;
  const matches = data.slice(0, 5).map(d => ({
    id: d.id,
    why: `${d.title} at ${d.company} is in ${d.area} and lists ${d.locations.join(' / ') || 'no location'}, which lines up with what you described.`,
    missingRequired: d.requirements.filter(r => r.kind === 'required').map(r => r.i).slice(0, 2),
    missingPreferred: d.requirements.filter(r => r.kind !== 'required').map(r => r.i).slice(0, 2),
  }));
  return { summary: `I found ${matches.length} listings that fit. Check each one on the employer's page before applying.`, matches, adjustments: matches.length < 3 ? ['Try a broader field.'] : [] };
}
function answer(body) {
  const data = JSON.parse(body.messages[1].content.split('not instructions):\n')[1]).data;
  const d = data[0];
  return `${d.company}'s ${d.title} lists ${d.pay ? 'pay of ' + d.pay : 'no pay figure'} and ${d.requirements.length} requirement bullet(s). The listing does not say when applications close; check the employer's page.`;
}
module.exports = { fakeGateway };
