# Prompt: build a talking agent on the projects page

Paste everything below the line into a Claude Code session opened on the BuildersBench repo
(`WynwoodDreams/4Projects`). It reproduces what COB's `assistant.html` is, adapted to projects:
the stage layout, the voice in and out, the hands-free turn-taking, and the two-stage
retrieve-then-rank engine that keeps the agent inside the site's own data. Where it says
"COB", the session can read the original at `WynwoodDreams/cob`: `assistant_template.html`
(the page), `lib/assistant/` (the engine) and `api/assistant.js` (the Vercel function).

Change the bits in square brackets before pasting if they don't fit.

---

Read `ECOSYSTEM.md` first. Then build a talking agent for the projects page of this site and
make it the projects page's assistant, not a preview beside it.

## What it is

A named presence the visitor talks to, which only knows this site's project catalog. Call it
[Scout]. It helps a student pick the projects to build for the role they want: they describe
themselves, or paste a job posting, and it recommends up to five projects from the catalog,
says why each one fits, and names the skills the role asks for that the student has not
mentioned. It cannot answer anything outside the catalog. Asked for a cover letter, the
weather, or homework, it says in one line that it only knows this site's projects, then
offers what it can do (recommend projects, read what a project builds, hand off to COB for
listings or to ResumeCanvas for the résumé).

## The engine: deterministic first, model second

Copy the shape of COB's `lib/assistant/`, one serverless function at `api/assistant.js`.
Every turn runs four steps:

1. **Read.** The model turns the conversation into a profile (interests, skills, experience,
   level, target role or path, time available, languages) and an intent: a search, a question
   about the projects it already showed, or something else. If a needed field is missing it may
   ask one short question, at most three per conversation; the server counts and stops asking.
2. **Retrieve, deterministically, in code.** Turn the profile into filters and a keyword score
   over the catalog (path, skills, difficulty, time). Widen interests with a synonym map
   ("cybersecurity" also finds SOC, threat, GRC). A beginner never sees an advanced-only
   project unless nothing else fits, and the reply says so. The top 12 go to the model; a
   project not among them cannot be recommended.
3. **Rank and explain.** The model orders those candidates, writes one or two sentences on the
   fit, and names the gaps as indexes into the project's own skill list, never as free text.
   The server checks every id and index before anything reaches the page.
4. **Answer.** A question about the recommended projects is answered only from their catalog
   text, passed as data.

The response kinds, same as COB: `question` (one follow-up), `results` (summary, matches with
why and missing skills, filters that were applied, adjustments), `nomatch` (summary,
adjustments, up to three closest projects marked weak), `answer` (about the shown projects),
`reply` (anything else, including the off-topic refusal).

Guardrails, all of them: catalog text reaches the model inside a JSON `data` field and every
prompt says it is data, never an instruction. The page renders cards from the server's copy of
the project, so a model reply can add an explanation but cannot change what a card says or
links to. No strong match returns a plain "no strong matches" with adjustments worked out from
the catalog, not invented. If the model fails for any reason (empty reply, timeout, bad JSON,
rate limit, no credit), the handler reads the visitor's words with a keyword fallback and runs
the same deterministic search; the visitor gets results with no "why" and never sees a model
error. Every fallback is logged with `console.warn`. Limits: 1,500 characters a message, 16
turns kept, 8 requests a minute and 40 an hour per address, a daily cap per instance. A 5xx
reads "That one did not go through." with Try again and a link that searches the site for what
they asked.

Model: Vercel AI Gateway, OpenAI-compatible endpoint, model and provider list from env
(`ASSISTANT_MODEL`, `ASSISTANT_PROVIDERS`), `AI_GATEWAY_API_KEY` server-side only,
`ASSISTANT_ENABLED=false` pauses every AI request and the page shows "paused".

