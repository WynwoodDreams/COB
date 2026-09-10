import re, json, collections, html
from openpyxl import load_workbook
wb = load_workbook('/mnt/user-data/uploads/50.xlsx', read_only=True)
rows = list(wb.active.iter_rows(values_only=True))
hdr = rows[0]; data = [dict(zip(hdr, r)) for r in rows[1:]]

# ---------- category rules: (category, [title keywords], [desc keywords]) in priority order ----------
CATS = [
 ("Health Sciences & Pharmacy", r"pharmac|nurse|nursing|respiratory|medical assistant|\bMA/|chiropract|veterinar|patient care", r""),
 ("Mental Health & Social Work", r"mental health|counsel|therapist|therapy|psycholog|social work|\bBSW\b|\bMSW\b|RMHCI|LMHC|behavioral health|clinical intern", r""),
 ("Legal", r"\blaw\b|legal|law clerk|bankruptcy|attorney|paralegal|\b2L\b", r""),
 ("Accounting, Tax & Audit", r"\btax\b|audit|assurance|accounting|accountant|forensic|attest|risk advisory|technology risk|accounting methods", r""),
 ("Finance, Banking & Insurance", r"financ|wealth|banking|capital markets|private equity|asset management|quant|trading|actuarial|multinational|lending|commercial banking|insurance|state farm agent|FRP internship|client advisory|transaction", r""),
 ("Human Resources & Talent", r"human resources|\bHR\b|talent acquisition|people & culture|recruit", r""),
 ("Civil, Structural & Environmental Engineering", r"civil|structural engineer|geotechnical|water|wastewater|transportation engineering|surveying|environmental engineering|\bCEI\b|\bDOT\b|traffic|intern engineer|engineering & estimating|engineering intern \| fort|planning intern", r""),
 ("Software, IT, Data & AI", r"software|developer|programmer|\bIT\b|information technology|\bdata\b|analytics|\bAI\b|machine learning|cyber|digital product|android|web develop|it infrastructure|systems engineering|app / game", r""),
 ("Architecture, Construction & Design", r"architect|construction|\bBIM\b|interior design|estimating|building automation|fire & life safety|^project intern", r""),
 ("Mechanical, Electrical & Manufacturing Engineering", r"mechanical|electrical|electronics|\bRF\b|analog|radio|industrial engineering|manufacturing|process engineer|materials|packaging|biomedical|design engineering|engineering intern|engineering internship|engineer, intern|test technician|CAD design|advanced operations|aviation safety|technical sales", r""),
 ("Science, Sustainability & Environment", r"chemist|R&D|environmental|sustainab|scientist|research|\blab\b|QEHS|horticult|landscape", r""),
 ("Marketing, Communications & PR", r"marketing|social media|communication|\bPR\b|public relations|brand|content creator|influencer|campus ambassador|community management|client solutions|e-retail|business communications", r""),
 ("Creative: Media, Design & Production", r"graphic design|video|photograph|content studio|control room|film|television|studio engineer|music|creative|design intern", r""),
 ("Hospitality, Events, Sports & Entertainment", r"hospitality|F&B|culinary|hotel|\bclub\b|golf|event|sports|game ops|MIA Academy|strength and conditioning|premium client|sodexo|yotel|academic support|athletic", r""),
 ("Sales & Business Development", r"\bsales\b|business development|door to door|financial representative", r""),
 ("Education, Nonprofit & Community", r"ministry|student services|cultivate|programs & partnerships|volunteer|community engagement|nonprofit|school", r""),
 ("Skilled Trades, Automotive & Aviation", r"mechanic|service technician|aircraft|HVAC|maintenance|trainee.*technician", r""),
 ("Business, Management & Operations", r"management|business|operations|supply chain|purchasing|consult|administrative|administration|store executive|leasing|customer service|client|coordinator|program development|provider operations|internship program|^intern$|intern / co-op|summer internship program", r""),
]
GENERIC = r"^(intern|internship|intern / co-op|summer internship program.*|internship program.*|.*summer 20\d\d internship)$"
def classify(title, desc, company=''):
    t = title
    if re.search(GENERIC, t.strip(), re.I):
        for cat, k in [("Architecture, Construction & Design", r"construction|contracting|builders"),("Science, Sustainability & Environment", r"landscape"),("Accounting, Tax & Audit", r"advisory|\bCPA")]:
            if re.search(k, company, re.I): return cat
        if re.search(r"construction", desc[:600], re.I): return "Architecture, Construction & Design"
    for cat, tk, dk in CATS:
        if tk and re.search(tk, t, re.I): return cat
    comp_rules = [
     ("Architecture, Construction & Design", r"construction|contracting|builders|architecture"),
     ("Legal", r"\blaw\b|legal"),
     ("Science, Sustainability & Environment", r"landscape"),
     ("Accounting, Tax & Audit", r"advisory|\bCPA"),
     ("Civil, Structural & Environmental Engineering", r"engineering"),
    ]
    for cat, k in comp_rules:
        if re.search(k, company, re.I): return cat
    d = desc[:1500]
    # description fallback with a narrower set
    fallback = [
     ("Architecture, Construction & Design", r"construction management|general contractor"),
     ("Accounting, Tax & Audit", r"accounting|\btax\b|audit"),
     ("Software, IT, Data & AI", r"software|computer science|information technology|data analy"),
     ("Marketing, Communications & PR", r"marketing|social media"),
     ("Finance, Banking & Insurance", r"finance|financial"),
     ("Architecture, Construction & Design", r"construction|architect"),
     ("Mechanical, Electrical & Manufacturing Engineering", r"engineering"),
    ]
    for cat, k in fallback:
        if re.search(k, d, re.I): return cat
    return "Business, Management & Operations"

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

