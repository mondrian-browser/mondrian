# Mondrian — product requirements

The guiding document. What Mondrian is, who it is for, what counts as success, and
explicitly what it is not. Everything else in `docs/` is downstream of this.

Status: draft. Last revised 20 September 2026 (evening: tiers and credentials, ADR 0011
and 0012).

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

Not for people who want their browsing to look like the sites they visit. It is a
complete browser: mail, maps, editors and checkouts run in it too, in one of the three
rendering tiers below, so nobody needs a second browser. It is also a browser that hands
an agent deep access to what you browse, and it says so; see the threat model.

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
7. **Every page has a tier, and the tab says which.** Relayout for documents, and the
   target is as many sites as possible. Skinned for pages that resist relayout: the
   site's own layout and behaviour, in Mondrian's type, colour and spacing. Contained for
   pages that resist even that: the page runs exactly as built, as one large block inside
   Mondrian's frame, so it still composes and the dropped-content panel still works.
   No tier is a failure state and moving a site up a tier is ordinary work. ADR 0011.
8. **One browser, with a boundary.** Credentials are stored per profile, encrypted, and
   never reachable by the steering layer. Each profile sets how much Claude may do in
   it: drive, read, or nothing. ADR 0012.

## Non-goals

Stated so they can be pointed at when scope creeps.

- **Not a site-faithful browser.** Even a contained page sits inside Mondrian's frame
  and typography. If you want sites to look like themselves, this is the wrong browser.
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
- **Not a place where Claude holds your passwords.** Credentials are stored, per
  profile, but the control socket, the preload and rule JavaScript have no path to them.
  Claude can be a logged-in user in a profile you set to drive, because the browser
  filled the form, not because Claude read the password.

## Success criteria

**v1 ships when** a week of ordinary reading happens in Mondrian without reaching for
another browser, except for pages that deliberately escape.

Measurable gates before that:

| gate | bar |
|---|---|
| Classifier accuracy | on a 50-site corpus, main content kept on every page, navigation dropped on every page, tables structurally intact, reading order preserved |
| Tier assignment | no document lands in the skinned or contained tier; no application is relaid into broken blocks; every tab shows its tier |
| Coverage | share of corpus pages in each tier, reported on every scorecard run; the relayout share only goes up |
| Steering boundary | every tab command answers in a drive profile and refuses in an off profile, asserted for every command |
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

**Too little of the web reaches the relayout tier.** The skinned and contained tiers
mean Mondrian is still one browser whatever the number is, but the promise is the
relayout, and if it covers a third of real browsing the promise is thin. There is a
published number on this: Brave's SpeedReader, which answers a narrower question, applies
to 22% of general web pages. See `docs/project/09-PRIOR-ART.md`. Measuring Mondrian's own
coverage is the cheapest decisive experiment available and belongs at the very start of
milestone 1, and the per-tier share is reported on every scorecard run after that.

**Steering plus credentials.** A browser an agent can drive that also holds logins is a
prompt-injection target. The mitigation is the profile boundary (ADR 0012) and an
OS-permissioned control socket (NEXT C1) before any credential is stored. The residual
risk is stated in the threat model below and accepted by the user, not hidden.

**Maintenance outlasts enthusiasm.** A browser has a permanent tail of Chromium updates
and site breakage. Open source is partly a hedge against this.

**Interactive blocks.** Forms and controls have to be re-emitted as working controls
bound to the original page. This is the hardest of the ten block types and it is not
optional, because a page you cannot use is not a page.

## Threat model

Stated so a user can decide how much to hand over.

What Claude can see: every page in a profile set to `read` or `drive`, including pages
behind a login, as text and structure. What Claude can do: in a `drive` profile, click,
type, navigate, run JavaScript in the page, and change the browser's own interface. What
Claude cannot do in any profile: read a stored credential, change a profile's steering
setting, or see a profile set to `off`.

What the boundary guarantees: a page in one profile cannot reach a credential in any
profile, and an injected instruction on a page can only make Claude act inside the
profile that page is in, with whatever that profile's setting allows. What it does not
guarantee: that Claude, driving a profile you logged into, will not be misled by a page
into doing something in that profile you did not want. That is the risk you accept when
you set a profile to `drive`. Keep your own logins in a `read` profile and give Claude its
own accounts in a `drive` one, and the exposure is Claude's accounts, not yours.

Mondrian is for people who understand this and want it. Anything against Anthropic's
usage policy is out regardless of profile; that belongs in the terms, not here.

## Open questions

Tracked in `01-CONCEPT.md`. The ones that change the architecture:

1. How is a logged-in page detected, given that caching and composition both depend on it?
2. Where is the line between the relayout and skinned tiers, and who moves a site across it?
3. How are form controls re-emitted so they still work?
4. Can video be re-hosted inside a block on sites that resist embedding?
