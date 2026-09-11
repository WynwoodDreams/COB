#!/usr/bin/env python3
"""Build the opportunity board.

Typical use (from the repo root):

    python3 build_data.py listings.xlsx            # xlsx -> data.json + index.html
    python3 build_data.py --data data.json         # re-render index.html from a saved data.json
    python3 build_data.py listings.xlsx --stats    # also print classification counters

The spreadsheet needs these columns: company, positionName, location, jobType/0..3,
postingDateParsed, externalApplyLink, salary, description, url, id.
"""
import argparse, base64, collections, datetime as dt, hashlib, json, os, re, sys

# ---------- category rules: (category, title keywords) in priority order ----------
CATS = [
 ("Health Sciences & Pharmacy", r"pharmac|nurse|nursing|respiratory|medical assistant|\bMA/|chiropract|veterinar|patient care"),
 ("Mental Health & Social Work", r"mental health|counsel|therapist|therapy|psycholog|social work|\bBSW\b|\bMSW\b|RMHCI|LMHC|behavioral health|clinical intern"),
 ("Legal", r"\blaw\b|legal|law clerk|bankruptcy|attorney|paralegal|\b2L\b"),
 ("Accounting, Tax & Audit", r"\btax\b|audit|assurance|accounting|accountant|forensic|attest|risk advisory|technology risk|accounting methods"),
 ("Finance, Banking & Insurance", r"financ|wealth|banking|capital markets|private equity|asset management|quant|trading|actuarial|multinational|lending|commercial banking|insurance|state farm agent|FRP internship|client advisory|transaction"),
 ("Human Resources & Talent", r"human resources|\bHR\b|talent acquisition|people & culture|recruit"),
 ("Civil, Structural & Environmental Engineering", r"civil|structural engineer|geotechnical|water|wastewater|transportation engineering|surveying|environmental engineering|\bCEI\b|\bDOT\b|traffic|intern engineer|engineering & estimating|engineering intern \| fort|planning intern"),
 ("Software, IT, Data & AI", r"software|developer|programmer|\bIT\b|information technology|\bdata\b|analytics|\bAI\b|machine learning|cyber|digital product|android|web develop|it infrastructure|systems engineering|app / game"),
 ("Architecture, Construction & Design", r"architect|construction|\bBIM\b|interior design|estimating|building automation|fire & life safety|^project intern"),
 ("Mechanical, Electrical & Manufacturing Engineering", r"mechanical|electrical|electronics|\bRF\b|analog|radio|industrial engineering|manufacturing|process engineer|materials|packaging|biomedical|design engineering|engineering intern|engineering internship|engineer, intern|test technician|CAD design|advanced operations|aviation safety|technical sales"),
 ("Science, Sustainability & Environment", r"chemist|R&D|environmental|sustainab|scientist|research|\blab\b|QEHS|horticult|landscape"),
 ("Marketing, Communications & PR", r"marketing|social media|communication|\bPR\b|public relations|brand|content creator|influencer|campus ambassador|community management|client solutions|e-retail|business communications"),
 ("Creative: Media, Design & Production", r"graphic design|video|photograph|content studio|control room|film|television|studio engineer|music|creative|design intern"),
 ("Hospitality, Events, Sports & Entertainment", r"hospitality|F&B|culinary|hotel|\bclub\b|golf|event|sports|game ops|MIA Academy|strength and conditioning|premium client|sodexo|yotel|academic support|athletic"),
 ("Sales & Business Development", r"\bsales\b|business development|door to door|financial representative"),
 ("Education, Nonprofit & Community", r"ministry|student services|cultivate|programs & partnerships|volunteer|community engagement|nonprofit|school"),
 ("Skilled Trades, Automotive & Aviation", r"mechanic|service technician|aircraft|HVAC|maintenance|trainee.*technician"),
 ("Business, Management & Operations", r"management|business|operations|supply chain|purchasing|consult|administrative|administration|store executive|leasing|customer service|client|coordinator|program development|provider operations|internship program|^intern$|intern / co-op|summer internship program"),
]
DEFAULT_CAT = "Business, Management & Operations"
GENERIC = r"^(intern|internship|intern / co-op|summer internship program.*|internship program.*|.*summer 20\d\d internship)$"
COMPANY_RULES = [
 ("Architecture, Construction & Design", r"construction|contracting|builders|architecture"),
 ("Legal", r"\blaw\b|legal"),
 ("Science, Sustainability & Environment", r"landscape"),
 ("Accounting, Tax & Audit", r"advisory|\bCPA"),
 ("Civil, Structural & Environmental Engineering", r"engineering"),
]
DESC_FALLBACK = [
 ("Architecture, Construction & Design", r"construction management|general contractor"),
 ("Accounting, Tax & Audit", r"accounting|\btax\b|audit"),
 ("Software, IT, Data & AI", r"software|computer science|information technology|data analy"),
 ("Marketing, Communications & PR", r"marketing|social media"),
 ("Finance, Banking & Insurance", r"finance|financial"),
 ("Architecture, Construction & Design", r"construction|architect"),
 ("Mechanical, Electrical & Manufacturing Engineering", r"engineering"),
]