def term_for(title, desc):
    pats = r"(Summer|Fall|Spring|Winter|Autumn)\s*(20\d\d)|(20\d\d)\s*(Summer|Fall|Spring|Winter)"
    found = []
    for src in (title, desc[:2500]):
        for m in re.finditer(pats, src, re.I):
            season = (m.group(1) or m.group(4)).title(); year = m.group(2) or m.group(3)
            if season == "Autumn": season = "Fall"
            v = f"{season} {year}"
            if v not in found and year in ("2026","2027","2028"): found.append(v)
        if found: break
    return found[:3]

def clean_loc(l):
    l = l or ""
    l = re.sub(r"\s*\d{5}(-\d{4})?\s*$", "", l).strip()
    return l or "South Florida"

def pay_for(sal, desc):
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

def flag_for(title, desc, sal=""):
    d = title + " " + desc[:5000]
    strong = re.search(r"door[- ]to[- ]door|\b1099\b|no base|commission[- ]only|100% commission|uncapped|make \$", d, re.I)
    if strong or (re.search(r"commission", d, re.I) and not re.search(r"/hr", sal or "")): return "Commission-based"
    if re.search(r"for current|returning intern|previous hntb interns", title, re.I): return "Returning interns only"
    return ""
COUNTY = {
 "Miami-Dade": ["miami","hialeah","coral gables","doral","miami lakes","miami beach","miami gardens","aventura","homestead","north miami","kendall","palmetto bay","cutler bay","opa-locka","medley","key biscayne","sunny isles","pinecrest","south miami","north miami beach","bal harbour","florida city","miami springs","hialeah gardens","sweetwater","miami shores","surfside","west miami"],
 "Broward": ["fort lauderdale","deerfield beach","sunrise","miramar","pompano beach","plantation","hollywood","margate","coral springs","davie","tamarac","weston","hallandale beach","dania beach","cooper city","wilton manors","coconut creek","pembroke pines","lauderhill","oakland park","lighthouse point","parkland","southwest ranches","lauderdale lakes","north lauderdale","pembroke park","lauderdale-by-the-sea"],
 "Palm Beach": ["boca raton","delray beach","west palm beach","boynton beach","jupiter","palm beach gardens","wellington","lake worth","royal palm beach","palm beach","riviera beach","greenacres","north palm beach","juno beach","tequesta"],
}
def county_for(loc):
    l = loc.lower().replace(", fl","").strip()
    for c, cities in COUNTY.items():
        if l in cities: return c
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
    d = desc[:2500] + " " + (loc or "")
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
    pick = re.sub(r"\s+", " ", pick)
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

