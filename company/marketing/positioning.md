# Positioning

Draft. Derived only from docs/PRD.md (last revised 20 September 2026, status draft).
Nothing has shipped yet, so nothing below is a claim about a released product.

## Who it is for

People who read on the web for work and find the reading itself obstructed:
researchers, students, engineers, anyone comparing sources. The first user is Lloyd, and
the PRD's own test of every decision is whether he would rather use Mondrian than Chrome
for a day of real reading.

Not for people who want their browsing to look like the sites they visit, and not for
tasks that are fundamentally applications rather than documents.

## The problem, in their words

Reading on the web means accepting whatever layout a site imposes, and most layouts are
built to serve the site rather than the reader. The usual answers are partial. Reader
mode extracts an article and discards everything else, which fails on tables, forums,
documentation and video. Ad blockers remove what is paid for but leave the structure.
Neither lets you put two sources side by side, which is what actually happens when you
are deciding something.

## What Mondrian does about it

A desktop browser that renders no page as sent. Every document is pulled apart into
blocks and laid back out in one layout language, so the site supplies content and
structure while the browser supplies the layout. Tabs are the unit of composition: drag
one tab onto another and the two become a single page, with every block still traceable
to the source it came from.

The filter runs in front of paint, so there is no flash of the original layout and no
reflow happening in view. Nothing is silently dropped: whatever the filter removes is
counted, listed, and one click from being shown. Blocks are cached per URL so a second
visit is meant to render with no perceptible delay. The layout, the filter and the cache
are designed to work with no model connected at all; Claude, when connected, adds
composition, relayout and classification of pages that do not fit the block model.

## What it refuses to do

The non-goals are as much the pitch as the goals.

Not a Chrome replacement for everything. Applications, checkouts, maps and editors
escape to raw rendering by design, not as a gap to close later.

Not a rendering engine. Mondrian reclassifies and lays out what Chromium already gives
it. It does not parse HTML or paint text itself.

Not a summariser. Blocks are the page's own content, rearranged, not rewritten. On a
composed page, contradictions between sources are kept side by side rather than
resolved into one claim.

Not an agent platform. Claude steers the browser for composition and correction, not for
automating someone's browsing on their behalf.

No sync, no accounts, no telemetry in v1. The block cache stays local; there is no
server.

Not mobile. Desktop only, Windows first.

Not a credential manager. Mondrian never stores passwords or card numbers; people sign
in themselves, in a profile they chose.

## What is unverified

The PRD is explicit that this is a draft and that its measurable gates (classifier
accuracy on a 50-site corpus, escape hatch precision, the 400ms first-block budget, the
50ms cached second visit) have not been measured yet. Until they are, none of those
numbers belong in anything public. The PRD also flags as an open risk that too much of
the web may turn out to be an application rather than a document, which would narrow how
often Mondrian's own layout ever applies.

## The one sentence

Mondrian is a desktop browser that takes every page apart into blocks and lays them back
out in one layout language, so you read on your terms instead of the site's.
