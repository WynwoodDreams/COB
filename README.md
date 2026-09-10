# Christian's Opportunity Board

Single-file static site. `index.html` is the whole deployment; the internship data is embedded inside it.

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

## Files

- `template.html`: page markup, styles and the client-side filtering script. `__DATA__` and `__DATE__` are filled in by the build.
- `build_data.py`: reads the spreadsheet, classifies each posting (area, majors, term, level, pay, work mode), merges the same role across locations into one card, and renders the page.
- `index.html`: the generated page. Do not edit by hand; change the template or the script and rebuild.