def classify(title, desc, company=''):
    t = title.strip()
    if re.search(GENERIC, t, re.I):
        for cat, k in [("Architecture, Construction & Design", r"construction|contracting|builders"),
                       ("Science, Sustainability & Environment", r"landscape"),
                       ("Accounting, Tax & Audit", r"advisory|\bCPA")]:
            if re.search(k, company, re.I): return cat
        if re.search(r"construction", desc[:600], re.I): return "Architecture, Construction & Design"
    for cat, tk in CATS:
        if re.search(tk, t, re.I): return cat
    for cat, k in COMPANY_RULES:
        if re.search(k, company, re.I): return cat
    d = desc[:1500]
    for cat, k in DESC_FALLBACK:
        if re.search(k, d, re.I): return cat
    return DEFAULT_CAT

MAJORS = [
 ("Accounting", r"accounting|accountant|\bCPA\b"), ("Finance", r"\bfinance\b"), ("Economics", r"economics"),
 ("Marketing", r"marketing"), ("Business Administration", r"business administration|business management|business degree|\bbusiness\b(?! development| communications| analytics| strategy)"),
 ("Communications", r"communications?\b(?! skills| and interpersonal)|journalism|mass comm"), ("Public Relations", r"public relations"),
 ("Computer Science", r"computer science|software engineering|computer engineering"), ("Information Technology", r"information technology|information systems|\bMIS\b"),
 ("Cybersecurity", r"cyber ?security|information security"), ("Data Science / Analytics", r"data science|data analytics|statistics|business analytics"),
 ("Artificial Intelligence", r"artificial intelligence|machine learning"),
 ("Civil Engineering", r"civil engineering"), ("Mechanical Engineering", r"mechanical engineering"), ("Electrical Engineering", r"electrical engineering|electrical and computer"),
 ("Industrial Engineering", r"industrial engineering"), ("Biomedical Engineering", r"biomedical"), ("Chemical Engineering", r"chemical engineering"),
 ("Environmental Engineering / Science", r"environmental (engineering|science)"), ("Aerospace Engineering", r"aerospace"),
 ("Construction Management", r"construction management|construction engineering|construction technology"), ("Architecture", r"(?<!enterprise )(?<!software )(?<!system )architecture|architectural"),
 ("Interior Design", r"interior design"), ("Landscape / Horticulture", r"landscape|horticulture|agriculture|plant science"),
 ("Nursing", r"\bnursing\b|\bRN\b|\bBSN\b"), ("Pharmacy", r"pharmacy|pharm\.?d"), ("Respiratory Therapy", r"respiratory"),
 ("Health Sciences", r"health science|pre-med|biology|medical assist"), ("Psychology", r"psychology"), ("Counseling", r"counseling|counselor education|marriage and family"),
 ("Social Work", r"social work"), ("Graphic Design", r"graphic design"), ("Film / Video", r"\bfilm\b|video production"),
 ("Photography", r"photograph"), ("Music", r"\bmusic\b"), ("Hospitality Management", r"hospitality"), ("Sports Management", r"sports management|sport management|kinesiology|exercise science"),
 ("Human Resources", r"human resources? (management|degree|major)|human resources|\bHR\b"), ("Supply Chain / Logistics", r"supply chain|logistics"), ("Mathematics", r"mathematics"),
 ("Chemistry", r"chemistry"), ("Law / Legal Studies", r"law school|\bJ\.?D\.?\b|legal studies|paralegal"), ("Education", r"\beducation\b degree|early childhood|teaching"),
 ("Aviation", r"aviation"), ("Real Estate", r"real estate"), ("Political Science / Public Admin", r"political science|public administration|public policy"),
]
def majors_for(desc, title):
    windows = [title]
    for m in re.finditer(r"(degree|major|majoring|pursuing|enrolled|studying|student in|students in|program in|candidate in|background in|coursework|field of study|fields?:)", desc, re.I):
        windows.append(desc[max(0, m.start()-60): m.end()+220])
    txt = "\n".join(windows)
    found = []
    for name, k in MAJORS:
        if re.search(k, txt, re.I): found.append(name)
    return found[:8]