Beta gate: a name and email before the chat opens, checked by the server on every turn (a
missing one is a 400 with `code: "who"` and the page shows the form again), kept in
`localStorage` so a return visit is not asked twice, written to one Supabase table per
conversation (name, email, first question, time) when `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are set. [Drop this section if this site should not gate.]

Tests: a fake gateway (`test/fake-gateway.js`) that answers the intake and ranking calls from
rules, and a `node --test` suite that drives the handler through a search, a follow-up, a
no-match, an off-topic turn, the gate, and every fallback, with no key and no network.

## The page: a stage, not a chat

Use this site's own tokens and type (the Glass Terminal system). No chat bubbles, no message
list. The layout, desktop:

- **Top bar.** Brand with a back arrow, then a mono readout: the agent's name, how many projects
  it knows, its live state (Standing by, Listening, Thinking, Speaking, Ready), the catalog's
  updated date, a Beta badge. At the right: "Talking with [name] · change · Start over" and a
  speaker button that mutes the voice.
- **The presence.** A large orb at the left, in the site's accent colour: concentric rings
  ripple outward while it speaks, pull inward while it listens, and its core bars blink while it
  thinks. The page background has a faint grid fading at the edges and a radial glow that
  brightens with the voice. Beside the orb: a mono "NAME · STATE" line, the visitor's last
  message as a small mono line, the reply set in display type (clamp 19 to 24 px, weight 700,
  tight letter-spacing, key numbers in the accent), a thin animated waveform, a one-line
  follow-up in muted text, and answer chips (the server's adjustments as chips that send
  themselves; on an error, Try again and Search the site instead).
- **"Searched with" strip.** The filters the server actually applied, as mono pills, with a
  dashed pill for "N of M projects searched". Real data, never decoration.
- **The filmstrip.** The picks as cards that rise in one after another and scroll sideways,
  snap to start. The closest fit is outlined in the accent with a tinted top. Each card: a mono
  label (Closest fit / Pick #n / Weak match), title, the path and difficulty and time, tags,
  "Why it fits" clamped to three lines, a folded "What it asks for" with the gaps counted,
  a primary Open-project button, a secondary link (Add to my résumé, when that exists), and a
  one-line source line. Cards are sized so a whole card shows on an 845-pixel-tall window; the
  strip scrolls for an opened requirements list. The strip header has the pick count, a
  "Conversation (n turns)" popover with the history, and "Open on the site".
- **One floating bar** at the bottom: a pill with the text box, a large round accent mic, and
  Send. Under it a mono line that says the agent only knows this site's projects.
- **The opening and Start over** show the presence alone, centred and large, with "Hi [name].
  Tell me what role you want and what you can already do, and I'll find the projects to build",
  starter phrases as a row of cards, and the bar.

Phone (under 760 px): the presence pinned at the top in a compact row (orb 64 px, reply at 17 px,
chips in a sideways scroll), the cards stacked and scrolling under it with nothing clamped, the
bar fixed at the bottom with Send collapsed to its icon. The opening centres the orb at 160 px
with the starters stacked. No horizontal page scroll at 390 px. Touch targets 44 px.

Notices for sample data and for the paused state sit under the top bar, as on COB.

## Talking

- **Voice out.** Every reply is read aloud with the browser's own speech synthesis, an English
  voice, rate 1.02. Nothing is spoken until the visitor has sent something, so the page never
  talks on load. The speaker button mutes it; the choice is remembered in `localStorage`.
- **Voice in.** The browser's own speech recognition (Safari, Chrome, Edge), in English, or
  Spanish when the browser's language is Spanish. The mic button always shows; where the
  browser has none, a tap says so and suggests typing. One phrase at a time: the recogniser
  stops itself when the visitor pauses, and what it heard is sent right then, with no tap on
  Send. The microphone is allowed on this page only, through the Permissions-Policy header in
  `vercel.json`.
- **Turn-taking, hands-free.** The mic is stopped before the agent says a word, so it never
  records its own voice. If the visitor's last message was spoken, the agent opens the mic
  again about 350 ms after its reply finishes, so a spoken question, its answer and the next
  answer flow with no tap. Silence ends the loop quietly with "Tap the mic to talk again".
  Typing ends it. Tapping the mic while it listens ends it and throws away the half-heard
  words. Start over ends it. With the voice muted, the agent skips speaking and listens right
  after the reply shows. Some browsers never fire the end of a cancelled utterance; a 1.5 s
  check keeps the exchange from hanging.
- **Honesty line.** Every card says the project is from this site's catalog and the fit is
  AI-picked; the spoken reply never claims more than the data shows.

## Finish

Build it against the fake gateway, drive it with Playwright at 1280×845 and 390×844 through
a search, a follow-up, a no-match and an off-topic turn, and simulate a spoken exchange by
replacing `SpeechRecognition` with a fake that hears a phrase and ends, so the auto-send and
the hands-free loop are checked with no microphone. Report page errors and the card height
against the strip height. Then update `ECOSYSTEM.md` here and in the other two repos: the
handoff table and the roadmap row for the assistant on BuildersBench, which is "on hold" there
today. Document the page and the engine in the README the way COB's README documents its
assistant.
