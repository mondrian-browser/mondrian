# Mondrian — product requirements

The guiding document. What Mondrian is, who it is for, what counts as success, and
explicitly what it is not. Everything else in `docs/` is downstream of this.

Status: draft. Last revised 20 September 2026.

---

## What it is

A desktop browser that renders no page as sent. Every document is pulled apart into
blocks and laid back out in one layout language, so the site supplies content and
structure while the browser supplies the layout. Tabs are the unit of composition: drag
one onto another and the two become a single page.

## The problem

Reading on the web means accepting whatever layout a site imposes, and most layouts are
built to serve the site rather than the reader. The usual answers are partial. Reader
mode extracts an article and discards everything else, which fails on tables, forums,
documentation and video. Ad blockers remove what is paid for but leave the structure.
Neither lets you put two sources side by side, which is what actually happens when you
are deciding something.

## Who it is for

People who read on the web for work and find the reading itself obstructed. Researchers,
students, engineers, anyone comparing sources. The first user is Lloyd, and the test of
every decision is whether he would rather use Mondrian than Chrome for a day of real
reading.

Not for: people who want their browsing to look like the sites they visit, and not for
tasks that are fundamentally applications rather than documents.

## Goals

1. **One layout language across every site.** A recipe blog, a documentation page, a
   forum thread and a video page arrive as the same set of block types in the same
   measure and rhythm.
2. **The site's layout never reaches the screen.** The filter runs in front of paint. No
   flash of the original, no reflow in view.
3. **Nothing is silently deleted.** Everything dropped is counted, listed, and one click
   from being shown.
4. **Instant on return.** Blocks are cached per URL. Second visit renders with no
   perceptible delay while a background check refetches if the source moved.
5. **Composition without configuration.** Drag one tab onto another and a single page is
   built from both. No dialog, no options, correct it in words afterwards.
6. **Works with no model at all.** The filter, the layout and the cache are deterministic.
   Claude adds composition, relayout and hard-page classification when connected, and
   nothing breaks when it is not.
7. **Honest about what it cannot do.** Pages that only work as built render raw and say
   so, rather than being reformatted into something broken.

## Non-goals

Stated so they can be pointed at when scope creeps.

- **Not a Chrome replacement for everything.** Applications, checkouts, maps and editors
  escape to raw rendering. That is the design, not a gap to close.
- **Not a rendering engine.** Mondrian reclassifies and relays out what Chromium gives
  it. It does not parse HTML or paint text itself.
- **Not a summariser.** Blocks are the page's own content, rearranged. Claude never
  rewrites a source into its own words on a normal page load, and composed pages keep
  contradictions side by side rather than resolving them.
- **Not an agent platform.** Claude steers the browser for composition and correction.
  Automating someone's browsing on their behalf is a different product.
- **No sync, no accounts, no telemetry** in v1. The block cache is local. There is no
  server.
- **Not mobile.** Desktop only.
- **Not a credential manager.** Mondrian never stores passwords or card numbers. Users
  sign in themselves, in a profile they chose.

## Success criteria

**v1 ships when** a week of ordinary reading happens in Mondrian without reaching for
another browser, except for pages that deliberately escape.

Measurable gates before that:

| gate | bar |
|---|---|
| Classifier accuracy | on a 50-site corpus, main content kept on every page, navigation dropped on every page, tables structurally intact, reading order preserved |
| Escape hatch precision | no article escapes to raw; no application is reformatted |
| Nothing lost | kept blocks plus dropped items equals source elements, on every page, asserted not measured |
| First block | under 400ms on a cold visit, on a mid-range machine |
| Second visit | under 50ms from cache |
| Composition | two sources merged in one gesture, every block traceable to its origin, split-back returns the originals unchanged |
| Stability | no crash in a week of daily use |

## Constraints

- **Windows first.** macOS and Linux after, not never.
- **Free and open source.** Apache-2.0. No paid tier in v1.
- **Solo development.** Anything requiring a team is out of scope by definition.
- **No model in the hot path.** The 400ms budget is a hard constraint on the
  architecture, not an aspiration.
- **Chromium security updates are a standing obligation.** Shipping means tracking
  Electron releases.

## Risks

Ordered by how likely they are to end the project.

**The classifier is mediocre.** A filter that fails visibly is safe, because you stop
using it. A filter that is right most of the time is dangerous, because you keep trusting
it and never notice what it removed. This is why the first milestone measures accuracy
before anything downstream is built.

**Too much of the web is an application.** If the escape hatch fires on a third of real
browsing, Mondrian is reader mode with extra steps.

**Maintenance outlasts enthusiasm.** A browser has a permanent tail of Chromium updates
and site breakage. Open source is partly a hedge against this.

**Interactive blocks.** Forms and controls have to be re-emitted as working controls
bound to the original page. This is the hardest of the ten block types and it is not
optional, because a page you cannot use is not a page.

## Open questions

Tracked in `01-CONCEPT.md`. The ones that change the architecture:

1. How is a logged-in page detected, given that caching and composition both depend on it?
2. Where exactly is the line between a document and an application?
3. How are form controls re-emitted so they still work?
4. Can video be re-hosted inside a block on sites that resist embedding?
