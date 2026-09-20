# Next

Start here. Updated 20 September 2026. Company roles and their run protocol are in `company/ROLES.md`.

Everything below is either blocked on the step above it or explicitly marked as parallel.
`docs/project/08-DEVELOPMENT-PLAN.md` has the reasoning; this file is just the order.

---

## A. Housekeeping, before anything else

Small, dull, and all of milestone 1 depends on it.

**A1. Done 20 Sep 2026.** Get the repo onto the machine as a repo. The working folder is currently files
without history. `mondrian.bundle` in it holds all 19 commits.

```
cd C:\Users\Lloyd\Documents\Claude\Projects
git clone ClaudeBrowser\mondrian.bundle Mondrian
cd Mondrian
npm install
```

Work in `Mondrian` from then on. Keep `ClaudeBrowser` until A3 passes, then delete it.

**A2. Done 20 Sep 2026.** Register the MCP server and restart. Outstanding since the rename.

```
npm.cmd run install-mcp
```

Then quit the Claude desktop app completely and reopen it. The tool list is cached at
app start, so `mondrian` tools will not appear until a full restart. This also clears the
dead `claude-browser` and `cbrowser` registrations.

**A3. Done 20 Sep 2026, 86 passed.** Run the suite on Windows. Expect 86 passed, 0 failed.

```
npm.cmd test
```

This has not run on Windows since the isolated-world, scriptlet, char-event, ref,
page_text and shadow-DOM changes. Windows has already caught one platform-specific bug
that passed on Linux, so this is not a formality. If anything fails, fix it before A4.

**A4. Done 20 Sep 2026, github.com/mondrian-browser/mondrian.** Publish. Create the GitHub repo, replace `USERNAME` in `package.json` URLs, push.
Apache-2.0 and the NOTICE file are already in place (ADR 0007).

---

## B. Milestone 1 — prove the design filter

The filter is the product. Everything downstream of it is a stylesheet. The point of this
milestone is to find out cheaply whether ten block types survive the real web.

**Gate: if the scorecard cannot be made to read well on 50 sites, the concept needs
rethinking rather than more engineering.**

