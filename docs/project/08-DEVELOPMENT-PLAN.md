# Development plan

Decisions taken, the order of work, and what would make each stage fail. Written to be
argued with rather than followed.

**Settled so far.** Deterministic core with Claude optional and easy to plug in. Windows
first. First milestone is proving the classifier on 50 real sites. Licence undecided.

---

## The licence question

You asked whether free-but-closed is a bad idea. It is not a bad idea, it is legal, and
plenty of good software ships that way. For this project specifically there are three
consequences worth weighing.

**Your dependencies allow it.** Checked, not assumed: 91 MIT, 10 MPL-2.0, 9 ISC, 4 BSD,
1 Apache-2.0. Ghostery's engine is MPL-2.0, which is file-level copyleft — shipping it
closed is fine as long as you do not modify Ghostery's own files. Mondrian already wraps
that engine rather than forking it, so this stays clean. Keep it that way.

One real obligation: Electron bundles FFmpeg, parts of which are LGPL. A closed-source
Electron app has to let users relink those components and provide their source. Every
commercial Electron app deals with this; it is paperwork, not a blocker.

**Trust is the awkward part.** A browser sees everything you type and read. An ad-blocking
browser that reformats pages is asking for more trust than most software, and the
concept's central promise — "nothing is silently deleted" — is exactly the kind of claim
people want to verify rather than believe. Closed source makes that claim unfalsifiable.
That is a real cost for this product in a way it would not be for, say, a drawing app.

**Free and closed is the least sustainable combination.** You carry signing, the Chromium
update treadmill and support, with no revenue and no contributors. Free and open at least
buys you contributors. Paid and closed at least buys you money. Free and closed buys
neither.

If you want to keep the commercial door open without the trust cost, source-available is
the middle path: code public and auditable, commercial use reserved to you. It gets most
of the trust benefit and gives up little you are likely to want.

**Recommendation:** open source the browser under MIT or Apache-2.0, keep the trademark,
and if there is ever a paid product, make it a hosted service rather than the binary.
But this is a genuine judgement call and free-and-closed is a defensible answer. Decide
before the first public release, not after; relicensing later is painful and relicensing
away from open is effectively impossible.

---

## Milestone 1 — prove the classifier

Everything downstream of the design filter is a stylesheet. The filter is the product.
The purpose of this milestone is to find out, cheaply and early, whether ten block types
survive contact with the real web.

**Gate: if the classifier cannot hit the bar below on 50 sites, the concept needs
rethinking rather than more engineering.** Getting that answer in weeks rather than
months is the whole point of doing this first.

### Build a frozen corpus first

Do not develop a classifier against live sites. This session already showed why: bot
walls, captchas and rate limits made a third of the site suite unreachable from one IP,
and every run took minutes. Classifier work needs a loop measured in milliseconds.

So: capture 50 pages once, store the serialised DOM, and iterate offline. `page_read` and
the preload already walk shadow DOM, so capture through Mondrian rather than `curl` —
otherwise the corpus misses everything that renders client-side, which is most of the web.

Corpus composition matters more than its size. Aim for spread rather than favourites:
a news article, a long-form essay, a documentation page, a reference table, a forum
thread, a video page, a product listing, a search results page, a government form, a
recipe, a PDF-in-a-viewer, a single-page app, a paywalled article, a cookie-walled page,
and a few deliberately awful ones. Include at least five pages from sites that are
genuinely applications, because the escape hatch needs testing too.

### Decide what "right" means before measuring

This is the part that gets skipped and then poisons everything. Two levels:

**Hand-labelled ground truth on 10 pages.** Tedious, and the thing most likely to stall
this milestone. For each page, write down what the blocks should be.

TypeSafe's Jev can carry most of this: Choice over the ten block types returns a decision
with confidence, so it can label the corpus in bulk and route only the low-confidence
cases to you for review. Days of labelling becomes an afternoon of checking. Doing it
this way also produces the measurement in the next paragraph for free, and ADR 0009
records why it stays out of the page-load path.

**Measure the decision model while you are there.** Running Jev over the same corpus
tells you how well a decision model does this specific task. Nobody has published that
number: TypeSafe's 76% is on generic workflow evaluations, and Brave's 91% is on a binary
readability question, which is easier than ten-way typing. If Jev turns out to be strong
here, it changes what the heuristics have to carry and is worth knowing early. If it is
weak, that is worth knowing earlier still.

**Proxy metrics on all 50**, cheap enough to run on every change:

| metric | why |
|---|---|
| Did the main content survive? | compare kept text against Readability's extraction as a floor |
| Was reading order preserved? | headings in source order |
| Was navigation dropped? | link-dense repeated regions gone |
| Were tables kept intact? | row and column counts match source |
| Did anything get silently lost? | kept + dropped = total, always |
| Escape hatch correctness | apps escape, articles do not |

The last two are the ones that protect the concept's promises, so they are assertions,
not metrics: kept plus dropped must always equal total, and an article must never escape
to raw.

### Classify with signals, not a model

The 380ms budget rules out a model in the hot path. In rough order of power:

