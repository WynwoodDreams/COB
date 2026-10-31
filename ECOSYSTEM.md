# The workforce ecosystem

This repo is one of three sites that together form one workforce ecosystem for South Florida
students and early-career job seekers. The same file sits in all three repos; keep the copies
identical when you change one.

| Site | Repo | Live | Job in the ecosystem |
|---|---|---|---|
| Christian's Opportunity Board (COB) | `WynwoodDreams/COB` | https://cob-eta.vercel.app/ | **Find** a role: internships and entry-level jobs across Miami-Dade, Broward and Palm Beach |
| BuildersBench | `WynwoodDreams/4Projects` | https://www.buildersbench.dev/ | **Prepare**: portfolio projects that close the gap between a student and a role |
| ResumeCanvas | `WynwoodDreams/resumecanvas` | https://resumecanvas-seven.vercel.app/ (from `twa-manifest.json`; confirm) | **Apply**: build and tailor the resume for a specific posting |

## The vision

A student should be able to arrive at any of the three and get moved through all of them.
The opportunity assistant, which lives in COB (`assistant.html`, `api/assistant.js`,
`lib/assistant/`), guides them through that journey:

1. **Find (COB).** The student describes themselves in plain language. The assistant
   recommends up to five listings and names, for each one, the requirements the student
   has not mentioned. That gap list is what connects the three sites.
2. **Prepare (BuildersBench).** Each gap points to a BuildersBench project that builds that
   skill, so the student gets a concrete thing to build rather than "learn cloud".
3. **Apply (ResumeCanvas).** "Tailor my resume for this job" opens ResumeCanvas with that
   posting's description already in match mode. A finished BuildersBench project's STAR
   bullets can be added to the resume in one step.
4. **Back to COB** to apply from the original card, with a project done and a tailored resume.

## Principles all three keep

- **No accounts, no database of students.** Progress (BuildersBench) and resumes
  (ResumeCanvas) stay in the student's browser. Nothing about a student is stored on a server.
- **The sites talk to each other only through links.** A handoff is a URL. Anything a student
  wrote goes after the `#`, which browsers never send to a server; public posting text may go
  in the query string.
- **Each site still works alone.** A missing or malformed handoff parameter is ignored, never an error.
- **Third-party text is data.** Posting text crossing a site boundary is escaped on render and,
  wherever a model reads it, passed as data, never as instructions (see COB's README, "Security").
- **Shared look.** Dark, green-on-black, terminal-flavoured; BuildersBench's "Glass Terminal"
  system (`4Projects/.claude/skills/glass-terminal`) is the reference. ResumeCanvas has its
  own amber dossier look, which is fine as long as the shared cross-site bar reads as one family.

## Handoff contract

What each site accepts from the others. Add a row here whenever you add or change one.

| Target | Link | Carries | Status |
|---|---|---|---|
| BuildersBench | `/#path=<id>` | Opens one career path (`ai`, `cloud`, `cs`, `cyber`, `data`, `helpdesk`, `swe`, `tech-it`) | Works; COB links Cloud & DevOps here |
| BuildersBench | `/#project=<id>` | Opens one project | Works |
| BuildersBench | `/match.html?q=<posting text>` | Prefills Career Match with a job's title, summary and requirements | **Broken**: COB sends it (board and assistant), but `match.html` never reads `q`, so the student lands on an empty box |
| ResumeCanvas | `/?voice=1` | Starts voice dictation | Works |
| ResumeCanvas | `/#jd=<posting text>` | Opens match mode with the job description filled in | Planned |
| ResumeCanvas | `/#add-project=<title + bullets>` | Adds a BuildersBench project to the resume's Projects section | Planned |
| COB | `/#…` filters and `page=N` | Area, county, major, term and level filters, kept after the `#` (see COB's README) | Works |
| COB | `/assistant.html` | The assistant (private preview, not linked from the board) | Works |

## Where the links stand today

| From → To | COB | BuildersBench | ResumeCanvas |
|---|---|---|---|
| **COB** | — | Banner on every page; "Projects for this role" on tech-area cards (board and assistant) | None |
| **BuildersBench** | Hero button, partner card, footer | — | None |
| **ResumeCanvas** | None | None | — |

## Roadmap

Update the status column as work lands.

### Phase 1: connect the sites

| Step | Repo | Status |
|---|---|---|
| `match.html` reads `?q=` and runs the match on load | 4Projects | Not started |
| ResumeCanvas reads `#jd=` and opens match mode with it | resumecanvas | Not started |
| A shared bar linking each site to the other two | all three | Not started |

### Phase 2: the assistant becomes the guide

| Step | Repo | Status |
|---|---|---|
| The assistant has the BuildersBench catalog (id, path, title, skills) and names a project per gap | COB | Not started |
| "Tailor my resume" on each recommended card, opening ResumeCanvas with `#jd=` | COB | Not started |
| "Add to my resume" on each BuildersBench project, opening ResumeCanvas with `#add-project=` | 4Projects, resumecanvas | Not started |

### Phase 3: the assistant on every site

| Step | Repo | Status |
|---|---|---|
| An assistant entry point on BuildersBench and ResumeCanvas that hands the student back to COB's assistant with what they were doing (their path, or the job they are tailoring for) | all three | Not started |
| Decide when the assistant leaves private preview and is linked from the board | COB | Open question |

## Open questions for the owner

- When does the assistant go public (`ASSISTANT_URL` in COB's `template.html`)?
- Should the assistant eventually run inside BuildersBench and ResumeCanvas, or always hand
  the student back to COB?
- One domain for all three (for example subpaths or subdomains of one name), or three
  separate sites joined by links?
- Who is the primary audience beyond MDC students: all South Florida students, career
  changers, employers posting featured listings?