TODAY = dt.date.today()
# Postings advertise the current cycle and the next two years; anything else is a typo or stale.
TERM_YEARS = tuple(str(y) for y in range(TODAY.year, TODAY.year + 3))
# Last month of each academic term, used to tell a term that has already ended from one still ahead.
SEASON_END_MONTH = {"Winter": 2, "Spring": 5, "Summer": 8, "Fall": 12}
def term_is_past(term):
    m = re.match(r"^(Winter|Spring|Summer|Fall)\s+(\d{4})$", term or "")
    if not m: return False
    return (int(m.group(2)), SEASON_END_MONTH[m.group(1)]) < (TODAY.year, TODAY.month)
def term_for(title, desc):
    pats = r"(Summer|Fall|Spring|Winter|Autumn)\s*(20\d\d)|(20\d\d)\s*(Summer|Fall|Spring|Winter)"
    found = []
    for src in (title, desc[:2500]):
        for m in re.finditer(pats, src, re.I):
            season = (m.group(1) or m.group(4)).title(); year = m.group(2) or m.group(3)
            if season == "Autumn": season = "Fall"
            v = f"{season} {year}"
            if v not in found and year in TERM_YEARS: found.append(v)
        if found: break
    return found[:3]

def clean_loc(l):
    l = s(l)
    l = re.sub(r"\s*\d{5}(-\d{4})?\s*$", "", l).strip()
    return l or "South Florida"

def pay_for(sal, desc):
    sal = s(sal)
    if sal: return sal.replace(" an hour","/hr").replace(" a year","/yr").replace(" a month","/mo").replace(" a week","/wk")
    d = desc[:4000]
    m = re.search(r"\$\s?\d{2}(?:\.\d\d)?\s*(?:-|–|to)\s*\$?\s?\d{2}(?:\.\d\d)?\s*(?:/|per)\s*(?:hour|hr)", d, re.I)
    if m: return m.group(0).replace("per hour","/hr").replace("per hr","/hr").replace(" ","")
    m = re.search(r"\$\s?\d{2}(?:\.\d\d)?\s*(?:/|per)\s*(?:hour|hr)", d, re.I)
    if m: return m.group(0).replace("per hour","/hr").replace("per hr","/hr").replace(" ","")
    if re.search(r"\bpaid internship|\bpaid,|\bpaid\b.{0,20}\bintern|hourly (rate|wage|pay)|stipend|academic credit", d, re.I):
        if re.search(r"unpaid", d, re.I): return "Unpaid / credit"
        return "Paid"
    if re.search(r"\bunpaid\b", d, re.I): return "Unpaid"
    if re.search(r"commission", d, re.I): return "Commission"
    return ""

def level_for(title, desc):
    t = title + " " + desc[:3000]
    if re.search(r"law school|\b2L\b|\bJ\.?D\.? candidate|law student", t, re.I): return "Law school"
    if re.search(r"pharm\.?d|doctor of pharmacy|pharmacy (pre-grad )?intern", title + " " + desc[:1500], re.I): return "Pharmacy (PharmD)"
    if re.search(r"registered mental health|registered clinical|RMHCI|LMHC|\bLPC\b|\bMSW\b|school psychologist|counselor intern|therapist intern|Master'?s? Summer Internship|graduate-level|graduate students? only|doctoral|Ph\.?D|supervised clinical|veterinarian", title + " " + desc[:800], re.I): return "Graduate"
    if re.search(r"high school student", t, re.I) and not re.search(r"high school diploma", t, re.I): return "High school"
    return "Undergraduate"

def flag_for(title, desc, pay=""):
    d = title + " " + desc[:5000]
    strong = re.search(r"door[- ]to[- ]door|\b1099\b|no base|commission[- ]only|100% commission|uncapped|make \$", d, re.I)
    if strong or (re.search(r"commission", d, re.I) and not re.search(r"/hr", pay or "")): return "Commission-based"
    if re.search(r"for current|returning intern|previous hntb interns", title, re.I): return "Returning interns only"
    return ""

