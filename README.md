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

       python3 build_data.py path/to/listings.xlsx

   This writes `data.json` and a fresh `index.html` stamped with today's date.

   Terms that have already ended are dropped automatically, and a listing whose only
   advertised term has ended is removed. In September 2026, for example, "Summer 2026"
   disappears from the Term filter while "Fall 2026" stays. Listings that never name a
   term are kept. Useful flags:

   - `--date "Oct 1, 2026"` to set the "updated" label yourself
   - `--max-age 0` to keep postings older than 180 days. The build drops them by default:
     the export reaches a year back, and a dead apply link costs more trust than a
     missing listing earns.
   - `--stats` to print how postings were categorised
   - `--check` to write `check.txt`, one line per card, for eyeballing categories
   - `--data data.json` to re-render `index.html` from a saved `data.json` without the spreadsheet (for example after editing `template.html`)

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
- **Listing text is scanned for AI-instruction-shaped phrases.** Nothing in the site
  talks to a model, but descriptions are written by whoever posted the job and they land
  in this repo, where coding agents read them. `--strict` refuses to write anything when
  the scan trips.

**The CSP hashes cover the exact bytes of `index.html`.** Regenerate the two together and
never hand-edit `index.html`, or its script will stop running. If you add a script to the
page, such as merging the Vercel Web Analytics pull request, add `'self'` to `script-src`
in `security_headers()` in `build_data.py`, otherwise the new script is blocked.

Build only from spreadsheets you exported yourself. Parsing the workbook with `openpyxl`
is the one place untrusted input is processed on your machine.

## Files

- `template.html`: page markup, styles and the client-side filtering script. Colours live in the `:root` block. `__DATA__` and `__DATE__` are filled in by the build.
- `build_data.py`: reads the spreadsheet, classifies each posting (area, majors, term, level, pay, work mode), merges the same role across locations into one card, and renders the page.
- `index.html`: the generated page. Do not edit by hand; change the template or the script and rebuild.
- `vercel.json`: generated security headers, including a CSP pinned to that build of `index.html`.
- `og.png`: 1200x630 link preview image, referenced by the Open Graph tags in the template.
  It has no counts on it, so it does not go stale and needs regenerating only if the palette changes.

## Changing the live URL

The template hardcodes `https://cob-eta.vercel.app/` in the canonical, Open Graph and Twitter
tags. If the board moves to another domain, update those tags in `template.html` and rebuild,
otherwise shared links will preview the old address.
