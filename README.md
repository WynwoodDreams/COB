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
   - `--max-age 180` to drop postings older than 180 days (the export can carry listings from a year back)
   - `--stats` to print how postings were categorised
   - `--check` to write `check.txt`, one line per card, for eyeballing categories
   - `--data data.json` to re-render `index.html` from a saved `data.json` without the spreadsheet (for example after editing `template.html`)

3. Commit the new `index.html`. Vercel redeploys automatically. `data.json` and `check.txt` are gitignored.

Requires Python 3 with `openpyxl` (`pip install openpyxl`).

## Design

Two colours only: safety orange `#FC5200` as the ground and near-black `#111111` as the ink,
after an industrial spec-sheet reference. The masthead carries the poster devices, corner
brackets, a dashed grid, rotated technical labels, a barcode block and a STATUS badge.
Listings sit on black panels so a long list gives the eye somewhere to rest, with orange
reserved for employer names, pay and the Apply button.

Type is Inter Tight for display and body, IBM Plex Mono for the technical labels.
Every text pair clears WCAG AA: black on orange is 5.7:1, and the panel text runs 6.6:1 or better.
If you change the orange, re-check those ratios, since white on this orange already fails.

## Files

- `template.html`: page markup, styles and the client-side filtering script. Colours live in the `:root` block. `__DATA__` and `__DATE__` are filled in by the build.
- `build_data.py`: reads the spreadsheet, classifies each posting (area, majors, term, level, pay, work mode), merges the same role across locations into one card, and renders the page.
- `index.html`: the generated page. Do not edit by hand; change the template or the script and rebuild.
- `og.png`: 1200x630 link preview image, referenced by the Open Graph tags in the template.
  It has no counts on it, so it does not go stale and needs regenerating only if the branding changes.

## Changing the live URL

The template hardcodes `https://cob-eta.vercel.app/` in the canonical, Open Graph and Twitter
tags. If the board moves to another domain, update those tags in `template.html` and rebuild,
otherwise shared links will preview the old address.
