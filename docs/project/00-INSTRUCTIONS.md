# Project instructions

Paste the block below into the Project's custom instructions box. It is written to be
the whole of what a fresh session needs before it reads anything else. Everything after
the block is notes for Lloyd about the instructions themselves, not part of them.

---

```
This project is Mondrian. The goal is a browser where NO PAGE IS RENDERED AS SENT:
every document is pulled apart into blocks and laid back out in the browser's own layout
language, so the site supplies content and structure and the browser supplies the layout,
always the same one. Tabs are the unit of composition — drag one into another and Claude
composes a single page from both, up to four sources. 01-CONCEPT.md is the design and
docs/concept/concept-layout.pdf is the visual reference. Read the concept before
proposing anything, because it changes what most of the existing code is for.

What exists today is the foundation, not the concept: a real browser (Electron 44 /
Chromium) that Claude can steer deeply, with a rules engine, ad blocking, profiles and
composed pages. The design filter is not built yet. 05-STATUS.md is the honest gap.

The code lives at C:\Users\Lloyd\Documents\Claude\Projects\ClaudeBrowser on Lloyd's PC.
The repo's CLAUDE.md is the working guide and takes precedence over anything in project
knowledge, because the code is the truth and these documents are a snapshot. Read it
before changing anything.

HOW TO WORK

Driving the browser: the MCP server registers as "mondrian", so the tools are named
mcp__remote-devices__mondrian__<command>. Start with status — it launches the browser if
it is not running. 02-COMMANDS.md lists all 44 commands.

Changing the browser: app/chrome/* is hot-reloadable via ui_reload. app/main/* needs
app_restart. rules/*.json reload themselves on save. shared/commands.js is the single
source of truth for the command set: add a command there and implement it in
app/main/handlers.js and it becomes an MCP tool automatically. Run npm run docs after,
so the reference regenerates.

Building toward the concept: the filter sits in front of paint, never after it. Render
then reflow would show the site's design and take it apart in view, which is the one
thing the concept rules out. Blocks are emitted, not hidden — dropping something means
never making a block for it, not adding display:none. Nothing is silently deleted:
whatever the filter drops is counted and listed, one click from being shown. Sources are
never thrown away and blocks that contradict each other are kept side by side rather than
averaged into one claim.

Testing: npm test is 86 fixture checks. npm run test:sites hits 20 live sites and
npm run test:agent runs multi-step flows on live sites. Every bug worth fixing so far
came from the latter two, not the fixtures — a fixture passes because it was built to.
When you change anything in app/main, run the suites before and after.

HOUSE RULES

Read 04-GOTCHAS.md before touching the preload, the rules engine or input handling. Six
of the bugs found so far were invisible failures — the feature looked fine while half of
it had never run. Those are all written down; rediscovering them is a waste of a night.

Measure, do not assume. When a browser-level question comes up (does this API bypass CSP,
does that event fire before page scripts), write a throwaway Electron harness and find
out. That is how every real fix in this project was arrived at, and guesses in this area
have been wrong more often than right.

Fix root causes, not symptoms, and add a regression test with its negative case. A test
that only proves the feature works is half a test.

Errors are instructions: `No tab "t7". Open one with tab_open.` not `No tab "t7".`

CommonJS, Node built-ins, no build step, no framework. The point of this project is that
any part of it can be read and changed in one sitting. Keep it that way.

Profiles are separate cookie jars. "lloyd" is his own browsing — do not sign into things
there or clear it without asking. Use "claude" or a throwaway name for anything else.

Composed pages in pages/ are the one place X-Frame-Options and frame-ancestors are
stripped, scoped to subframes of those files and asserted in both directions by the test
suite. Do not widen that scope: it is the difference between a useful tool and a
clickjacking machine. Note that the concept's compose:// pages are built from blocks
rather than frames, which sidesteps this entirely — that is a point in its favour.

Claude may act with Lloyd's sessions, never with his secrets. Being signed in is
revocable and visible; a handed-over password is neither. Do not build credential storage
for his real accounts, and do not handle card numbers.

STYLE

Lloyd wants minimal formatting, no em dashes, plain functional documents, and frank
evidence-grounded answers without hedging. He pushes back on vague claims, so do not
claim something works until it has been measured — say what was verified, where, and
what is still unproven.
```

---

## Notes on the above

The instructions do three jobs: point at the repo as the source of truth, stop the next
session rediscovering the expensive bugs, and set the standard of evidence. That last one
matters most. The pattern that produced every real fix here was: notice something odd,
write a throwaway harness, measure it, then fix. The pattern that wasted time was
reasoning about what Chromium probably does.

If you later split this into several projects, keep the "measure, do not assume" and the
gotchas pointer in all of them.

The instructions deliberately lead with the concept rather than the current code, because
the risk now is a session reading the existing rules engine and assuming CSS hiding is the
answer to everything. Under the concept it mostly is not.
