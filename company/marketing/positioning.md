# Positioning

Draft. Derived only from docs/PRD.md (status draft, last revised 20 September 2026,
evening). Nothing has shipped yet, so nothing below is a claim about a released product.

This replaces the first version, which was written against the PRD before the three
rendering tiers (ADR 0011) and the per profile credential boundary (ADR 0012). The old
version said Mondrian was not a Chrome replacement and never stored credentials. Both
are now wrong, and both were load bearing, so the whole page is rewritten rather than
patched.

## Who it is for

People who read on the web for work and find the reading itself obstructed.
Researchers, students, engineers, anyone who compares sources before deciding
something. The first user is Lloyd, and the PRD's test of every decision is whether he
would rather use Mondrian than Chrome for a day of real reading.

It is also for people who want an AI agent to have deep access to what they browse and
who want to be told plainly what that means. The PRD says it out loud rather than in a
footnote: Mondrian hands Claude the page. Being explicit about that is part of the
offer, not a disclaimer attached to it.

Not for people who want their browsing to look like the sites they visit.

## The problem, in their words

Reading on the web means accepting whatever layout a site imposes, and most layouts are
built to serve the site rather than the reader. The usual answers are partial. Reader
mode extracts an article and discards everything else, which fails on tables, forums,
documentation and video. Ad blockers remove what is paid for but leave the structure.
Neither lets you put two sources side by side, which is what actually happens when you
are deciding something.

And the partial answers make you keep two browsers. The reading tool handles the
articles; everything else goes back to the browser you were trying to get away from.

## What Mondrian does about it

A desktop browser that renders no page as sent. Every document is pulled apart into
blocks and laid back out in one layout language, so the site supplies content and
structure while the browser supplies the layout. A recipe blog, a documentation page, a
forum thread and a video page arrive as the same block types in the same measure and
rhythm. Tabs are the unit of composition: drag one onto another and the two become a
single page, with no dialog and no options, corrected in words afterwards.

It is one browser, not a reading mode, because every page gets a tier and the tab says
which one. Relayout is for documents, and the target is as many sites as possible.
Skinned is for pages that resist relayout: the site's own layout and behaviour, in
Mondrian's type, colour and spacing. Contained is for pages that resist even that: the
page runs exactly as built, as one large block inside Mondrian's frame, so it still
composes and the dropped content panel still works. No tier is a failure state, and
moving a site up a tier is ordinary work. Mail, maps, editors and checkouts run in
Mondrian too, which is what makes a second browser unnecessary.

Three properties follow from how it is built rather than from good intentions. The
filter runs in front of paint, so there is no flash of the original layout and no
reflow happening in view. Nothing is silently deleted: whatever the filter drops is
counted, listed, and one click from being shown. Blocks are cached per URL, so a second
visit is meant to render with no perceptible delay while a background check refetches
if the source moved.

It works with no model connected at all. The filter, the layout and the cache are
deterministic. Claude adds composition, relayout and the classification of pages that
do not fit the block model, and nothing breaks when Claude is absent.

The agent has a boundary with a shape you can describe. Credentials are stored per
profile, encrypted, and the steering layer has no path to them. Each profile sets how
much Claude may do in it: drive, read, or nothing. Keep your own logins in a read
profile, give Claude its own accounts in a drive profile.

Free and open source under Apache-2.0, with no paid tier in v1. Windows first, other
platforms after.

## What it refuses to do

The non-goals are as much the pitch as the goals.

Not a site faithful browser. Even a contained page sits inside Mondrian's frame and
typography. If you want sites to look like themselves, this is the wrong browser, and
that is the first thing to say rather than the last.

Not a rendering engine. Mondrian reclassifies and lays out what Chromium already gives
it. It does not parse HTML or paint text itself.

Not a summariser. Blocks are the page's own content rearranged. Claude never rewrites a
source into its own words on a normal page load, and a composed page keeps
contradictions between sources side by side rather than resolving them into one claim.

Not an agent platform. Claude steers the browser for composition and correction.
Automating someone's browsing on their behalf is a different product.

No sync, no accounts, no telemetry in v1. The block cache stays local. There is no
server.

Not mobile. Desktop only.

Not a place where Claude holds your passwords. Credentials are stored, per profile, but
the control socket, the preload and rule JavaScript have no path to them. Claude can be
a signed in user in a profile you set to drive because the browser filled the form, not
because Claude read the password.

## What we do not say yet

The PRD is a draft and its measurable gates are unmeasured: classifier accuracy on a 50
site corpus, tier assignment, the per tier coverage share, the steering boundary
assertion, the 400ms first block, the 50ms cached second visit, and no crash in a week
of daily use. None of those numbers or the claims resting on them go anywhere public
until they have been measured on real sites.

Two limits get stated rather than managed. The first is coverage: the PRD's own open
risk is that too little of the web reaches the relayout tier. The skinned and contained
tiers mean Mondrian is still one browser whatever that number turns out to be, but the
relayout is the promise, and a thin promise is worth knowing about early. The only
published comparable figure belongs to Brave's SpeedReader answering a narrower
question, 22% of general web pages, and it is not Mondrian's number.

The second is the residual risk in the threat model. The profile boundary guarantees
that a page in one profile cannot reach a credential in any profile, and that an
injected instruction can only make Claude act inside that page's own profile with
whatever that profile allows. It does not guarantee that Claude, driving a profile you
logged into, will not be misled by a page into doing something you did not want. The
PRD accepts that openly instead of burying it, and so should every public description
of the browser.

## The one sentence

Mondrian is a desktop browser that takes every page apart into blocks and lays them
back out in one layout language, so you read on your terms instead of the site's.