items = []
for d in data:
    title = (d['positionName'] or "").strip()
    desc = d['description'] or ""
    company = (d['company'] or "").strip()
    items.append(dict(
        id=d['id'], company=company, title=title, loc=clean_loc(d['location']),
        cat=classify(title, desc, company), majors=majors_for(desc, title), term=term_for(title, desc),
        pay=pay_for(d['salary'], desc), level=level_for(title, desc), mode=work_mode(d['location'], desc),
        types=[d[k] for k in ['jobType/0','jobType/1','jobType/2','jobType/3'] if d[k]],
        posted=(d['postingDateParsed'] or "")[:10], apply=d['externalApplyLink'], indeed=d['url'],
        snippet=snippet_for(desc), details=details_for(desc), flag=flag_for(title, desc, pay_for(d['salary'], desc)), county=county_for(clean_loc(d['location'])),
    ))

# ---- group duplicates (same company + title) ----
groups = collections.OrderedDict()
for it in items:
    key = (norm_company(it['company']), norm_title(it['title']))
    g = groups.get(key)
    if not g:
        g = dict(it); g['locs'] = [dict(loc=it['loc'], apply=it['apply'], county=it['county'])]; g['count']=1; g['counties']=[it['county']]
        groups[key] = g
    else:
        g['count'] += 1
        if it['loc'] not in [x['loc'] for x in g['locs']]:
            g['locs'].append(dict(loc=it['loc'], apply=it['apply'], county=it['county']))
        if it['county'] not in g['counties']: g['counties'].append(it['county'])
        if not g['flag'] and it['flag']: g['flag'] = it['flag']
        if it['posted'] > g['posted']: g['posted'] = it['posted']
        if not g['pay'] and it['pay']: g['pay'] = it['pay']
        for m in it['majors']:
            if m not in g['majors']: g['majors'].append(m)
        for t in it['term']:
            if t not in g['term']: g['term'].append(t)
CITY_RE = "|".join(re.escape(c) for c in CITIES if c not in ("florida",))
def display_title(t):
    t = re.sub(r"\*+", "", t)
    # trailing "- City, FL" / "(City, FL)" / "| City, FL" / "City CLC"
    t = re.sub(r"(?i)\s*[-–|,(]?\s*\b(" + CITY_RE + r")\b(,?\s*FL)?\s*\)?(\s*CLC)?\s*$", "", t)
    # inline "- City, FL -" or "| City, FL |"
    t = re.sub(r"(?i)\s*[-–|]\s*\b(" + CITY_RE + r")\b,?\s*FL\s*([-–|])", r" \2", t)
    t = re.sub(r"\s*\(\s*\)", "", t)
    t = re.sub(r"\s*[-–|,]\s*$", "", t)
    t = re.sub(r"\s{2,}", " ", t).strip(" -–|,")
    return t or "Intern"
out = []
for g in groups.values():
    g.pop('loc'); g.pop('apply'); g.pop('county')
    g['title'] = display_title(g['title'])
    out.append(g)
out.sort(key=lambda x: x['posted'], reverse=True)

print("grouped", len(out), "from", len(items))
print(collections.Counter(x['cat'] for x in out).most_common())
print(collections.Counter(x['level'] for x in out))
print(collections.Counter(x['mode'] for x in out))
print(collections.Counter(bool(x['pay']) for x in out))
print("flags", collections.Counter(x['flag'] for x in out))
print("counties", collections.Counter(c for x in out for c in x['counties']))
print("no majors", sum(1 for x in out if not x['majors']))
print(collections.Counter(tuple(x['term']) for x in out).most_common(12))
mc = collections.Counter(m for x in out for m in x['majors'])
print(mc.most_common(50))
json.dump(out, open('data.json','w'), ensure_ascii=False)
import os; print(os.path.getsize('data.json'))
with open('check.txt','w') as f:
    for x in sorted(out, key=lambda x: x['cat']):
        f.write(f"{x['cat'][:30]:30} | {x['company'][:22]:22} | {x['title'][:55]:55} | {x['level'][:8]} | {x['pay'][:14]:14} | {x['flag'][:10]:10} | {x['count']} | {','.join(x['majors'])[:60]}\n")