# Well-known municipalities. These are also stripped from titles, so keep them to names that
# would not plausibly be an ordinary word in a job title.
COUNTY = {
 "Miami-Dade": ["miami","hialeah","coral gables","doral","miami lakes","miami beach","miami gardens","aventura","homestead","north miami","kendall","palmetto bay","cutler bay","opa-locka","medley","key biscayne","sunny isles","pinecrest","south miami","north miami beach","bal harbour","florida city","miami springs","hialeah gardens","sweetwater","miami shores","surfside","west miami"],
 "Broward": ["fort lauderdale","deerfield beach","sunrise","miramar","pompano beach","plantation","hollywood","margate","coral springs","davie","tamarac","weston","hallandale beach","dania beach","cooper city","wilton manors","coconut creek","pembroke pines","lauderhill","oakland park","lighthouse point","parkland","southwest ranches","lauderdale lakes","north lauderdale","pembroke park","lauderdale-by-the-sea"],
 "Palm Beach": ["boca raton","delray beach","west palm beach","boynton beach","jupiter","palm beach gardens","wellington","lake worth","royal palm beach","palm beach","riviera beach","greenacres","north palm beach","juno beach","tequesta"],
}
# Smaller places and unincorporated areas Indeed uses as a location. Only used for the county lookup.
COUNTY_EXTRA = {
 "Miami-Dade": ["gladeview","west little river","westchester","fontainebleau","tamiami","kendale lakes","the hammocks","country walk","richmond west","goulds","princeton","naranja","leisure city","brownsville","golden glades","ives estates","ojus","biscayne park","el portal","virginia gardens","olympia heights","coral terrace","glenvar heights","kendall west","three lakes","south miami heights","west perrine","palmetto estates","the crossings","north bay village","bay harbor islands","indian creek","university park","westwood lakes","sunny isles beach","pinewood","fountainebleau","country club","sunset","miami-dade county","miami-dade"],
 "Broward": ["west park","lazy lake","sea ranch lakes","hillsboro beach","dania","lauderdale by the sea","ft lauderdale","ft. lauderdale","roosevelt gardens","franklin park","washington park","boulevard gardens","broadview park","sunshine ranches","broward county","broward"],
 "Palm Beach": ["lake worth beach","palm springs","lantana","hypoluxo","manalapan","ocean ridge","gulf stream","highland beach","haverhill","loxahatchee","pahokee","belle glade","south bay","lake park","mangonia park","palm beach shores","jupiter inlet colony","atlantis","briny breezes","cloud lake","glen ridge","westlake","palm beach county"],
}
COUNTY_LOOKUP = {city: county for src in (COUNTY, COUNTY_EXTRA) for county, cities in src.items() for city in cities}
def county_for(loc):
    l = re.sub(r",?\s*(fl|florida)\.?$", "", loc.lower().strip()).strip()
    if l in COUNTY_LOOKUP: return COUNTY_LOOKUP[l]
    if "remote" in l: return "Remote"
    if "florida" in l or l in ("fl","south florida"): return "South Florida"
    return "Other Florida"

def norm_company(c):
    c = re.sub(r"\s+-\s+[A-Za-z .]+$", "", c)   # "D1 Training - Coral Springs"
    c = re.sub(r"[.,]", "", c).lower().strip()
    return c
CITIES = sorted({c for v in COUNTY.values() for c in v} | {"orlando","ft lauderdale","ft. lauderdale","downtown miami","pompano","fort lauderdale","florida","miami-fort lauderdale region"}, key=len, reverse=True)
def norm_title(t):
    t = t.lower().replace("internship","intern")
    for c in CITIES: t = re.sub(r"\b"+re.escape(c)+r"\b", " ", t)
    t = re.sub(r"\b(fl|wm)\b", " ", t)
    t = re.sub(r"[^a-z0-9]+", " ", t).strip()
    return t

def work_mode(loc, desc):
    d = desc[:2500] + " " + s(loc)
    if re.search(r"\bremote\b", d, re.I) and re.search(r"\bhybrid\b", d, re.I): return "Hybrid / Remote"
    if re.search(r"\bhybrid\b", d, re.I): return "Hybrid"
    if re.search(r"fully remote|\(remote\)|remote position|remote intern|work remotely|100% remote", d, re.I): return "Remote"
    return ""

BOILER = r"equal opportunity|EEO|E-Verify|drug[- ]free|background check|third[- ]party agenc|unsolicited resume|benefits? (package|information)|401\(k\)|medical, dental"
SKIP = BOILER + r"|salary range|pay at any point|compensation|pay range|about (us|the company)|is (a|an|the) (leading|global|nation)|we are (a|an|the) (leading|premier|largest)|founded in|headquartered"
def snippet_for(desc):
    lines = [l.strip() for l in desc.split("\n")]
    paras = []
    i = 0
    while i < len(lines):
        p = lines[i]
        if not p: i += 1; continue
        # if a lead-in ends with ":", stitch the following short lines as a clause
        if p.endswith(":") and len(p) > 40:
            tail = []
            j = i + 1
            while j < len(lines) and lines[j] and len(tail) < 3:
                tail.append(lines[j].strip(" •-\t").rstrip(".;")); j += 1
            if tail: p = p[:-1] + ": " + "; ".join(tail) + "."
            i = j
        else:
            i += 1
        if len(p) > 70: paras.append(p)
    pick = None
    for p in paras:
        if re.search(r"\bintern|you will|you'll|responsib|seeking|looking for|opportunity|work (with|alongside)|assist", p, re.I) and not re.search(SKIP, p, re.I) and len(p) > 100:
            pick = p; break
    if not pick:
        for p in paras:
            if not re.search(SKIP, p, re.I): pick = p; break
    if not pick: pick = paras[0] if paras else desc[:240]
    pick = re.sub(r"\s+", " ", pick).strip()
    if len(pick) > 240:
        cut = pick[:240].rsplit(" ", 1)[0]
        pick = cut.rstrip(",;:") + "…"
    return pick

