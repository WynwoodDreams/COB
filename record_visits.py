#!/usr/bin/env python3
"""Record the site's visits from Vercel Web Analytics into visits.json.

Vercel keeps a month of analytics on the free plan. This script asks the Web Analytics
API for the last few weeks of page views, one row per day and page, and merges them into
visits.json, so the record never expires. The insights page draws "Visits by month" from
it. The weekly GitHub Action (.github/workflows/visits.yml) runs it and commits the result;
it can also be run by hand:

    VERCEL_TOKEN=... python3 record_visits.py

Days already in the file are overwritten by the fresh figures for the same day, because
Vercel's count for a recent day can still grow for a while. Nothing is ever deleted.
"""
import datetime as dt, json, os, re, sys, urllib.error, urllib.parse, urllib.request

API = "https://api.vercel.com/v1/query/web-analytics/visits/aggregate"
PROJECT = os.environ.get("VERCEL_PROJECT_ID", "prj_7ZAiM8vcVzzkFa2bIgtBfvnl7Q8y")   # the cob project
TEAM = os.environ.get("VERCEL_TEAM_ID", "team_g6NkapUNAEH5U9sagjaSsRfz")           # Christian's projects
DAYS = int(os.environ.get("VISITS_DAYS", "28"))
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get("VISITS_FILE", os.path.join(HERE, "visits.json"))

# Which page a request path counts as. Anything else (a PDF, a stray path) is "other".
def page_of(path):
    p = (path or "").split("?")[0].rstrip("/") or "/"
    if p in ("/", "/index.html"): return "board"
    if p in ("/insights", "/insights.html"): return "insights"
    return "other"

def fetch(token, since, until):
    q = urllib.parse.urlencode({
        "projectId": PROJECT, "teamId": TEAM, "by": "day,requestPath", "limit": 100,
        "since": since.strftime("%Y-%m-%dT00:00:00.000Z"), "until": until.strftime("%Y-%m-%dT23:59:59.999Z"),
    }, safe=",")
    req = urllib.request.Request(API + "?" + q, headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return json.load(r)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:600]
        if e.code == 404 and "Web Analytics" in body:
            sys.exit("Vercel says Web Analytics is not enabled for this project. Turn it on: Vercel dashboard > cob > Analytics > Enable. Nothing recorded.")
        if e.code in (401, 403):
            sys.exit(f"Vercel refused the token ({e.code}). Check the VERCEL_TOKEN secret: it must be a token for the team that owns the project. Response: {body}")
        sys.exit(f"Vercel API error {e.code}: {body}")

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}")

def rows_of(payload):
    """The response is a list of rows under `data`, each with the day, the path and the
    counts. The field names are not pinned down in the docs, so look for them by shape."""
    data = payload.get("data") if isinstance(payload, dict) else payload
    if isinstance(data, dict): data = data.get("rows") or data.get("data") or data.get("results") or []
    if not isinstance(data, list): sys.exit(f"Unexpected response shape: {json.dumps(payload)[:400]}")
    out = []
    for row in data:
        if not isinstance(row, dict): continue
        day = next((str(v)[:10] for k, v in row.items() if k != "requestPath" and isinstance(v, str) and DATE_RE.match(v)), None)
        if not day:
            ts = next((v for k, v in row.items() if k in ("timestamp", "time", "ts") and isinstance(v, (int, float))), None)
            if ts is not None: day = dt.datetime.utcfromtimestamp(ts / (1000 if ts > 1e11 else 1)).strftime("%Y-%m-%d")
        if not day: continue
        views = row.get("pageviews", row.get("pageViews", row.get("views", row.get("total", 0)))) or 0
        visitors = row.get("visitors", row.get("uniques", 0)) or 0
        out.append((day, page_of(row.get("requestPath") or row.get("path") or row.get("route")), int(views), int(visitors)))
    return out

def main():
    token = os.environ.get("VERCEL_TOKEN")
    if not token: sys.exit("Set VERCEL_TOKEN (a Vercel access token for the team that owns the project).")
    today = dt.datetime.now(dt.timezone.utc).date()
    since, until = today - dt.timedelta(days=DAYS), today
    payload = fetch(token, since, until)
    rows = rows_of(payload)
    if not rows:
        print("Vercel returned no rows for the period; first row of the raw response, for the log:", json.dumps(payload)[:400])
    visits = {}
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as f: visits = json.load(f)
    days = visits.setdefault("days", {})
    fresh = {}
    for day, page, views, visitors in rows:
        d = fresh.setdefault(day, {"board": 0, "insights": 0, "other": 0, "visitors": 0})
        d[page] += views
        d["visitors"] += visitors   # visitors per path, summed: a ceiling on the day's visitors, not a count of people
    for day, d in fresh.items(): days[day] = d
    visits["source"] = "Vercel Web Analytics, production only, page views by day"
    visits["updated"] = today.isoformat()
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"source": visits["source"], "updated": visits["updated"], "days": dict(sorted(days.items()))}, f, indent=0, ensure_ascii=False); f.write("\n")
    week = [d for d in sorted(fresh) if d > (today - dt.timedelta(days=7)).isoformat()]
    wk = {k: sum(fresh[d][k] for d in week) for k in ("board", "insights", "other")}
    print(f"recorded {len(fresh)} day(s) from {min(fresh) if fresh else '-'} to {max(fresh) if fresh else '-'} into {OUT} ({len(days)} days on file)")
    print(f"last 7 days: board {wk['board']} views, insights {wk['insights']} views, other {wk['other']}")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(f"## Visits, last 7 days\n\n| Page | Views |\n|---|---:|\n| Board | {wk['board']} |\n| Insights | {wk['insights']} |\n| Other | {wk['other']} |\n\n{len(days)} days on file in `visits.json`.\n")

if __name__ == "__main__":
    main()