- **Semantic HTML and ARIA.** `article`, `nav`, `table`, `figure`, `role=main`. Free and
  often correct on sites that care.
- **Repetition across pages of the same site.** The strongest chrome signal there is: a
  region that appears identically on three pages of a site is navigation, header or
  footer. Needs the corpus to hold several pages per site, so plan for that now.
- **Link density and text-to-markup ratio.** Classic Readability heuristics, well
  understood, MIT/Apache prior art to read rather than reinvent.
- **Geometry.** The preload has layout information the DOM alone does not: what is
  actually visible, what is fixed-position, what is off-screen.
- **Per-site rules.** The existing rules engine, doing the job it is actually suited to:
  correcting the classifier where heuristics lose.
- **Claude, offline.** Not on page load. Claude looks at pages the heuristics scored
  badly, and writes per-site rules that then ship or cache. This is the right use of a
  model here: improving the deterministic path rather than standing in it.

Prior art worth reading before writing: Mozilla Readability (Apache-2.0), Postlight
Parser (MIT). Neither gives typed blocks, which is the new part, but both encode years of
learning about what counts as content.

### Deliverable

`npm run classify` produces a scorecard over the corpus: per-type precision and recall on
the labelled pages, proxy metrics on the rest, and a diff against the last run so
regressions are visible. That scorecard is the milestone. Ship nothing else until it
reads well.

---

## Milestone 2 — renderer and cache

Only once the scorecard is good. Comparatively easy: ten known block types, one layout
language, one measure.

The two things that are not easy: progressive arrival that looks deliberate rather than
janky, and the block cache being genuinely instant on second visit. Both are the
difference between a clever demo and something that feels like a browser.

Cache rules from the concept, which are also privacy rules: per URL, background refetch
when the source moved, and **nothing cached from a logged-in page**. That last one needs
a decision on how logged-in is detected; a session cookie is the obvious signal and it is
imperfect.

## Milestone 3 — the bar

Six states, and the `https://` button as the only mode switch. Mostly UI work, with one
substantial piece behind it: answering across open tabs, which means the block cache is
the retrieval corpus. That is a nice consequence of milestone 2 rather than new work.

## Milestone 4 — composition

Drag a tab onto a tab. The rules that keep it trustworthy are the specification: sources
never thrown away, every block carrying its origin, contradictions kept side by side
rather than averaged, four sources maximum, split-back returning the originals untouched.

This is where Claude genuinely belongs, because it happens on a gesture rather than on
every page load, so a second of thinking is acceptable.

---

## The parallel track: hardening

Do not leave this to the end. Two items are baked into the current design and get harder
to change the longer they sit.

**The control socket is remote code execution by design.** `eval_js` and `ui_eval` run
arbitrary code, and any local process can read the token from `.runtime/control.json`.
That is a fair trade for a personal tool and a genuine vulnerability in shipped software.
Before any public release: bind to a unix socket or named pipe with OS-level permissions
rather than a TCP port, and consider whether the steering commands ship enabled at all in
a consumer build. A browser that ships a localhost RCE endpoint will deserve the write-up
it gets.

**Bring-your-own-Claude, two paths, neither required.** The MCP path you use now costs
the user nothing and handles no keys, so it stays the primary. An API key pasted into
settings is the fallback for people without the desktop app. The deterministic core has
to work with neither, and the UI has to make that obvious rather than nagging.

**The Chromium treadmill.** Electron majors land roughly every eight weeks and carry
Chromium security fixes. Shipping means tracking them. Budget for it or do not ship.

## Distribution, when there is something to distribute

Windows first, as decided. An OV code signing certificate is roughly 200 to 400 a year
and without one SmartScreen will warn every user on every download. `electron-builder`
plus `electron-updater` is the well-trodden path and handles signing, installers and
auto-update. None of this is interesting work and all of it takes longer than expected,
so do a throwaway end-to-end release early — sign, install, auto-update a trivial build —
rather than discovering the friction when there is something worth shipping.

## The name

`Mondrian` is taken twice in software: Pentaho ships a Mondrian OLAP server, and Google's
internal code review tool was called Mondrian. The painter died in 1944 so the work is
public domain in most jurisdictions, and the estate is active about commercial use of the
imagery rather than the name. Neither existing use is a browser, so a collision is
unlikely to be a legal problem, but it will cost you search results. Worth a decision
before there is a website, not after.

---

## What would make this fail

Honest list, roughly in order of likelihood.

**The classifier is mediocre and the browser is subtly wrong on too many pages.** This is
the main risk and it is why milestone 1 exists. A filter that is right 80% of the time is
worse than no filter, because you stop trusting what you read.

**Interactive pages.** Ten block types describe documents. Much of the web is software.
The escape hatch is the right answer, but if it fires on a third of your browsing then
Mondrian is a reader mode with extra steps.

**Scope.** This is a browser. The maintenance tail is permanent and the interesting part
is perhaps a fifth of the work.

**Solo and unpaid.** Free and closed maximises this risk, which is most of why the
licence question above is not academic.