def details_for(desc):
    # grab requirement-ish lines
    lines = [l.strip(" •-\t") for l in desc.split("\n")]
    out = []; grab = False
    for l in lines:
        if re.search(r"^(minimum )?(requirements?|qualifications?|what you.?ll need|what we.?re looking for|who we.?re looking for|what you bring|skills|education|basic qualifications|preferred)", l, re.I) and len(l) < 60:
            grab = True; continue
        if grab:
            if not l:
                if out: break
                continue
            if re.search(BOILER, l, re.I): continue
            if 15 < len(l) < 160: out.append(re.sub(r"\s+"," ",l))
            if len(out) >= 4: break
    return out

CITY_RE = "|".join(re.escape(c) for c in CITIES if c not in ("florida",))
def display_title(t):
    t = re.sub(r"\*+", "", s(t))
    # trailing "- City, FL" / "(City, FL)" / "| City, FL" / "City CLC"
    t = re.sub(r"(?i)\s*[-–|,(]?\s*\b(" + CITY_RE + r")\b(,?\s*FL)?\s*\)?(\s*CLC)?\s*$", "", t)
    # inline "- City, FL -" or "| City, FL |"
    t = re.sub(r"(?i)\s*[-–|]\s*\b(" + CITY_RE + r")\b,?\s*FL\s*([-–|])", r" \2", t)
    # trailing bare state: "... (Summer 2027) FL", "... | Florida", "... - South FL"
    t = re.sub(r"(?i)\s*[-–|,]?\s*\b(south\s+)?(FL|Florida)\b\s*$", "", t)
    t = re.sub(r"\s*\(\s*\)", "", t)
    t = re.sub(r"\s*[-–|,]\s*$", "", t)
    t = re.sub(r"\s{2,}", " ", t).strip(" -–|,")
    while t.endswith(")") and t.count(")") > t.count("("): t = t[:-1].rstrip()
    return t or "Intern"

# ---------- helpers ----------
def s(v):
    """Coerce a spreadsheet cell to a stripped string ('' for None)."""
    if v is None: return ""
    if isinstance(v, float) and v.is_integer(): v = int(v)
    return str(v).strip()

UPGRADED_HTTP = collections.Counter()
def url_or_blank(v, upgrade=True):
    """Keep only http(s) URLs, and prefer the encrypted form.

    A plain-HTTP apply link can be tampered with in transit on shared wi-fi, which is
    exactly the network a student is on. Nearly every employer and ATS serves HTTPS, so
    the upgrade is safe; --keep-http turns it off if a destination ever breaks.
    """
    v = s(v)
    if not re.match(r"^https?://", v, re.I): return ""
    if upgrade and v.lower().startswith("http://"):
        UPGRADED_HTTP[re.sub(r"^http://([^/]+).*", r"\1", v, flags=re.I)] += 1
        v = "https://" + v[len("http://"):]
    return v

def date_str(v):
    if isinstance(v, (dt.date, dt.datetime)): return v.strftime("%Y-%m-%d")
    v = s(v)[:10]
    return v if re.match(r"^\d{4}-\d{2}-\d{2}$", v) else ""

REQUIRED = ["company", "positionName", "location", "postingDateParsed", "externalApplyLink", "salary", "description", "url", "id"]

def read_rows(path):
    try:
        from openpyxl import load_workbook
    except ImportError:
        sys.exit("openpyxl is required to read spreadsheets: pip install openpyxl")
    wb = load_workbook(path, read_only=True, data_only=True)
    rows = wb.active.iter_rows(values_only=True)
    try:
        hdr = [s(h) for h in next(rows)]
    except StopIteration:
        sys.exit(f"{path}: spreadsheet is empty")
    missing = [c for c in REQUIRED if c not in hdr]
    if missing: sys.exit(f"{path}: missing columns: {', '.join(missing)}")
    data = []
    for r in rows:
        if not any(s(v) for v in r): continue
        data.append(dict(zip(hdr, r)))
    return data

