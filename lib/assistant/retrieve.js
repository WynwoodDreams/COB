'use strict';
// Deterministic retrieval. The model never searches: it reads a profile out of what the
// visitor wrote, this file turns that profile into filters and a keyword score over the
// board's own listings, and the model then ranks and explains only what came back. So a
// listing the board does not carry cannot be recommended, and a location or eligibility
// rule is applied the same way every time.

const COUNTIES = ['Miami-Dade', 'Broward', 'Palm Beach'];
// Below this score a candidate is a weak lead, shown only as 'closest on the board'.
const STRONG = 3;
// Place names a visitor is likely to type, by county. Checked longest first so "west palm
// beach" wins over "palm beach" and "north miami beach" over "miami".
const PLACES = {
  'Miami-Dade': ['miami-dade', 'miami dade', 'dade county', 'miami', 'coral gables', 'hialeah', 'doral', 'homestead', 'kendall', 'aventura', 'north miami', 'miami beach', 'miami gardens', 'cutler bay', 'miami lakes', 'brickell', 'wynwood', 'sweetwater', 'fiu', 'university of miami', 'miami dade college', 'mdc'],
  'Broward': ['broward', 'fort lauderdale', 'ft lauderdale', 'ft. lauderdale', 'hollywood', 'pembroke pines', 'miramar', 'plantation', 'davie', 'sunrise', 'coral springs', 'pompano', 'weston', 'deerfield', 'coconut creek', 'tamarac', 'dania', 'hallandale', 'lauderhill', 'margate', 'parkland', 'cooper city', 'nova southeastern', 'nsu', 'broward college'],
  'Palm Beach': ['palm beach', 'boca raton', 'boca', 'west palm', 'delray', 'jupiter', 'boynton', 'wellington', 'lake worth', 'palm beach gardens', 'royal palm', 'belle glade', 'fau', 'florida atlantic', 'palm beach state', 'lynn university'],
};
const ANYWHERE = ['south florida', 'anywhere', 'any location', 'all of florida', 'florida', 'tri-county', 'tricounty', 'open to any'];

function countiesFor(text) {
  const t = String(text || '').toLowerCase();
  if (!t) return [];
  const found = new Set();
  const all = [];
  for (const c of COUNTIES) for (const p of PLACES[c]) all.push([p, c]);
  all.sort((a, b) => b[0].length - a[0].length);
  let scan = t;
  for (const [p, c] of all) {
    const re = new RegExp('(^|[^a-z])' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[^a-z])', 'i');
    if (re.test(scan)) { found.add(c); scan = scan.replace(re, '$1 '); }
  }
  if (!found.size && ANYWHERE.some(a => t.includes(a))) return COUNTIES.slice();
  return [...found];
}

