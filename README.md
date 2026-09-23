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

Neither animation runs under `prefers-reduced-motion: reduce`, which leaves a still mark
and a solid caret. That rule needs `*, *::before, *::after` — a bare `*` matches elements
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
- `index.html`: the generated page. Do not edit by hand; change the template or the script and rebuild.
- `vercel.json`: generated security headers, including a CSP pinned to that build of `index.html`.
- `og.png`: 1200x630 link preview image, referenced by the Open Graph tags in the template.
  It has no counts on it, so it does not go stale and needs regenerating only if the palette changes.

## Changing the live URL

The template hardcodes `https://cob-eta.vercel.app/` in the canonical, Open Graph and Twitter
tags. If the board moves to another domain, update those tags in `template.html` and rebuild,
otherwise shared links will preview the old address.