def build_items(data, upgrade=True):
    items, seen, skipped = [], set(), 0
    for d in data:
        title = s(d.get('positionName')); company = s(d.get('company')); desc = s(d.get('description'))
        if not title and not company: skipped += 1; continue
        pid = s(d.get('id')) or s(d.get('url'))
        if pid in seen: skipped += 1; continue
        seen.add(pid)
        indeed = url_or_blank(d.get('url'), upgrade)
        loc = clean_loc(d.get('location'))
        pay = pay_for(d.get('salary'), desc)
        types = []
        for k in ('jobType', 'jobType/0', 'jobType/1', 'jobType/2', 'jobType/3'):
            v = s(d.get(k))
            if v and v not in types: types.append(v)
        items.append(dict(
            id=pid, company=company, title=title or "Intern", loc=loc,
            cat=classify(title, desc, company), majors=majors_for(desc, title), term=term_for(title, desc),
            pay=pay, level=level_for(title, desc), mode=work_mode(d.get('location'), desc),
            types=types, posted=date_str(d.get('postingDateParsed')),
            apply=url_or_blank(d.get('externalApplyLink'), upgrade) or indeed, indeed=indeed,
            snippet=snippet_for(desc), details=details_for(desc), flag=flag_for(title, desc, pay), county=county_for(loc),
        ))
    return items, skipped

def group_items(items):
    """Merge rows that are the same company + title into one card with several locations."""
    groups = collections.OrderedDict()
    for it in items:
        key = (norm_company(it['company']), norm_title(it['title']))
        g = groups.get(key)
        if not g:
            g = dict(it); g['locs'] = [dict(loc=it['loc'], apply=it['apply'], county=it['county'])]; g['count'] = 1; g['counties'] = [it['county']]
            groups[key] = g
        else:
            g['count'] += 1
            if it['loc'] not in [x['loc'] for x in g['locs']]:
                g['locs'].append(dict(loc=it['loc'], apply=it['apply'], county=it['county']))
            if it['county'] not in g['counties']: g['counties'].append(it['county'])
            if not g['flag'] and it['flag']: g['flag'] = it['flag']
            if it['posted'] > g['posted']: g['posted'] = it['posted']
            if not g['pay'] and it['pay']: g['pay'] = it['pay']
            if not g['indeed'] and it['indeed']: g['indeed'] = it['indeed']
            for m in it['majors']:
                if m not in g['majors']: g['majors'].append(m)
            for t in it['term']:
                if t not in g['term']: g['term'].append(t)
    out = []
    for g in groups.values():
        for k in ('loc', 'apply', 'county'): g.pop(k, None)
        out.append(g)
    return out

def finalize(out, upgrade=True):
    """Idempotent clean-up applied to both fresh and re-loaded data."""
    for g in out:
        g['title'] = display_title(g.get('title'))
        g['indeed'] = url_or_blank(g.get('indeed'), upgrade)
        locs = []
        for l in g.get('locs') or []:
            loc = clean_loc(l.get('loc'))
            locs.append(dict(loc=loc, apply=url_or_blank(l.get('apply'), upgrade) or g['indeed'], county=county_for(loc)))
        g['locs'] = locs
        g['counties'] = list(dict.fromkeys(l['county'] for l in locs))
        g['count'] = max(int(g.get('count') or 1), len(locs))
        for k in ('majors', 'term', 'types', 'details'):
            g[k] = [x for x in (g.get(k) or []) if x]
        for k in ('pay', 'level', 'mode', 'flag', 'snippet', 'company', 'cat'):
            g[k] = s(g.get(k))
        g['posted'] = date_str(g.get('posted'))
    out.sort(key=lambda x: (x['company'].lower(), x['title'].lower()))
    out.sort(key=lambda x: x['posted'], reverse=True)   # stable: newest first, then employer A-Z
    return out

def drop_expired(out):
    """Strip terms that have already ended, and drop a card whose only term has ended.

    A card that never named a term is left alone: it makes no claim about a cycle.
    """
    kept, expired = [], []
    for g in out:
        live = [t for t in g.get('term') or [] if not term_is_past(t)]
        past = [t for t in g.get('term') or [] if term_is_past(t)]
        if past and not live:
            expired.append(g); continue
        g['term'] = live
        kept.append(g)
    return kept, expired

# Descriptions are written by whoever posted the job, and they land in this repo where
# coding agents read them. None of it reaches an LLM at runtime, so this is an early
# warning for the humans and agents who work on the repo, not a runtime defence.
SUSPECT = re.compile(
    r"ignore (all |any )?(previous|prior|above)\b|disregard (the |all )?(above|previous)|"
    r"\bsystem prompt\b|you are now (a|an|in)\b|new instructions?:|</?system>|\[\[?INST\]?\]|"
    r"^\s*(assistant|system)\s*:|\bexfiltrat|\bapi[ _-]?key\b|\bbase64\s+-d\b|"
    r"\beval\(|\bprocess\.env\b|curl\s+https?://", re.I | re.M)
