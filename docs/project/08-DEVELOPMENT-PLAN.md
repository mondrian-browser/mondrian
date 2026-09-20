# Development plan

Decisions taken, the order of work, and what would make each stage fail. Written to be
argued with rather than followed.

**Settled so far.** Deterministic core with Claude optional and easy to plug in. Windows
first. Apache-2.0, free and open (ADR 0007). First milestone is proving the classifier on
50 real sites, in the order set out below: rules first, measurement second, model only if
the measurement says so (ADR 0010).

The licence section below is kept as the record of how that call was made. It is settled;
do not reopen it without a new ADR.

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

### The order of work, and why it is this order

Five steps. Each one can kill the milestone, and they are arranged so the cheapest
killer fires first.

**1.1 Capture the corpus.** 50 pages, several pages per site, stored as serialised DOM so
the loop is milliseconds rather than minutes. Capture through Mondrian, not `curl`, or the
corpus misses everything that renders client-side. Multiple pages per site is not
optional: cross-page repetition is the strongest chrome signal available and 1.3 depends
on it.

**1.2 Label it.** Ten block types per region, on every page. This is the step most likely
to stall the milestone, so do not do it by hand. Jev answers exactly this question and
reports how sure it is, so it labels in bulk and you review only the cases it flags. An
afternoon of checking rather than a week of typing. ADR 0009 records why Jev labels the
corpus but never runs on page load.

While it runs, keep the score. Nobody has published how well a decision model does
ten-way block typing on real pages, and by the time you have finished reviewing you will
know. TypeSafe's 76% is on unrelated generic tasks and Brave's 91% is an easier binary
question, so neither number transfers.

**1.3 Build the heuristic baseline.** Structural scoring only, no model: semantic HTML and
ARIA, cross-page repetition, link density, text-to-markup ratio, geometry from the
preload. Mozilla Readability (Apache-2.0) and Postlight Parser (MIT) encode years of this
and are to be read before anything is reinvented. Neither emits typed blocks, which is
the genuinely new part.

**1.4 Score it and read the failures.** Not just the headline number. Which types get
confused with which, and whether the confusions make sense. This is where the real risk
surfaces, and it is not the one people expect: the likely failure is not that accuracy is
too low, it is that **the ten types do not carve real pages at the joints**. A heuristic
that cannot separate two types shows you the feature values and therefore the reason. A
model would give you a slightly better number and no explanation, and you would spend
weeks collecting more data for a taxonomy problem.

**1.5 Then decide, and only then.** The failure analysis says which of three it is.
Heuristics are close, so write per-site rules for the tail and move to milestone 2.
Heuristics are weak but the types are sound, so train a classifier on the labels from 1.2.
The types themselves do not hold, so revise the taxonomy and repeat from 1.3.

If it is the training branch, the default should not be a language model. The task is
classification over structural features, so gradient boosted trees train on a few thousand
examples, run in single-digit milliseconds, ship as kilobytes, and can state which feature
decided a call. That last property is not a nicety. The concept promises nothing is
silently deleted and that a user can tell a bug from a decision, and an unexplainable
classifier cannot keep that promise in software whose job is discarding parts of pages.

### Decide what "right" means before measuring

Two levels, both defined before any number is quoted.

**Ground truth from 1.2** is the labelled corpus, and per-type precision and recall
against it is the real measure.

**Proxy metrics on all 50**, cheap enough to run on every change:

| metric | why |
|---|---|
| Did the main content survive? | compare kept text against Readability's extraction as a floor |
| Was reading order preserved? | headings in source order |
| Was navigation dropped? | link-dense repeated regions gone |
| Were tables kept intact? | row and column counts match source |
| Did anything get silently lost? | kept + dropped = total, always |
| Escape hatch correctness | apps escape, articles do not |

The last two protect the concept's promises, so they are assertions rather than metrics:
kept plus dropped must always equal total, and an article must never escape to raw.

### Why not a model in the hot path

The 380ms budget rules it out, and so does every other consideration. ADR 0009 has the
full reasoning for the hosted case. The short version: a hosted classifier sends every
page you read to a third party, needs an account and a network before anything renders,
and cannot fit the budget from Australia where a round trip alone costs 200ms. A local
classifier removes all three objections, which is why 1.5 leaves that door open.

There is one more reason the hot path stays deterministic regardless: **per-template
caching**. Sites keep their shape between visits, so classify a template once, cache it,
and almost every load is a cache lookup with no classifier at all. That makes classifier
speed close to irrelevant and classifier correctness everything, which is the opposite of
how this problem is usually framed.

**Claude, offline** remains the right use of a model here: look at pages the heuristics
scored badly and write per-site rules that then ship or cache. Improving the deterministic
path rather than standing in it.

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
