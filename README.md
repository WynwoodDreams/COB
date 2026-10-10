# Christian's Opportunity Board

Static site. `index.html` carries the page and the internship data inline; `og.png` is the
image that shows when someone shares the link. Those two files are the whole deployment.

Visitors filter by area, county, major, term and level, sort by date, pay or employer, and
apply straight to the employer. Filter state lives in the URL, so any view can be shared.

## Deploy to Vercel

1. Create a new repo under WynwoodDreams (e.g. `opportunity-board`) and upload the contents of this folder through the GitHub web UI.
2. In Vercel: Add New Project, import the repo, leave Framework Preset as "Other", no build command, output directory blank. Deploy.

## Refresh the listings

1. Export a new spreadsheet with the same columns (company, positionName, location, jobType/0-3, postedAt, postingDateParsed, externalApplyLink, salary, description, url, id).
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

   Terms that have already ended are dropped automatically, and a listing whose only
   advertised term has ended is removed. In September 2026, for example, "Summer 2026"
   disappears from the Term filter while "Fall 2026" stays. Listings that never name a
   term are kept. Postings more than about four months old (`--max-age`, 122 days) are
   dropped on both sides of a merge, so the board sheds its own stale cards as it takes on
   new ones, and an export's older rows never come back in. Useful flags:

   - `--date "Oct 1, 2026"` to set the "updated" label yourself
   - `--max-age 0` to keep postings older than four months. The build drops them by
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

## The spotlight tab: Cloud & DevOps

One area is pinned under "All areas" and drawn to stand out, in lavender with a NEW
badge: Cloud & DevOps. It is the area that carries entry-level **jobs** as well as
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

A guide can be pinned under a spotlight area's results header, as a pill in the slim
"Get ready" row beside the area's BuildersBench projects link: a `GUIDES` entry in the
`template.html` script (the pill label, a short tag such as PDF, the file, and a tooltip
with the longer blurb) and the file itself committed next to `index.html`. Cloud & DevOps carries `aws-cloud-careers.pdf`,
a 15-slide deck on entry-level AWS roles in Florida, for as long as the tab is up. To
take it down, delete the entry and the file and rebuild. The Content-Security-Policy in
`vercel.json` is set on the page only, so a PDF beside it opens in the browser's viewer.

Cybersecurity and IT Support / Help Desk used to be spotlight tabs. They are retired
(`RETIRED_AREAS`): a card still filed under either is sent back through the title
classifier on the next build and lands where it did before the tabs existed, cyber and
help-desk titles in Software, IT, Data & AI and "Cyber Risk Services" in Accounting, Tax
& Audit. The entry-level jobs that came from those sheets stay on the board in those
areas, still marked "Entry-level job".

To add another spotlight area, add an entry to `SPOT_AREAS` (its title rule, the major
to tag, and a short slug for card ids) and a matching colour class in `template.html`:
the `--spot-*` variables in `:root`, a `.spot.<slug>` rule beside `.spot.cloud`, and the
area's name in the `SPOTS` map in the script. Each colour clears WCAG AA on both the
page and card backgrounds.

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
  says the employer paid for it. The footer says the same in words, which is the disclosure
  the FTC expects for paid placement. Keep both.
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
them PICK OF THE WEEK, with a green edge and a chip whose tooltip says the draw is random and
unpaid. Nothing needs editing or rebuilding: the page seeds the draw with the current week,
so every visitor sees the same three all week and a new set the next.

- Only listings posted in the last 45 days (`PICK_FRESH`) with an apply link and no warning
  flag are in the draw. Featured cards are left out, since they are already pinned.
- Picks lead whatever view they match, right after any featured cards, under "Newest first"
  only, the same rule featured cards follow.
- Each card's place in the draw comes from a hash of the week and its id, so a rebuild that
  adds or drops other listings mid-week leaves the picks alone unless a pick itself is gone.
- They are kept apart from featured cards on purpose. The footer and the FEATURED tooltip tell
  visitors those are paid placements; marking free, randomly chosen roles FEATURED would make
  that claim false. The footer says in words that picks are random and not paid.

## Email list

The list lives on a newsletter service (Kit, Beehiiv, Substack or similar), which handles
sending, unsubscribe links and the spam rules. To switch the signup on, paste the service's
public signup page into `NEWSLETTER_URL` near the top of the script in `template.html`, then
rebuild:

    python3 build_data.py --data index.html --date "Oct 9, 2026"

Once it's set, an invite card sits after the sixth listing in every view and the footer gets a
"join the list" link. Both link out to the service, not to a form on this page, so the
CSP's `form-action 'none'` stays as it is. Leave the URL empty and neither appears.

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

The page is built for phones first at 900px and below, and there it is laid out like an
app rather than a squeezed desktop. The header is one line of title and one of tagline;
the counts are left to the desktop. The search bar stays pinned to the top of the screen
for the whole page, with a filter button beside it that carries a badge for how many
filters are on. Every area, Cloud & DevOps first, sits in one strip of chips that scrolls
sideways. The filters open as a sheet that slides up from the bottom over a dimmed page,
with a "Show N listings" button that counts the matches live; tapping outside it, the
close button or Escape puts it away.

Cards keep to the essentials on a phone: the summary is clamped to three lines, the majors
are one swipeable row, and the posted date, original listing and report link move into
Details, so every card ends on Apply and Details. Every primary control clears the 44px
touch minimum, the search field stays at 16px so iOS does not zoom on focus, and `.wrap`
respects `env(safe-area-inset-*)` for notched phones. Checked at 320, 360, 390 and 430px
wide plus landscape, with no sideways scroll at any of them.

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

The site is static: no server, no database, no user input, no JavaScript dependencies.
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
- `index.html`: the generated page. Do not edit by hand; change the template or the script and rebuild.
- `vercel.json`: generated security headers, including a CSP pinned to that build of `index.html`.
- `og.png`: 1200x630 link preview image, referenced by the Open Graph tags in the template.
  It has no counts on it, so it does not go stale and needs regenerating only if the palette changes.

## Changing the live URL

The template hardcodes `https://cob-eta.vercel.app/` in the canonical, Open Graph and Twitter
tags. If the board moves to another domain, update those tags in `template.html` and rebuild,
otherwise shared links will preview the old address.