SCAN_FIELDS = ("company", "title", "snippet", "details", "majors", "term", "pay", "flag", "level")

def scan_injection(cards):
    """Flag listing text shaped like an instruction aimed at an AI agent."""
    hits = []
    for g in cards:
        for f in SCAN_FIELDS:
            v = g.get(f)
            for text in (v if isinstance(v, list) else [v]):
                m = SUSPECT.search(s(text))
                if m: hits.append((g.get("company", ""), g.get("title", ""), f, m.group(0).strip()))
    return hits

def json_for_html(out):
    """JSON that is safe to inline inside a <script type="application/json"> block."""
    return json.dumps(out, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")

def sha256_b64(text):
    return "sha256-" + base64.b64encode(hashlib.sha256(text.encode("utf-8")).digest()).decode()

def security_headers(html):
    """Build a Content-Security-Policy that fits this exact page.

    Both the app script and the stylesheet are inline, so they are allowed by hash
    rather than by 'unsafe-inline'. That means an injected script cannot run even if
    escaping somewhere is wrong. The hashes cover the exact bytes of the rendered page,
    so index.html and vercel.json must be regenerated together; hand-editing index.html
    will stop its script from running.
    """
    scripts = re.findall(r"<script(?![^>]*\btype=)[^>]*>(.*?)</script>", html, re.S)
    styles = re.findall(r"<style[^>]*>(.*?)</style>", html, re.S)
    if not scripts: sys.exit("no inline script found: refusing to write a policy that would break the page")
    csp = "; ".join([
        "default-src 'none'",
        "script-src " + " ".join(f"'{sha256_b64(x)}'" for x in scripts) + " 'self'",
        "style-src " + " ".join(f"'{sha256_b64(x)}'" for x in styles) + " https://fonts.googleapis.com",
        "font-src https://fonts.gstatic.com",
        "img-src 'self' data:",
        # Vercel Analytics posts page views to a same-origin /_vercel/insights/* path, so
        # 'self' is what actually matters here; the vitals host covers Speed Insights.
        "connect-src 'self' https://vitals.vercel-insights.com",
        "form-action 'none'",
        "frame-ancestors 'none'",
        "base-uri 'none'",
        "object-src 'none'",
    ])
    return {"headers": [{"source": "/(.*)", "headers": [
        {"key": "Content-Security-Policy", "value": csp},
        {"key": "X-Content-Type-Options", "value": "nosniff"},
        {"key": "Referrer-Policy", "value": "strict-origin-when-cross-origin"},
        {"key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), payment=(), usb=()"},
        {"key": "X-Frame-Options", "value": "DENY"},
        {"key": "Strict-Transport-Security", "value": "max-age=31536000; includeSubDomains"},
    ]}]}

def render_html(template_path, out, date_label):
    tpl = open(template_path, encoding='utf-8').read()
    for tok in ('__DATA__', '__DATE__'):
        if tpl.count(tok) != 1: sys.exit(f"{template_path}: expected exactly one {tok} placeholder")
    return tpl.replace('__DATA__', json_for_html(out)).replace('__DATE__', date_label)

def print_stats(out, items):
    print(collections.Counter(x['cat'] for x in out).most_common())
    print(collections.Counter(x['level'] for x in out))
    print(collections.Counter(x['mode'] for x in out))
    print("pay listed", collections.Counter(bool(x['pay']) for x in out))
    print("flags", collections.Counter(x['flag'] for x in out))
    print("counties", collections.Counter(c for x in out for c in x['counties']))
    print("no majors", sum(1 for x in out if not x['majors']))
    print(collections.Counter(tuple(x['term']) for x in out).most_common(12))
    print(collections.Counter(m for x in out for m in x['majors']).most_common(50))

def main(argv=None):
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("xlsx", nargs="?", help="spreadsheet export of the listings")
    ap.add_argument("--data", help="skip the spreadsheet and re-render from this data.json")
    ap.add_argument("--json", default=os.path.join(here, "data.json"), help="where to write data.json (default: next to this script)")
    ap.add_argument("--template", default=os.path.join(here, "template.html"))
    ap.add_argument("--out", default=os.path.join(here, "index.html"), help="rendered page (default: index.html next to this script); '-' to skip")
    ap.add_argument("--date", default=f"{TODAY:%b} {TODAY.day}, {TODAY.year}", help="'updated' label, e.g. 'Sep 10, 2026'")
    ap.add_argument("--max-age", type=int, default=180, metavar="DAYS",
                    help="drop postings older than DAYS (default 180; use 0 to keep everything). "
                         "A dead apply link costs more trust than a missing listing earns.")
    ap.add_argument("--keep-http", action="store_true", help="leave plain-HTTP apply links alone instead of upgrading them to HTTPS")
    ap.add_argument("--strict", action="store_true", help="exit non-zero if a listing contains text shaped like an AI instruction")
    ap.add_argument("--headers", default=None, help="where to write vercel.json with the CSP and security headers ('-' to skip)")
    ap.add_argument("--stats", action="store_true", help="print classification counters")
    ap.add_argument("--check", action="store_true", help="also write check.txt, one line per card, for eyeballing categories")
    a = ap.parse_args(argv)
    if not a.xlsx and not a.data: ap.error("give a spreadsheet path or --data data.json")

    if a.data:
        out = json.load(open(a.data, encoding='utf-8'))
        if not isinstance(out, list): sys.exit(f"{a.data}: expected a JSON list")
        items, skipped = out, 0
        print(f"loaded {len(out)} cards from {a.data}")
    else:
        data = read_rows(a.xlsx)
        items, skipped = build_items(data, upgrade=not a.keep_http)
        if a.max_age:
            cutoff = (TODAY - dt.timedelta(days=a.max_age)).strftime("%Y-%m-%d")
            stale = [it for it in items if it['posted'] and it['posted'] < cutoff]
            items = [it for it in items if not (it['posted'] and it['posted'] < cutoff)]
            print(f"dropped {len(stale)} postings older than {cutoff}" + (": " + "; ".join(f"{it['company']} / {it['title'][:40]} ({it['posted']})" for it in stale[:8]) + (" ..." if len(stale) > 8 else "") if stale else ""))
        out = group_items(items)
        print(f"read {len(data)} rows, skipped {skipped} (blank or duplicate id), grouped {len(items)} postings into {len(out)} cards")
    out = finalize(out, upgrade=not a.keep_http)
    if UPGRADED_HTTP:
        print(f"upgraded {sum(UPGRADED_HTTP.values())} plain-HTTP link(s) to HTTPS across "
              + ", ".join(f"{d} x{n}" for d, n in UPGRADED_HTTP.most_common(6))
              + (" ..." if len(UPGRADED_HTTP) > 6 else "")
              + " (spot-check any unfamiliar domain, or rerun with --keep-http)")
    out, expired = drop_expired(out)
    if expired:
        print(f"dropped {len(expired)} card(s) whose only term has already ended: "
              + "; ".join(f"{g['company']} / {g['title'][:40]} ({', '.join(g['term'])})" for g in expired[:8])
              + (" ..." if len(expired) > 8 else ""))
    hits = scan_injection(out)
    if hits:
        print(f"WARNING: {len(hits)} listing field(s) contain text shaped like an AI instruction:")
        for company, title, field, frag in hits[:10]:
            print(f"  {company} / {title[:40]} [{field}]: {frag[:70]!r}")
        print("  These do not affect the site, which runs no model. Review before committing,")
        print("  because coding agents read this repo.")
        if a.strict:
            sys.exit(f"--strict: refusing to write anything while {len(hits)} field(s) look suspicious")
    else:
        print(f"injection scan: clean across {len(out)} listings")

    if a.stats: print_stats(out, items)

    if not a.data or os.path.abspath(a.data) != os.path.abspath(a.json):
        with open(a.json, 'w', encoding='utf-8') as f: json.dump(out, f, ensure_ascii=False)
        print(f"wrote {a.json} ({os.path.getsize(a.json):,} bytes)")
    if a.check:
        with open(os.path.join(os.path.dirname(os.path.abspath(a.json)), 'check.txt'), 'w', encoding='utf-8') as f:
            for x in sorted(out, key=lambda x: x['cat']):
                f.write(f"{x['cat'][:30]:30} | {x['company'][:22]:22} | {x['title'][:55]:55} | {x['level'][:8]:8} | {x['pay'][:14]:14} | {x['flag'][:10]:10} | {x['count']} | {','.join(x['majors'])[:60]}\n")
    if a.out != '-':
        html = render_html(a.template, out, a.date)
        with open(a.out, 'w', encoding='utf-8') as f: f.write(html)
        print(f"wrote {a.out} ({len(html):,} chars, updated {a.date})")
        headers_path = a.headers or os.path.join(os.path.dirname(os.path.abspath(a.out)), 'vercel.json')
        if headers_path != '-':
            with open(headers_path, 'w', encoding='utf-8') as f:
                json.dump(security_headers(html), f, indent=2); f.write("\n")
            print(f"wrote {headers_path} (CSP pinned to this build's inline script and style)")


if __name__ == "__main__":
    main()