// Interests and skills a visitor names, widened to the words listings use for them. Each
// entry is matched as a whole word (or phrase) in the listing's lower-cased text.
const SYNONYMS = {
  cybersecurity: ['cyber', 'cybersecurity', 'security', 'infosec', 'information security', 'soc', 'threat', 'vulnerability', 'penetration', 'incident response', 'siem', 'grc', 'security+', 'network security', 'detection'],
  cyber: ['cybersecurity'], security: ['cybersecurity'], infosec: ['cybersecurity'], 'information security': ['cybersecurity'],
  software: ['software', 'developer', 'programming', 'engineer', 'full stack', 'frontend', 'backend', 'web', 'application', 'coding', 'javascript', 'python', 'java'],
  'software engineering': ['software'], 'computer science': ['software', 'data', 'it'], programming: ['software'], coding: ['software'], developer: ['software'],
  data: ['data', 'analytics', 'analyst', 'sql', 'python', 'machine learning', 'ai', 'statistics', 'tableau', 'power bi', 'business intelligence', 'database'],
  'data science': ['data'], analytics: ['data'], 'machine learning': ['data', 'ai', 'machine learning', 'deep learning'], ai: ['ai', 'artificial intelligence', 'machine learning', 'llm', 'data'],
  it: ['it', 'information technology', 'help desk', 'support', 'systems', 'network', 'infrastructure', 'technician'],
  cloud: ['cloud', 'aws', 'azure', 'gcp', 'devops', 'kubernetes', 'sre', 'platform', 'infrastructure', 'linux'],
  devops: ['cloud'], aws: ['cloud'], azure: ['cloud'],
  research: ['research', 'lab', 'laboratory', 'r&d', 'scientist', 'study', 'experiment', 'investigat', 'phd', 'thesis', 'academic'],
  engineering: ['engineer', 'engineering'],
  mechanical: ['mechanical', 'hvac', 'manufacturing', 'solidworks', 'cad', 'thermal', 'engineer'],
  electrical: ['electrical', 'electronics', 'circuit', 'power', 'embedded', 'firmware', 'hardware', 'engineer'],
  civil: ['civil', 'structural', 'transportation', 'construction', 'site', 'infrastructure', 'environmental', 'engineer'],
  biomedical: ['biomedical', 'medical device', 'bioengineering', 'clinical', 'engineer'],
  aerospace: ['aerospace', 'aviation', 'aircraft', 'avionics', 'engineer'],
  accounting: ['accounting', 'audit', 'tax', 'cpa', 'bookkeeping', 'assurance', 'ledger'],
  finance: ['finance', 'financial', 'banking', 'investment', 'wealth', 'analyst', 'fp&a', 'treasury', 'credit', 'underwriting'],
  banking: ['finance'], investment: ['finance'],
  marketing: ['marketing', 'social media', 'brand', 'content', 'communications', 'pr', 'digital', 'seo', 'advertising', 'campaign'],
  'social media': ['marketing'], communications: ['marketing', 'communications', 'public relations', 'writing'],
  sales: ['sales', 'business development', 'account', 'client', 'customer'],
  business: ['business', 'operations', 'management', 'strategy', 'project', 'supply chain', 'logistics', 'analyst', 'consulting'],
  operations: ['business'], management: ['business'], consulting: ['business', 'consulting', 'advisory'], 'supply chain': ['supply chain', 'logistics', 'procurement', 'business'],
  hr: ['human resources', 'hr', 'talent', 'recruiting', 'people'], 'human resources': ['hr'], recruiting: ['hr'],
  legal: ['legal', 'law', 'paralegal', 'attorney', 'compliance', 'litigation'], law: ['legal'], paralegal: ['legal'],
  nursing: ['nurse', 'nursing', 'rn', 'patient', 'clinical', 'hospital'], nurse: ['nursing'],
  health: ['health', 'healthcare', 'clinical', 'hospital', 'patient', 'medical', 'pharmacy', 'public health'], healthcare: ['health'], medical: ['health'], pharmacy: ['pharmacy', 'pharmd', 'pharmacist', 'health'],
  psychology: ['psychology', 'mental health', 'counseling', 'behavioral', 'social work', 'therapy'], 'mental health': ['psychology'], 'social work': ['psychology', 'social work', 'case management'],
  architecture: ['architecture', 'architectural', 'revit', 'design', 'interior', 'urban'], construction: ['construction', 'project', 'estimating', 'field', 'site', 'civil'],
  design: ['design', 'graphic', 'ux', 'ui', 'creative', 'visual', 'adobe', 'figma'], graphic: ['design'], ux: ['design'],
  media: ['media', 'video', 'production', 'journalism', 'editing', 'broadcast', 'film', 'photography', 'creative'], video: ['media'], journalism: ['media', 'writing', 'editorial'],
  hospitality: ['hospitality', 'hotel', 'event', 'guest', 'tourism', 'restaurant', 'resort', 'cruise'], events: ['hospitality', 'event'], sports: ['sports', 'athletic', 'team', 'arena', 'stadium', 'hospitality'],
  education: ['education', 'teaching', 'tutor', 'school', 'nonprofit', 'community', 'youth', 'student'], nonprofit: ['nonprofit', 'community', 'education'], teaching: ['education'],
  science: ['science', 'biology', 'chemistry', 'environmental', 'sustainability', 'lab', 'research'], biology: ['science', 'biology', 'lab'], chemistry: ['science', 'chemistry', 'lab'], environmental: ['environmental', 'sustainability', 'science', 'civil'], sustainability: ['environmental'],
  'real estate': ['real estate', 'property', 'leasing', 'development', 'brokerage'], aviation: ['aviation', 'airline', 'aircraft', 'airport', 'aerospace'],
  'project management': ['project', 'coordinator', 'planning', 'business'],
  writing: ['writing', 'writer', 'editorial', 'content', 'copy'], spanish: ['spanish', 'bilingual'], bilingual: ['bilingual', 'spanish', 'portuguese', 'creole'],
  python: ['python', 'data', 'software'], sql: ['sql', 'data'], excel: ['excel', 'spreadsheet', 'analyst'], java: ['java', 'software'], javascript: ['javascript', 'web', 'software'], networking: ['network', 'cisco', 'it', 'cybersecurity'], linux: ['linux', 'cloud', 'it'],
};

