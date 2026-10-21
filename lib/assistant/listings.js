'use strict';
// The assistant reads the same listings the board shows: the inline <script id="data"> block
// of the committed index.html, which is the only record of what is live (data.json is
// gitignored). Vercel bundles index.html next to the function through `includeFiles` in
// vercel.json, which build_data.py writes. If that file cannot be read or parsed, a small,
// clearly labelled sample set stands in so the preview still works; every response says
// which one it is using.
const fs = require('fs');
const path = require('path');

const SAMPLE_PATH = path.join(__dirname, 'sample-listings.json');
const DAY = 86400000;

function safeUrl(u) { return /^https?:\/\//i.test(String(u || '')) ? String(u) : ''; }

// Requirement bullets are split into what the posting says it requires and what it says it
// would like. The cue nearest the bullet decides; a bullet with no cue is "unspecified", and
// the page says so rather than guessing.
const PREFERRED = /\b(preferred|a plus|plus\b|nice to have|nice-to-have|bonus|ideally|desired|desirable|is an asset|would be great|helpful|welcome)\b/i;
const REQUIRED = /\b(required|must|minimum|at least|currently (pursuing|enrolled)|enrolled in|pursuing a|eligib|ability to|authorized to work|graduating|gpa|need to|needs to|requires?)\b/i;
function kindOf(text) {
  const t = String(text || '');
  if (PREFERRED.test(t)) return 'preferred';
  if (REQUIRED.test(t)) return 'required';
  return 'unspecified';
}

function normalise(raw, i) {
  const d = Object.assign({}, raw);
  d.id = String(d.id || i).replace(/[^\w-]/g, '');
  d.company = String(d.company || '');
  d.title = String(d.title || 'Intern');
  d.cat = String(d.cat || 'Other');
  for (const k of ['majors', 'term', 'types', 'details', 'counties', 'lang']) if (!Array.isArray(d[k])) d[k] = [];
  for (const k of ['pay', 'level', 'mode', 'flag', 'snippet', 'kind']) d[k] = String(d[k] || '');
  d.indeed = safeUrl(d.indeed);
  d.locs = (Array.isArray(d.locs) ? d.locs : []).map(l => ({ loc: String((l && l.loc) || ''), apply: safeUrl(l && l.apply) || d.indeed, county: String((l && l.county) || '') }));
  if (!d.locs.length) d.locs = [{ loc: '', apply: d.indeed, county: '' }];
  d.posted = /^\d{4}-\d{2}-\d{2}$/.test(d.posted || '') ? d.posted : '';
  d.langNeed = d.lang.length && (d.langNeed === 'required' || d.langNeed === 'plus') ? d.langNeed : '';
  d.requirements = d.details.map((text, idx) => ({ i: idx, text: String(text), kind: kindOf(text) }));
  d.hay = [d.company, d.title, d.cat, d.kind, d.majors.join(' '), d.locs.map(l => l.loc).join(' '), d.counties.join(' '),
    d.term.join(' '), d.level, d.mode, d.pay, d.flag, d.snippet, d.details.join(' '), d.lang.length ? 'bilingual ' + d.lang.join(' ') : ''].join(' ').toLowerCase();
  return d;
}

function parseBoard(html) {
  const m = /<script id="data" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('index.html carries no <script id="data"> block');
  const data = JSON.parse(m[1]);
  if (!Array.isArray(data) || !data.length) throw new Error('listing data is empty');
  const date = (/updated ([A-Z][a-z]{2} \d{1,2}, \d{4})/.exec(html) || [])[1] || '';
  return { listings: data.map(normalise), updated: date };
}

let cache = null;
function loadListings(opts = {}) {
  if (cache && !opts.fresh) return cache;
  // A path given outright (an option, or ASSISTANT_BOARD_PATH) is the only one tried, so a
  // test or a deploy that points at a missing file lands on the sample set rather than on
  // whatever index.html happens to be nearby.
  const given = opts.boardPath || process.env.ASSISTANT_BOARD_PATH;
  const candidates = given ? [given] : [path.join(process.cwd(), 'index.html'), path.join(__dirname, '..', '..', 'index.html')];
  for (const p of candidates) {
    try {
      const html = fs.readFileSync(p, 'utf8');
      const { listings, updated } = parseBoard(html);
      cache = { source: 'board', listings, updated, path: p };
      return cache;
    } catch (e) { /* try the next */ }
  }
  const sample = JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf8'));
  cache = { source: 'sample', listings: sample.listings.map(normalise), updated: sample.updated, path: SAMPLE_PATH };
  return cache;
}

// What the client renders: only fields the board itself carries, never model output.
function publicListing(d) {
  return {
    id: d.id, company: d.company, title: d.title, area: d.cat, kind: d.kind === 'Job' ? 'Entry-level job' : 'Internship',
    level: d.level, term: d.term, pay: d.pay, mode: d.mode, types: d.types, posted: d.posted, flag: d.flag,
    lang: d.lang, langNeed: d.langNeed, snippet: d.snippet, majors: d.majors,
    locs: d.locs.map(l => ({ loc: l.loc, apply: l.apply, county: l.county })),
    apply: d.locs[0].apply, indeed: d.indeed,
    requirements: d.requirements.map(r => ({ text: r.text, kind: r.kind })),
    // The board cannot see a posting the employer took down early; nothing here has been
    // checked against the employer's page, and the UI says so on every card.
    statusVerified: false,
  };
}

module.exports = { loadListings, parseBoard, publicListing, kindOf, DAY };