**B1. Done 20 Sep 2026: 74 pages, 45 sites, 3,277 regions.** `npm run corpus:capture`,
list in `tools/corpus/pages.js`, files in `corpus/` (its README says what is in each).
Every page carries a first-guess tier (62 relayout, 6 skinned, 6 contained) **for Lloyd to
confirm before B2 labels**, since the coverage number on the scorecard comes from it.
Captured on purpose: a consent wall (Spiegel), a login wall (old.reddit), paywall fronts
(Economist, NYT), a metered Medium post, five applications and a PDF. `dom.html` carries
geometry as attributes so B3 can re-extract offline; `dom.html` and `shot.jpg` are
gitignored (public repo, other people's pages), `regions.json` and `meta.json` are in.

Extractor fixes that went in first, each found by the 20 Sep accuracy check or by the
capture itself: tiny fragments rejoin their sibling; H1 header zones split; layout tables
descend; long comments in a list stay one row; wrapper unwrapping no longer counts toward
the depth limit (GitHub was 5 regions, now 47); direct text in a split element is kept
(Paul Graham's essays were arriving with no essay); a zero-height body is walked (YouTube
was 0 regions); images carry alt text and size. No region cap.

Coarse spots to expect in B2: a Paul Graham essay is one 66k-char block (paragraphs are
`<br><br>`), the Hacker News thread is one region of 363 repeats, GitHub's repo header is
one lump (no H1, title not in its text). Not wrong, just big.

Screenshots needed a main-process change: Windows Chromium refuses `capturePage` on an
occluded window, and Mondrian sits behind the desktop app while Claude drives it.
`CalculateNativeWinOcclusion` is now disabled at boot in `app/main/main.js`.

**Frozen 20 Sep 2026**, tiers confirmed by Lloyd, see `corpus/FROZEN.md`.

The brief as written: 50 pages, **several pages per site**, serialised DOM stored on
disk. Capture through Mondrian so client-rendered content and shadow DOM are included;
`curl` would miss most of the web. Multiple pages per site is load-bearing, not tidiness:
cross-page repetition is the strongest chrome signal there is and B3 depends on it.

Spread beats favourites. News article, long-form essay, documentation page, reference
table, forum thread, video page, product listing, search results, government form, recipe,
PDF in a viewer, single-page app, paywalled article, cookie-walled page, and a few
deliberately awful ones. At least five that are genuinely applications, because the escape
hatch needs testing too.

Freeze it when it is captured. ADR 0008. (See "Not yet frozen" above.)

**B2. Done 20 Sep 2026: 3,277 regions labelled, 617 reviewed, 62 corrected, $0.63.**
`node tools/label/label.js` (reads `corpus/`, writes `labels.json` per page and
`corpus/labels-summary.json`); `node tools/label/review.js` lists the flagged, samples the
rest, scores judgements and `--apply` writes `final` into the labels. Judgements in
`tools/label/judgements/corpus-*.json`. **The number: 84% top label right, 97%
right-or-acceptable, 2.4% wrong**, weighted over the corpus (flagged 13% wrong, unflagged
1%). Flag-then-review holds. 88 of 100 types were used; unused: content_warning, math,
embed, calendar, download, cart, checkout, pricing_table, consent_gate, age_gate, popup,
unclear. Application score separated the five apps (0.85 to 0.96) from every document
(≤0.27), YouTube watch at 0.50.

What the review found, for `questions.js` before any relabel (do not relabel now; the
review is against these definitions):
- `heading` ↔ `section_nav` ↔ `title` is the main confusion. An h2 that is a section
  heading with an "all posts" link beside it (Spiegel) went to section_nav, account,
  pagination; an h1 went to heading three times. Sharpen: "title is the h1 or the largest
  heading naming the page; heading is any other heading, even with a link beside it".
- `byline` vs `teaser_card` on listing rows (HN subtext, NYT opinion cards): both are
  defensible, 40 cases. Either the extractor should keep a listing row whole, or the
  definition of teaser_card should say a row's metadata line counts as part of it.
- Text-less regions (a carousel arrow, a logo, a loading skeleton, an ad slot) are the
  bulk of the unsure and the low-confidence decoration/hero/version_switcher guesses.
  The labeller sees alt text and sizes now but still has little to go on; either give
  it the image list more prominently or accept `decoration` as the honest answer.
- Two definition gaps: a servings scaler (`1/2x 1x 2x`) has no type (went to
  version_switcher), and a "why you can trust us" box went to legal_notice, not
  disclosure.
- **Cross-origin iframes are not regions.** Spiegel's full-screen consent wall is a
  Sourcepoint iframe; the extractor emits nothing for an iframe with no text or images,
  so the wall is in the screenshot and absent from `regions.json`, and `consent_gate` was
  never chosen. Same for embedded videos, ad frames and social embeds. The extractor
  should emit an iframe as a region carrying its `src` host and size; a fix for B3, and a
  recapture of the affected pages after it, noted in `corpus/FROZEN.md` when done.

The brief as written: ten types per region across the corpus. Jev returns a typed
choice with a confidence number, so it labels in bulk and flags what it is unsure of.
Review only the flagged cases. An afternoon rather than a week.

Keep score while it runs. How well a decision model does block typing on real pages is
not a published number, and reviewing the output produces it for free.

Jev never runs on page load. ADR 0009 says why.

*Trial run 20 Sep 2026* (`node tools/label/trial.js`, six live pages, 137 regions): with
the ten types, 12% of regions fell below 0.5 confidence and the flagged ones were regions
with no fitting type, not confused ones. With 49 types (`tools/label/questions.js`), 7%
flagged, first-quartile confidence 0.80, median 0.94, 20 cents per fifty pages. The
document/application Noul separated Excalidraw (0.97) from five documents (0.02 to 0.05).
So the taxonomy is wide and the corpus decides its width, ADR 0013. Two things B1 must
supply that the trial pages lacked: plain data tables (`table` was never chosen) and
pages with paywalls, newsletter prompts, app nags and footnotes. The extractor in
`tools/label/extract.js` is the capture format to start from; drop its 40-region cap.

*Width search, same day* (19 pages, ~500 regions, `tools/label/compare.js` between runs):
49 types 10% flagged, median margin 0.82; 109 types 13%, with nine types that only stole
probability from common ones; 100 types after dropping those and sharpening six definitions
11%, median margin 0.83, true ties (top two within 0.1) 7% at every width. So width costs
nothing at the median and about five points of margin in the lower quartile, where a
second plausible type now exists; it buys reviews, filters, feedback, vote_controls, hero,
cta, testimonial, settings and forty more that had no name. The current list is the
100 in `questions.js`; `taxonomies/v49.js` and `v109.js` are kept for comparison.
Review routing should use the top-two margin, not raw confidence, once B2 calibrates it.

*Accuracy check, same day* (`tools/label/sample.js`, 150 random regions from the 100-type
run, judged by Claude, judgements in `tools/label/judgements/`): top label right 82%,
right-or-acceptable 93%, wrong 7%, three routed to Lloyd and settled. Wrong rate 5% where Jev was confident and 29% where it
flagged, so flag-then-review works. Of the eleven wrong, seven were the extractor (dates split
from their reviews, page headers merged into one lump: GitHub, Allrecipes, HN) or a definition overlap, four the
model. Image-only regions with no text are a blind spot: capture alt text and dimensions.

**B3. Heuristic baseline, no model.** Semantic HTML and ARIA, cross-page repetition, link
density, text-to-markup ratio, geometry from the preload. Read Mozilla Readability
(Apache-2.0) and Postlight Parser (MIT) first; both encode years of learning about what
counts as content. Neither emits typed blocks, which is the new part.

**B4. Scorecard.** `npm run classify` over the corpus: per-type precision and recall
against B2's labels, proxy metrics on the rest, and a diff against the previous run so
regressions show. The scorecard is the milestone deliverable.

Then read the failures, not just the number. Which types get confused with which, and
whether those confusions make sense.

**B5. Decide.** Three branches, and B4 says which. Heuristics close, so write per-site
rules for the tail and go to milestone 2. Heuristics weak but the types sound, so train on
B2's labels, defaulting to gradient boosted trees rather than a neural model. The types do
not hold, so revise the taxonomy and repeat from B3. ADR 0010.

---

## C. Parallel, do not leave to the end

**C1. Control socket.** `eval_js` and `ui_eval` are remote code execution by design, and
any local process can read the token from `.runtime/control.json`. Fine for a personal
tool, a genuine vulnerability in shipped software. Move to a named pipe with OS
permissions instead of a TCP port, and decide whether the steering commands ship enabled
at all in a consumer build. This gets harder the longer it sits.

**C2. Throwaway signed release.** Sign, install and auto-update a trivial build end to
end, long before there is something worth shipping. `electron-builder` plus
`electron-updater`. An OV certificate runs 200 to 400 a year and without one SmartScreen
warns every user on every download. None of it is interesting and all of it takes longer
than expected.

**C3. Name collision.** `Mondrian` is a Pentaho OLAP server and was Google's internal code
review tool. Neither is a browser so a legal problem is unlikely, but it costs search
results. Decide before there is a website.

---

## Not now

Milestones 2 (renderer and cache), 3 (the bar), 4 (composition) are in the development
plan and are all downstream of B4 reading well. Do not start them early. Building the
renderer against a filter that turns out to be wrong wastes both.

Added 20 Sep 2026, also milestone 2: the skinned and contained tiers (ADR 0011), the
per-profile steering setting and the credential store (ADR 0012). The credential store
additionally waits on C1. B1 should record which tier each corpus page would get, so the
coverage number exists from the first scorecard.