function expandTerms(words) {
  const out = new Map();  // term -> weight (1 for a word the visitor used, .6 for a synonym)
  const add = (t, w) => { t = t.toLowerCase().trim(); if (t.length < 2) return; if (!out.has(t) || out.get(t) < w) out.set(t, w); };
  const seen = new Set();
  const walk = (t, w, depth) => {
    t = t.toLowerCase().trim(); if (!t || seen.has(t + depth)) return; seen.add(t + depth);
    add(t, w);
    const syn = SYNONYMS[t];
    if (!syn || depth > 1) return;
    for (const s of syn) { if (SYNONYMS[s] && s !== t && depth === 0) walk(s, w * 0.8, depth + 1); else add(s, w * 0.6); }
  };
  for (const w of words) {
    walk(String(w), 1, 0);
    // "cybersecurity student" -> also try each word on its own once the phrase missed the table
    const own = !!SYNONYMS[String(w).toLowerCase().trim()];
    for (const part of String(w).toLowerCase().split(/[\s,/&]+/)) if (part.length > 3 && part !== w.toLowerCase()) walk(part, own ? 0.7 : 1, 1);
  }
  return out;
}

const STOP = new Set(['intern', 'internship', 'internships', 'student', 'students', 'job', 'jobs', 'role', 'roles', 'position', 'positions', 'work', 'experience', 'the', 'and', 'with', 'for', 'something', 'anything', 'entry', 'level', 'entry-level', 'career', 'opportunity', 'opportunities', 'summer', 'fall', 'spring', 'winter', 'florida', 'miami', 'remote', 'hybrid', 'full-time', 'part-time', 'time', 'year', 'years']);

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function hits(text, term) {
  const re = new RegExp('(^|[^a-z0-9+#])' + esc(term) + '(?=$|[^a-z0-9])', 'g');
  let n = 0; while (re.exec(text)) n++; return n;
}

function scoreListing(d, terms) {
  let score = 0; const matched = [];
  const title = d.title.toLowerCase(), cat = d.cat.toLowerCase(), majors = d.majors.join(' ').toLowerCase(), body = (d.snippet + ' ' + d.details.join(' ') + ' ' + d.company).toLowerCase();
  let primary = false, core = false;
  for (const [t, w] of terms) {
    if (STOP.has(t)) continue;
    let s = 0;
    if (hits(title, t)) s += 3;
    if (hits(cat, t)) s += 1.5;
    if (hits(majors, t)) s += 1.5;
    // a word the visitor used, in the title, area or majors: the listing is about what they asked for
    if (s && w >= 0.7) core = true;
    const b = hits(body, t); if (b) s += Math.min(2, 0.8 * b);
    if (s) { score += s * w; matched.push(t); if (w >= 0.7) primary = true; }
  }
  // A listing that only matches widened synonyms, never a word the visitor used, is a weak lead.
  if (!primary) score *= 0.5;
  return { score, matched, core };
}

