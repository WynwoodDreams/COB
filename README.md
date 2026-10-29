# Christian's Opportunity Board

Static site. `index.html` carries the page and the internship data inline; `og.png` is the
image that shows when someone shares the link. Those two files are the board. The insights
page and the opportunity assistant (a private preview, with one serverless function) sit
beside them; see their sections below.

Visitors filter by area, county, major, term and level, sort by date, pay or employer, and
apply straight to the employer. Filter state lives in the URL, so any view can be shared.

Listings show 20 to a page (`PAGE` in the template), with Prev, Next and page numbers under
the list: the first and last page, the current one and its neighbours, and an ellipsis for each
gap. On a phone only the current page sits between the first and last, so the row fits on one
line. The page number is kept in the address as `#page=N`, and any filter goes back to page 1.

## Deploy to Vercel

1. Create a new repo under WynwoodDreams (e.g. `opportunity-board`) and upload the contents of this folder through the GitHub web UI.
2. In Vercel: Add New Project, import the repo, leave Framework Preset as "Other", no build command, output directory blank. Deploy.

## Refresh the listings

1. Export a new spreadsheet with the same columns (company, positionName, location, postedAt, postingDateParsed, externalApplyLink, salary, description). `url`, `id` and `jobType/0-3` are optional: an export without `id` and `url` still builds, each row getting an id made from its apply link, but its cards have no "Original listing" link and no Full-time or Part-time chip.
2. From this folder run:

       python3 build_data.py path/to/listings.xlsx --merge index.html

   `--merge` adds the export to what is already on the board instead of replacing it.
   Without it the spreadsheet becomes the whole board, and every listing the new export
   happens to miss disappears — a scrape is capped at a few hundred rows, so that is
   easy to do by accident. Drop the flag only when you mean to start the board over.

   Either way the run writes `data.json` and a fresh `index.html` stamped with today's
   date, newest posting first. That is also the order the page opens in, so new listings
   are the first thing a visitor sees under "All areas".

   A role already on the board is never added twice. A fresh card matches a published one
   by employer and title (case, punctuation and city names ignored), by Indeed posting id,
   or by the same title words in another order; a match updates that card in place —
   picking up new locations, a newer posting date, a term or a pay figure it was missing —
   rather than adding a second copy. The run prints how many cards were new, updated and
   already there, and names the new ones. "Intern" and a title's restatement of its own term
   don't count as title words, so "Finance and Accounting Internship" and the same title
   with "- Summer 2027" on the end are one Summer 2027 role, while "Audit Summer 2027" and
   "Audit Winter 2027" stay two. The same check then runs across the whole board, so two
   copies that were both already published fold into the newer one.

   Indeed sometimes files one employer under two names ("Team TTI" and "Techtronic
   Industries Co. Ltd" for the same posting) or under the wrong arm of a firm ("Baker Tilly
   Canada" for US roles). `COMPANY_NAMES` in `build_data.py` maps each of those to the one
   name the board shows; add a line there when a new export does it again.

   Review what a new export adds before publishing it: run it with `--out` and `--json`
   pointed at scratch files, read the new cards, and check that each one's location matches
   its description (Indeed has filed an Irvine, California job under Miami). Two lists in
   `build_data.py` carry what you find. `EXCLUDED` holds postings kept off the board, as
   (employer regex, title regex, reason) lines, so the next export cannot bring them back;
   the build prints what it held back. `CATEGORY_OVERRIDES` files a posting under the right
   area when the rules read a stray word in its description ("audit", "finance") and put it
   somewhere wrong. Add a line to either instead of loosening a rule, which would move other cards.

   Terms that have already ended are dropped automatically, and a listing whose only
   advertised term has ended is removed. A term in its last two months (Fall from
   November, Summer from July) is treated as closing: a published card that names only
   closing terms is kept through a `--merge` only if the new export still lists it, since
   a Fall card an October scrape no longer carries is far more likely gone than open.
   A card that also names a later term stays either way; the run prints what it dropped. In September 2026, for example, "Summer 2026"
   disappears from the Term filter while "Fall 2026" stays. Listings that never name a
   term are kept. Postings more than 90 days old (`--max-age`) are
   dropped on both sides of a merge, and again whenever the page is re-rendered with `--data`,
   so the board sheds its own stale cards and an export's older rows never come back in. Useful flags:

   - `--date "Oct 1, 2026"` to set the "updated" label yourself
   - `--max-age 0` to keep postings older than 90 days. The build drops them by
     default: the export reaches a year back, and a dead apply link costs more trust than
     a missing listing earns.
   - `--stats` to print how postings were categorised
   - `--check` to write `check.txt`, one line per card, for eyeballing categories
   - `--data data.json` to re-render `index.html` from a saved `data.json` without the spreadsheet (for example after editing `template.html`)

   `--merge` and `--data` both read a built `index.html` as happily as a `data.json`,
   pulling the listings back out of its inline `<script id="data">` block. `data.json` is
   gitignored, so the committed page is usually the only record of what is live.

   What the build cannot see is a listing that was taken down without its term ending.
   Nothing in the export says so — `isExpired` is `false` on every row of a fresh scrape,
   and a role missing from one scrape is as likely to have been pushed out of the row cap
   as to have closed. Those cards stay until they age out.

## The Cloud & DevOps area

Cloud & DevOps is an ordinary area in the list, between Software, IT, Data & AI and Civil.
It has no highlight, pin or badge. It is the area that carries entry-level **jobs** as well as
internships, and every card in it says which it is. Its listings come from a hand-made
sheet rather than the Indeed export, an .xlsx or a .csv with the columns Company, Role,
Location and Direct Apply URL, plus any of Posted, Type or Job Type, Experience, Salary,
a summary column and a caveats column. The reader also takes the names a sheet is likely
to use instead (Employer, Job title, Florida location, Indeed application URL, Listed pay,
Experience requirement, Employment, "... (from posting)", Important caveats; the full list
is `SHEET_ALIASES` in `build_data.py`):

    python3 build_data.py --sheet "Cloud & DevOps" cloud.csv --merge index.html

A Type of "Internship" (or a Role that says intern) is an internship; anything else is
shown as an entry-level job, listed under "Entry-level job" in the Level filter, with
Full-time or Part-time shown when the sheet says so. A row without a Posted date is dated
the day it is built. A pay cell that says "Not listed" is left blank. The summary and the
experience requirement show on the card; a caveat is listed under it. Every row is tagged
with the area's major (Information Technology), and the sheet's say on the area wins over
the classifier when a row matches a card already on the board. Any card whose title names
cloud work (the `title` rule in `SPOT_AREAS` in `build_data.py`: cloud, DevOps, platform
engineer, SRE, Kubernetes, AWS, Azure, GCP) moves into the area too, including cards
carried over from older exports. Sheet rows age out like any other posting, so rebuild
with the sheet again to keep them.

A sheet that only has Indeed links can be pointed at the employers' own apply pages
with an Indeed export that contains the same postings:

    python3 build_data.py --data index.html --relink export.xlsx

`--relink` matches each card's Indeed link to the export by Indeed job id and swaps in
that row's `externalApplyLink`, with tracking tags stripped. The Indeed page stays on the
card as "Original listing", and the card takes the export's posting date. It adds no
cards and leaves any card whose posting is not in the export alone. It also works next
to `--sheet ... --merge`.

A guide can be linked under an area's results header, as a pill in the slim
"Get ready" row beside the area's BuildersBench projects link: a `GUIDES` entry in the
`template.html` script (the pill label, a short tag such as PDF, the file, and a tooltip
with the longer blurb) and the file itself committed next to `index.html`. Cloud & DevOps carries `aws-cloud-careers.pdf`,
a 15-slide deck on entry-level AWS roles in Florida, for as long as the area is up. To
take it down, delete the entry and the file and rebuild. The Content-Security-Policy in
`vercel.json` is set on the page only, so a PDF beside it opens in the browser's viewer.

Cybersecurity and IT Support / Help Desk used to be sheet-fed areas. They are retired
(`RETIRED_AREAS`): a card still filed under either is sent back through the title
classifier on the next build and lands where it did before the tabs existed, cyber and
help-desk titles in Software, IT, Data & AI and "Cyber Risk Services" in Accounting, Tax
& Audit. The entry-level jobs that came from those sheets stay on the board in those
areas, still marked "Entry-level job".

To add another sheet-fed area, add an entry to `SPOT_AREAS` (its title rule, the major
to tag, and a short slug for card ids) and put the area's name in `AREA_ORDER` in the
`template.html` script, where it takes its place in the list. Earlier versions of the page
colour-coded these areas and pinned them above the list; that styling was removed, so the
area needs no colour.

## Featured listings (paid placements)

An employer can pay to pin a role. `featured.json` lists them; every build reads it, so
adding or removing a placement is an edit to that file and a rebuild:

    [
      {"company": "Lennar", "title": "LTG - Cloud Engineer II", "until": "2026-11-09"},
      {"company": "Acme AI Labs", "title": "AI Engineering Intern - Spring 2027", "until": "2026-11-09",
       "apply": "https://acme.ai/careers/ai-intern", "location": "Miami, FL", "pay": "$25/hr",
       "summary": "Build LLM tooling with the applied AI team."}
    ]

    python3 build_data.py --data index.html --date "Oct 9, 2026"

- `company` and `title` name a card already on the board, matched the way `--merge`
  matches (case, punctuation and city names ignored). `until` is the last day it stays featured.
- A role that is not on the board yet needs `apply`, and can give `location`, `pay`,
  `summary` and `term`. The build adds it as a card, posted today. A sponsor doesn't have
  to wait for a scrape to pick their role up.
- A featured card gets a gold border, a gold Apply button and a FEATURED chip whose tooltip
  says the employer paid for it. That chip is the page's only disclosure of paid placement,
  so keep it.
- Up to three featured cards (`FEAT_MAX` in the template) lead whatever view they match,
  under the default "Newest first" sort only. A visitor who sorts by pay or A to Z gets an
  honest list.
- The page drops the mark itself at the end of the `until` day, even if nobody rebuilds.
  The build log names placements that have ended so they can come out of the file, and warns
  about any entry it could not find on the board and could not add.
- `featured.json` is the whole truth. A build clears every mark and sets them again from
  the file, so deleting an entry ends that placement on the next build.

## Pick of the week

Every Monday the page draws three listings at random (`PICK_MAX` in the template) and marks
them PICK OF THE WEEK, in neon magenta (a colour no other card uses) with a light that runs around the
card's edge all the time, and a chip whose tooltip says the draw is random and
unpaid. Nothing needs editing or rebuilding: the page seeds the draw with the current week,
so every visitor sees the same three all week and a new set the next.

- Only listings posted in the last 45 days (`PICK_FRESH`) with an apply link and no warning
  flag are in the draw. Featured cards are left out, since they are already pinned.
- Picks lead whatever view they match, right after any featured cards, under "Newest first"
  only, the same rule featured cards follow.
- Each card's place in the draw comes from a hash of the week and its id, so a rebuild that
  adds or drops other listings mid-week leaves the picks alone unless a pick itself is gone.
- They are kept apart from featured cards on purpose. The FEATURED tooltip tells visitors
  those are paid placements; marking free, randomly chosen roles FEATURED would make that
  claim false.

## South Florida industries

The employers this region is known for, gathered by name rather than by field: sports and
media; banking and finance; real estate and construction; aviation and aerospace; cruise and
shipping. They live on the insights page as a row of cards (listings, employers, median pay,
the areas and employers behind each), and each card's "See listings" opens the board
filtered to that collection. The board itself shows no industries row any more; the filter
is reached from those cards and from shared links.

- The collections are `HUBS` in `build_data.py`: an employer-name pattern (`co`) and, where
  it helps, a title pattern (`ti`). The build marks each card with the ids it matches
  (`hubs`), so changing a pattern is an edit and a rebuild. The board only carries the
  names, through the `__HUBS__` placeholder in `template.html`.
- A collection appears on the insights page only with at least 5 listings from at least 3
  employers (`MIN_HUB`, `MIN_HUB_EMP`), so it can never turn into one company's page. Check
  each pattern's matches when you add one: a pattern that is too loose files unrelated
  employers under it (a word like "lending" caught a therapy practice).
- The pick is kept in the address as `#hub=<id>`, so a view can be shared. The board accepts
  any id that at least one card carries, so a link to a small collection still works.

## Bilingual tags

A card that mentions Spanish, Portuguese or Haitian Creole carries a cyan chip, "Spanish
required", "Spanish a plus" or "Spanish mentioned", and the filter panel has a Bilingual
toggle (`#bi=1`). The chip says what the posting says, nothing more.

- `langs_for()` in `build_data.py` reads each clause around a mention and lets the nearest
  cue decide: "preferred", "a plus", "(Preferred)" make it a plus; "required", "must",
  "(Required)", or "Bilingual" in the title make it required; no cue leaves it "mentioned".
  It skips boilerplate that names Spanish without asking for it (an E-Verify poster "in
  English or Spanish", Spanish River Boulevard).
- The result is stored on each card as `lang` (a list) and `langNeed`. A fresh export reads
  the full description. Cards from older builds no longer have theirs, so they are read from
  the title, summary and requirement bullets they carry; that finds less, and a later export
  that matches the card adds to it and never removes.
- "Bilingual" with no language named is kept as "Bilingual", unless the posting names another
  language (Mandarin, French...) anywhere, in which case it is dropped.

## The pay report

What internships pay lives on the insights page, under "What interns earn": the median and
the middle half of the hourly pay listings quote, by area, county, level and employer. The
board's old "What interns earn" button and dialog are gone; a shared `#report=pay` link on
the board redirects to `insights.html#pay`.

- Only internships that quote an **hourly** figure count. A weekly, monthly or yearly figure
  is a different promise, and entry-level jobs (the Cloud & DevOps cards) are left out. A
  range counts as its midpoint; figures under $8 or over $120 an hour are treated as typos.
- A group needs 5 hourly listings to get a bar (`MIN_PAY_N` in `build_data.py`).
- The numbers come from the listings, so they describe what employers published, not what
  every intern earns. The page says so.

## The insights page

`insights.html` is a second page, linked from the "Insights" pill beside the subtitle (it
carries a "New!" badge; drop the `<b class="new">` in `template.html` when it is not new): the
intern market in numbers, laid out like a stock screener. Everything on it is counted from the
listings on the board, so it needs no other data and goes stale only when the board does.

- **The pulse strip** at the top: open listings, how many are new in the last 7, 14 and 30 days,
  the median hourly pay, the share of listings that say what they pay, employers, and remote
  or hybrid roles. Its reading, "Heating up", "Steady" or "Cooling", compares the last 14 days
  with the 14 before: a move of 15% or more either way changes the word.
- **What interns earn**: the pay report's bars, with a lighter band behind each for the middle
  half, switchable between area, county, level and the top-paying employers. Each row links to
  the board filtered to it. The same rules as the pay report: hourly figures, internships only,
  5 listings for a bar.
- **Who's hiring most**: one card per employer for the 12 with the most roles up, ranked, with
  openings, counties, pay range, newest posting, the terms they hire for, and a link to their
  listings (`#q=<employer>`).
- **South Florida industries**: a card per collection with listings, employers, median pay,
  the areas and employers behind it, and a link to the board filtered to it (`#hub=<id>`).
  See "South Florida industries".
- **What employers ask for**: how many listings name each skill, across the board and per area.
  `SKILLS` in `build_data.py` is the fixed list of skills and the pattern that finds each; a
  listing counts once per skill however often it says it. A skill links to a board search for
  its plainest word (`SKILL_Q` in the template maps the labels that are not a word, "Tableau /
  Power BI" to "tableau").
- **Where and when**: listings by county, by term and by level.
- A "How these numbers are made" section at the bottom says all of this in plain words.
- **Over time**: line charts of open listings, median pay and employers, one point per
  update; postings by the month they were posted; each area's count at the first update
  against now; and a table with one row per quarter. See "The history file".

The figures are worked out once by `insights_for` in `build_data.py`, so the page carries ten
kilobytes of numbers rather than the listings. `insights_template.html` holds the markup, the
same tokens as `template.html` (change a colour in one and copy it to the other), and the script
that draws the page; `__INSIGHTS__` and `__DATE__` are filled in by the build. Every build
writes `index.html` and `insights.html` together, and `vercel.json` carries a CSP for each
(`/insights` and `/insights.html`), pinned to that page's inline script and style.

## The history file

`history.json` is the board's record over time, so quarters and years can be compared later.
Every build adds one line to it with that day's figures (open listings, new in 7/14/30 days,
employers, median pay, the share that list pay, counts by area, county, term and level, pay by
area, the top employers and skills, and postings by the month they were posted). A second
build on the same day replaces that day's line. It is committed with the pages, so git keeps
every version and nothing needs a server or an account; the "Over time" section of the
insights page is drawn from it, through `history_series` in `build_data.py`.

- Commit `history.json` with `index.html` and `insights.html`. A build that is only a preview
  can skip it with `--history -`.
- The file was backfilled from every past `index.html` in git, one snapshot per day the board
  changed, back to the first board on Sep 10, 2026, so the record starts there.
- A quarter's "postings" counts listings by the month each was posted, taking the highest
  count any build saw for that month, so it is not inflated by how often the board was
  rebuilt and survives the 90-day trim.
- When you want something it does not record, add the field in `snapshot_for`; older lines
  simply lack it, and the page treats a missing field as "not recorded".
- If the site ever needs figures visitors write (a poll, say), that is the point to add a
  real database; this file is for what the build can count.

## The opportunity assistant (private preview)

`assistant.html` is a third page, not linked from the board: a visitor describes themselves in
plain language and gets up to five listings from the board, with why each fits and what the
posting asks for that they have not mentioned. It is the one part of the site that is not
static. `api/assistant.js` is a Vercel function; everything it does is in `lib/assistant/`.

How a turn works:

1. **Read.** The model turns the conversation into a profile (interests, skills, experience,
   level, internship or job, location, remote, availability, languages) and an intent: a
   search, a question about listings it already showed, or something else. If the field is
   missing it may ask one short question, at most three per conversation (`maxFollowups` in
   `handler.js`); the server counts them and stops asking after that.
2. **Retrieve, deterministically.** `retrieve.js` turns the profile into filters and a
   keyword score over the board's own listings: place names map to counties (`PLACES`), an
   undergraduate never sees graduate-only listings, "internship" never returns an entry-level
   job, "Returning interns only" is skipped, a named term and a language are boosts rather
   than filters, and interests are widened with `SYNONYMS` ("cybersecurity" also finds SOC,
   threat, GRC). Fewer than three in the named county widens to the rest of South Florida and
   says so. The top 12 go to the model; a listing that is not among them cannot be recommended.
3. **Rank and explain.** The model orders those candidates, writes one or two sentences on the
   fit, and names the qualifications the visitor has not mentioned as *indexes* into the
   listing's own requirement bullets, never as free text. The bullets are split by the cue
   they carry (`kindOf` in `listings.js`): "required", "must", "pursuing" mark a required one;
   "preferred", "a plus", "nice to have" a preferred one; the rest are shown as "the posting
   does not say". The server checks every id and index before anything reaches the page.
4. **Answer.** A question about the recommended listings is answered from their full board
   content only, passed as data. Pay, deadlines and links come from the card or not at all.

No strong match (no candidate names the field in its title, area or majors) returns a
plain "no strong matches" with search adjustments worked out from the board (widen the
county, include jobs, drop the term, the largest neighbouring areas) and up to three
"closest on the board" cards marked as weak. Every card says "not verified as still open":
the board cannot see a posting the employer took down early, and the model is told never to
claim one is open.

Listing text is third-party. It reaches the model inside a JSON `data` field, and each prompt
says it is data from postings and never an instruction. The page renders cards from the
server's copy of the listing (id, title, employer, apply link, requirement bullets), so a
model reply can add an explanation to a card but cannot change what the card says or link to.

**The model.** Requests go through Vercel AI Gateway's OpenAI-compatible endpoint
(`https://ai-gateway.vercel.sh/v1/chat/completions`), model `minimax/minimax-m3.1-flash`,
with `providerOptions.gateway.only: ["minimax"]` so the gateway serves the request from
MiniMax or fails it; it never routes to another provider. `ASSISTANT_MODEL` and
`ASSISTANT_PROVIDERS` switch both without a code change. The reply's routing metadata is
checked too: a reply served by a provider outside the list is refused.

**Setup.** `.env.example` lists every variable. In Vercel, Project > Settings > Environment
Variables: `AI_GATEWAY_API_KEY` (create one under the team's AI Gateway tab; it is only ever
read on the server) and `ASSISTANT_ENABLED=true`. Set `ASSISTANT_ENABLED=false` and redeploy
to stop every AI request when the free promotion ends; the page then shows "The assistant is
paused" and the board is untouched. Keep the preview private by leaving `ASSISTANT_URL` in
`template.html` empty (the board shows no link); set it to `assistant.html` and rebuild to show
the "Ask the assistant" pill beside Insights.

**Limits.** 1,500 characters a message, 16 turns, 8 requests a minute and 40 an hour per
address, and a daily cap (`ASSISTANT_DAILY_CAP`, default 400) per function instance; the
per-instance counters reset when Vercel recycles the instance, so they stop a loop rather
than meter the promotion exactly. The page shows the model's progress while it waits, a
retry on a failed request, and a banner when the assistant is paused or unconfigured.

**Data.** The function reads the listings out of the built `index.html` at run time (the
`functions` entry in `vercel.json` bundles it), so a rebuild of the board is a rebuild of
what the assistant can find. If that file cannot be read, `lib/assistant/sample-listings.json`
stands in: five made-up listings, ids `sample-*`, and a "Sample data" banner on every reply.

**Running it.** `npm test` runs the whole flow against a scripted stand-in for the gateway
(`test/fake-gateway.js`), including the three scenarios in the task: a Miami cybersecurity
student with no experience, a bilingual engineering student after a research internship, and
a field the board does not carry. `node test/serve.mjs --fake` serves the page locally with
that stand-in; without `--fake` and with `AI_GATEWAY_API_KEY` set it calls the real gateway.
`--sample` forces the sample set. `python3 build_data.py ...` writes `assistant.html` from
`assistant_template.html` alongside the other pages, and its CSP into `vercel.json`.

## Email list

The list lives on a newsletter service (Kit, Beehiiv, Substack or similar), which handles
sending, unsubscribe links and the spam rules. To switch the signup on, paste the service's
public signup page into `NEWSLETTER_URL` near the top of the script in `template.html`, then
rebuild:

    python3 build_data.py --data index.html --date "Oct 9, 2026"

Once it's set, an invite card sits after the sixth listing in every view. It links out to
the service, not to a form on this page, so the CSP's `form-action 'none'` stays as it is.
Leave the URL empty and it doesn't appear.

## How a posting is read

An internship search on Indeed returns some things that are not internships: a manager
of an internship program, a coordinator role that needs a completed degree, a new-grad
hire "for former interns only". A title that starts with manager, director or supervisor,
or says "new grad", is left out; so is one that ends in coordinator or manager unless the
posting itself calls the role an internship. Internships as the job's subject matter
("job and internship development") don't count. The build prints what it left out.

**Area.** A title that names the work decides it, in the order of `CATS` in
`build_data.py`. The Business catch-all comes last and only carries words that name
business work outright (purchasing, leasing, analyst, supply chain). A title that names
nothing — "Intern", "Summer Associate", "Internship Program" — is decided by the employer's
name, then by strong nouns in the posting's opening (a general contractor, a law firm, an
insurance broker, a hotel), then by a looser read of the first 1,500 characters, and only
then falls into Business.

**Majors.** The Major filter answers "which roles are aimed at students in this major",
which is narrower than "which roles would accept them". A major is tagged when it is in
the title, or when it is one of the first five degrees a posting names. A degree sentence
is read one comma-separated phrase at a time, in order, and stops at the end of the
sentence, or at the end of the list it introduces. So "Bachelor's in Accounting, Finance,
or Hospitality Finance" tags all three; "Strong communication skills" on the next line
tags nothing; and a software posting that will take "Computer Science, Computer
Engineering, Software Engineering, Electrical Engineering, Wireless Engineering,
Information Security, Mathematics or related" is tagged Computer Science and Electrical
Engineering, not Cybersecurity. A list that long is a door left open, not a target, and
the board does not advertise open doors. Cards that name no major still show under
"All majors".

Bare "major" is the trap word: it is an adjective as often as a noun ("major market",
"three major components", and "majority" as a plain substring), so it only opens a degree
sentence in the shapes a requirement actually takes — "major in", "majors:", "any/related/
preferred majors", "Accounting major".

**Pay.** The salary cell wins when Indeed has one; placeholder amounts like "Up to $1 a
month" are dropped. "Commission" is only pay when the posting talks about earning it; a
hospital's "Commission on Dietetic Registration" is not.

A classifier change only reaches the cards whose rows are in the export you build from:
the page keeps a card's derived fields, not the posting text they came from. Cards carried
over from older exports get re-read from their title alone. If that becomes a problem,
the fix is to commit the source rows the board was built from, which is a design change
this README does not make.

3. Commit the new `index.html`. Vercel redeploys automatically. `data.json` and `check.txt` are gitignored.

Requires Python 3 with `openpyxl` (`pip install openpyxl`).

## Design

Dark and low-chrome, sharing the palette of buildersbench.dev. Green-black page
`#090D0B`, cards `#101714`, and one accent `#00E37B` used only for employer names, pay,
freshness and the Apply button, which carries a soft green glow. Inter for text, IBM
Plex Mono for labels and counts, 12px card radius.

All colours live in the `:root` block at the top of `template.html`, so the whole look
swaps by editing that block and rebuilding. Every text pair clears WCAG AA: the accent
runs 10.6:1 on a card and body text 6.8:1. If you change the accent, re-check it against
both `--bg` and `--panel`.

A banner at the top of every page links to https://www.buildersbench.dev/. It collapses
to the site name and a Visit link under 900px. Its markup is the `.bbar` block in
`template.html`.

The tech areas link deeper into BuildersBench. Under the results header, Cloud & DevOps
opens its cloud projects (`#path=cloud`) and Software, IT, Data & AI opens the full
catalog. Each card in those areas also gets a "Projects for this role" link, which opens
BuildersBench's Career Match filled in with the job's title, summary and requirements
(`match.html?q=...`). Career Match matches on keywords, and a bare title often has none.
The mapping is `BENCH` in `template.html`; add an area to it to give that area the same links.

## The mark, and the two things that move

The logo beside the title is a sibling of the BuildersBench mark, not a copy of it: the
same language of glowing nodes joined by thin links, in the board's own green, arranged
as one hub reaching five ways instead of BuildersBench's loose web. It turns once every
12 seconds. The title carries a blinking block caret, the same one that sits after the
BuildersBench headline, which is why the board reads as a terminal prompt.

Both live in `template.html`: the `.mark` block for the SVG and its `markspin`, and
`.head h1::after` for the `caret`. The SVG takes its colour from `currentColor` and its
gradient stops from CSS classes, so the mark follows `:root` like everything else and
needs no edit if the accent changes. It is `aria-hidden`; the title next to it already
names the site.

A card lights up under the pointer: it lifts 2px and a short bright arc orbits its edge
once every 2.6 seconds, with a blurred twin under it for the glow. Both are a conic
gradient on the card's `::before` and `::after`, masked to a ring so only the edge is
painted and the card's own background and text contrast stay as they are; the
gradient's start angle is a registered `@property`, which is what lets it animate
smoothly. The hover rules only run on `(hover:hover) and (pointer:fine)`, so a phone tap never
leaves a card stuck lit; on a touch screen a tap on the card itself (not on a link or
button) runs the light around once instead, and the `lit` class comes off when the lap
ends. Checked at 320, 360, 390 and 430px: no horizontal scroll, every tap target 44px.

None of these animations run under `prefers-reduced-motion: reduce`, which leaves a still
mark, a solid caret and a card that changes colour without moving. That rule needs `*, *::before, *::after` — a bare `*` matches elements
only, and would leave the caret blinking.

## Mobile

The page is built for phones first at 900px and below. The area list becomes a
side-scrolling strip with a fade at its edge, the filter panel collapses behind a
Filters button that sticks to the top of the list while you scroll, and every control
clears the 44px touch minimum. No text on a card is under 12px, the search field stays
at 16px so iOS does not zoom on focus, and `.wrap` respects `env(safe-area-inset-*)`
for notched phones. Checked at 320, 360, 390 and 430px wide plus landscape.

## Outbound links

Each card names the domain its Apply button opens, under the button, because the board
links out to more than 160 employer and applicant-tracking domains that come from scraped
postings. Per-location links in the details panel carry the same information as a tooltip.

Next to "Original listing" every card has a **Report closed listing** link. It opens a
new issue on this repo's GitHub, pre-filled with the employer, role, card id and apply
link, because a scrape can't see a posting the employer took down early. Reports need a
GitHub account and are public; they carry only the listing, nothing about the reporter.
To take reports by email instead, point `REPORT_URL` in `template.html` at a `mailto:`
address and rebuild, knowing that address will be readable in the page source.

## Security

The site is static apart from the assistant: no database, no JavaScript dependencies, and
the only user input is the assistant's message box, which goes to `/api/assistant` and nowhere
else (see "The opportunity assistant" for what that function does with it).
Listing text is third-party, so the page escapes every value it renders and accepts only
`http(s)` links; hostile payloads render as visible text. Three build-time measures back
that up.

- **`vercel.json` is generated on every build.** It carries a Content-Security-Policy
  that allows the inline script and stylesheet *by SHA-256 hash*, with no `unsafe-inline`
  anywhere, plus `nosniff`, a referrer policy, `frame-ancestors 'none'` and HSTS. An
  injected script cannot run even if escaping is wrong somewhere.
- **Plain-HTTP apply links are upgraded to HTTPS**, since a student on shared wi-fi can
  have an HTTP page tampered with in transit. `--keep-http` turns this off if a
  destination ever breaks.
- **Referral tags are stripped from apply links.** The scrape arrives with `utm_*`,
  `indeed-apply-token`, `iis`/`iisn`, a per-click `sid`, and `source=Indeed`-style tags,
  which only credit Indeed. The build removes those and leaves every other parameter,
  since many applicant-tracking systems need theirs (`opportunityId`, `jobId`, `cid`) to
  find the job. `TRACKING_KEYS` and `SOURCE_KEYS` in `build_data.py` hold the list.
- **Listing text is scanned for AI-instruction-shaped phrases.** Nothing in the site
  talks to a model, but descriptions are written by whoever posted the job and they land
  in this repo, where coding agents read them. `--strict` refuses to write anything when
  the scan trips.

**The CSP hashes cover the exact bytes of `index.html`.** Regenerate the two together and
never hand-edit `index.html`, or its script will stop running.

Vercel Web Analytics is installed, which is why `script-src` carries `'self'` and
`connect-src` carries `'self'` as well. The analytics script posts page views to a
same-origin `/_vercel/insights/*` path, not to the `vitals.vercel-insights.com` host, so
`'self'` in `connect-src` is what actually lets it report. Dropping either one silently
stops analytics without breaking the page, so it is worth re-testing after any change.

Build only from spreadsheets you exported yourself. Parsing the workbook with `openpyxl`
is the one place untrusted input is processed on your machine.

## Files

- `template.html`: page markup, styles and the client-side filtering script. Colours live in the `:root` block. `__DATA__` and `__DATE__` are filled in by the build.
- `build_data.py`: reads the spreadsheet, leaves out postings that are jobs rather than internships, classifies each one (area, majors, term, level, pay, work mode) as described under "How a posting is read", merges the same role across locations into one card, folds the result into the listings already published when `--merge` is given, and renders the page.
- `featured.json`: paid placements, read by every build. See "Featured listings".
- `history.json`: one line of figures per build, back to the first board. See "The history file".
- `insights_template.html`: the insights page's markup, styles and script. `__INSIGHTS__` and `__DATE__` are filled in by the build. See "The insights page".
- `assistant_template.html`, `assistant.html`: the assistant page and its build. `api/assistant.js` is the Vercel function, `lib/assistant/` the code behind it, `test/` its tests and local server. See "The opportunity assistant".
- `index.html`, `insights.html`: the generated pages. Do not edit by hand; change a template or the script and rebuild.
- `vercel.json`: generated security headers, including a CSP for each page pinned to that build of it.
- `og.png`: 1200x630 link preview image, referenced by the Open Graph tags in the template.
  It has no counts on it, so it does not go stale and needs regenerating only if the palette changes.

## Changing the live URL

The template hardcodes `https://cob-eta.vercel.app/` in the canonical, Open Graph and Twitter
tags. If the board moves to another domain, update those tags in `template.html` and rebuild,
otherwise shared links will preview the old address.
