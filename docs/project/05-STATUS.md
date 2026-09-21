# Status

As of 21 September 2026. Update this when the picture changes; a stale status file is
worse than none.

## Against the concept

`01-CONCEPT.md` describes the browser this is meant to become. Measured against it, the
honest position is: **the foundation is built and tested, and the design filter now runs on every page, in the relayout tier, as a first version.**

| concept | state |
|---|---|
| Design filter — parse, classify, order, lay out | **running** (21 Sep 2026): veiled at document-start, extracted and classified after the document settles, Mondrian's document rendered in a shadow root, the site's design never painted. 75–500 ms. `app/main/filter.js`, `app/filter/`, the preload. |
| Ten block types | 100 types on two axes (block, slot) plus a disposition (keep, demote, drop). Classifier: site directory (186 sites), trained trees, rules. 75% fine type, 90% keep/drop, 0.1% content lost, on unseen sites. |
| Dropped-elements index, one click from showing | in-page: set-aside blocks folded under the column, dropped ones listed with "show anyway"; `page_blocks` for Claude; a mark in the toolbar. |
| Three tiers per site (ADR 0011) | relayout runs; skinned and contained show the page as built and say so. Tier from a rule, the directory entry, or the default. The skinned stylesheet is not built. |
| Progressive block arrival with states | not started |
| Block cache, instant second visit | not started |
| The bar, six states | not started; the omnibox is a plain address bar today |
| Answering across open tabs | possible now through the MCP tools, not wired into the bar |
| Drag a tab onto a tab to compose | not started |
| `compose://` pages with per-block provenance | `page_create` is a rough ancestor: it composes real sites, but by framing them, with no blocks, provenance or conflict handling |
| Conflicts kept side by side | not started |
| Relayout in words | not started |
| Sources never thrown away, split back | not started |

What exists underneath it and works: the Electron shell, tabs, profiles, the rules engine,
ad and tracker blocking with scriptlets, the control socket and MCP bridge, the agent
(read, find, act, with shadow-DOM support and refs that survive re-renders), composed
pages by framing, and three test suites.

The most reusable pieces for the concept are `preload-page.js` — it already runs before
paint and already walks shadow DOM with stable refs, which is most of a parser's job — and
the rules engine, whose real purpose under the concept becomes per-site correction of the
classifier rather than hiding things with CSS.

## Versions

Electron 44.4.3 (Chromium 152), Node 22, `@ghostery/adblocker` 2.18, MCP SDK 1.30,
zod 3.25. CommonJS, no build step. 12 commits, 44 commands.

## Test suites

| suite | what it is | count | last result |
|---|---|---|---|
| `npm test` | fixtures, hermetic, fast | 86 | all passing (Linux) |
| `npm run test:sites` | 20 live sites, whole command set on each | 20 sites | 17/17 reachable clean, 3 skipped as bot walls |
| `npm run test:agent` | multi-step flows on live sites | 24 | all passing |

Every bug worth fixing so far came from the latter two. The fixtures pass because they
were built to; they are regression protection, not discovery.

The site suite distinguishes environment from breakage. The container is a datacentre IP
behind an egress proxy, so GitHub, npm and Amazon answer with bot walls and are reported
as skipped rather than failed. A suite that cries wolf gets ignored.

## Verified working, on Lloyd's machine, live

YouTube watch page: page hydrates, player reaches readyState 4, autoplay off, sidebar
recommendations 0, comments 0, Shorts links 0, Shorts nav entry 0, end screens 0, merch 0,
30 scriptlets injected with 0 failures. A Shorts URL redirects to the normal player.

Wikipedia: search box found by label, typed into, submitted with Enter, lands on the
article.

archive.org: 3,288 characters read through shadow DOM where it previously read none.

Ad blocking, measured in the container by request volume with blocking off then on:
smh.com.au 240 to 105, theage.com.au 233 to 106, speedtest.net 122 to 36. Mostly cascade —
killing one tag manager prevents dozens of downstream calls.

Scriptlets on real sites: 5 injected on bild.de, 6 on tomshardware.com.

## Not verified

**The suites have not been run on Windows since the overnight changes.** This is the main
gap. Windows has already caught one platform-specific bug (`file://` paths), so it matters.
`npm.cmd test` is the first thing to run.

**Element hiding on live ad slots.** Ad-element probes find nothing to count on a
datacentre IP, in either state, so the element-hiding half of ad blocking is unproven
from the container. `tests/adblock-check.js` re-measures it anywhere.

**Signed-in behaviour.** Everything tested so far is signed out. The browser has its own
cookie jars, so signing into YouTube in it is a separate act from being signed in on
Chrome. Nothing about a signed-in session has been checked.

## Known rough edges

- Filter-list selectors rot. When Clean YouTube stops working, A/B it with
  `node tests/youtube-ab.js` rather than guessing at selectors.
- No find-in-page bar (Ctrl+F). No downloads UI, though downloads work.
- `window.open` always becomes a tab, never a popup window.
- archive.org renders nothing in the container even with blocking fully off. Environment,
  not the browser; it reads fine on Lloyd's machine.
- Scriptlets are on by default and are the most likely thing to break a site.

## Decisions the concept still needs

Listed in full at the end of `01-CONCEPT.md`. The one that changes the architecture most:
**380ms to first block is not a model round trip**, so Claude cannot be in the hot path
for every page load. The workable shape is a deterministic classifier for the common case,
with Claude refining hard pages and writing per-site rules that then get cached, and
Claude fully in the loop for composition and relayout, which happen on a gesture.

## Deliberately not built

Credential storage for Lloyd's real accounts, and anything touching card numbers. The
reasoning is in `docs/ROADMAP.md` and it is a design position, not a missing feature:
Claude may act with his sessions, never with his secrets. A browser that cannot spend
money cannot be talked into spending money, and prompt injection is unsolved.

Also not built: pages that obey instructions found in their own content. Page text is
data, not instruction. A browser that follows page content is one any site can steer.
