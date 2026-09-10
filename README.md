# Christian's Opportunity Board

Single-file static site. `index.html` is the whole deployment; the internship data is embedded inside it.

## Deploy to Vercel

1. Create a new repo under WynwoodDreams (e.g. `opportunity-board`) and upload the contents of this folder through the GitHub web UI.
2. In Vercel: Add New Project, import the repo, leave Framework Preset as "Other", no build command, output directory blank. Deploy.

## Refresh the listings

1. Export a new spreadsheet with the same columns (company, positionName, location, jobType/0-3, postedAt, postingDateParsed, externalApplyLink, salary, description, url, id).
2. Edit the path at the top of `tools/build_data.py`, then from the `tools` folder run:

       python3 build_data.py
       python3 -c "d=open('data.json',encoding='utf-8').read().replace('</','<\\\\/');t=open('template.html',encoding='utf-8').read();open('../index.html','w',encoding='utf-8').write(t.replace('__DATA__',d).replace('__DATE__','Month D, YYYY'))"

3. Commit the new `index.html`. Vercel redeploys automatically.

Requires Python 3 with `openpyxl` (`pip install openpyxl`).