// The profile the model read out of the conversation, with every field optional.
function retrieve(listings, profile, opts = {}) {
  const p = profile || {};
  const limit = opts.limit || 12, minScore = opts.minScore == null ? 1.5 : opts.minScore;
  const notes = [];
  const counties = countiesFor([p.location, p.locationText].filter(Boolean).join(' '));
  const remoteOk = !!p.remoteOk;
  const wants = p.wantsJob === 'job' ? 'job' : p.wantsJob === 'either' ? 'either' : 'internship';
  const level = p.level === 'graduate' ? 'graduate' : p.level === 'any' ? 'any' : 'undergraduate';
  const terms = expandTerms([].concat(p.interests || [], p.skills || [], p.majors || []).filter(Boolean));
  const termWanted = (p.availability || '').match(/\b(winter|spring|summer|fall)\s+(20\d\d)\b/i);
  const wantedTerm = termWanted ? termWanted[1][0].toUpperCase() + termWanted[1].slice(1).toLowerCase() + ' ' + termWanted[2] : '';
  const bilingual = (p.languages || []).some(l => /spanish|portuguese|creole|bilingual/i.test(l));

  const eligible = d => {
    if (wants === 'internship' && d.kind === 'Job') return false;
    if (wants === 'job' && d.kind !== 'Job') return false;
    if (level === 'undergraduate' && d.level === 'Graduate') return false;
    if (d.level === 'Law school' && !(p.majors || []).concat(p.interests || []).some(m => /law|legal/i.test(m))) return false;
    if (d.level === 'Pharmacy (PharmD)' && !(p.majors || []).concat(p.interests || []).some(m => /pharm/i.test(m))) return false;
    if (d.flag === 'Returning interns only') return false;
    return true;
  };
  const inPlace = d => !counties.length || d.counties.some(c => counties.includes(c)) || (remoteOk && /remote/i.test(d.mode));

  let pool = listings.filter(eligible);
  const placed = pool.filter(inPlace);
  let widened = false;
  const scored = list => list.map(d => { const s = scoreListing(d, terms); return Object.assign({ d }, s); }).filter(x => x.score >= minScore);
  let ranked = scored(placed);
  if (counties.length && ranked.length < 3) {
    const wider = scored(pool).filter(x => !ranked.some(y => y.d.id === x.d.id));
    if (wider.length) { widened = true; ranked = ranked.concat(wider.map(x => Object.assign(x, { score: x.score * 0.7, outsideArea: true }))); }
  }
  if (!terms.size) { ranked = []; notes.push('no-interests'); }
  for (const x of ranked) {
    if (wantedTerm && x.d.term.includes(wantedTerm)) x.score *= 1.25;
    if (wantedTerm && x.d.term.length && !x.d.term.includes(wantedTerm)) x.score *= 0.85;
    if (bilingual && x.d.lang.length) x.score *= 1.15;
    if (!bilingual && x.d.langNeed === 'required') x.score *= 0.8;
    if (x.d.posted) { const age = (Date.now() - new Date(x.d.posted + 'T12:00:00').getTime()) / 86400000; if (age > 60) x.score *= 0.9; }
  }
  ranked.sort((a, b) => b.score - a.score || (b.d.posted || '').localeCompare(a.d.posted || ''));
  const top = ranked.slice(0, limit);
  if (widened && top.some(x => x.outsideArea)) notes.push('widened-area');

  // What to try instead when little or nothing came back, worked out from the board itself.
  const adjustments = [];
  // A strong match names the visitor's field in its title, area or majors and clears the bar;
  // anything else is a lead the page shows only as "closest on the board".
  const strong = top.filter(x => x.core && x.score >= STRONG).length;
  if (strong < 3) {
    if (counties.length && counties.length < 3 && placed.length < pool.length) adjustments.push(`Widen the location: the board also carries listings in ${COUNTIES.filter(c => !counties.includes(c)).join(' and ')}, and some remote or hybrid roles.`);
    if (wants === 'internship' && listings.some(d => d.kind === 'Job')) adjustments.push('Include entry-level jobs as well as internships; the board carries a few, mostly in Cloud & DevOps.');
    if (wantedTerm) adjustments.push(`Drop the ${wantedTerm} term: most listings name no term at all, and the board only shows the ones that do under that filter.`);
    const areaCounts = new Map(); for (const d of pool) areaCounts.set(d.cat, (areaCounts.get(d.cat) || 0) + 1);
    const near = [...areaCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([a, n]) => `${a} (${n})`);
    if (near.length) adjustments.push(`Try a neighbouring area on the board: the largest right now are ${near.join(', ')}.`);
    if (terms.size) adjustments.push('Use a broader word for the field (the board searches title, employer, area, majors and the posting text), or name a major instead of a job title.');
  }
  return {
    candidates: top.map(x => x.d), scores: top.map(x => ({ id: x.d.id, score: +x.score.toFixed(2), matched: x.matched, core: !!x.core, outsideArea: !!x.outsideArea })),
    counties, wantedTerm, wants, level, terms: [...terms.keys()], notes, adjustments, poolSize: pool.length, placedSize: placed.length,
    strong,
  };
}

module.exports = { retrieve, countiesFor, expandTerms, scoreListing, COUNTIES, STRONG };
