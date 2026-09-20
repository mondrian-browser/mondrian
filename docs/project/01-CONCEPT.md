# The concept

The browser is called **Mondrian**, after the obvious thing: a page is resolved into
rectangles, each holding one kind of content, arranged for clarity rather than for the
site's own purposes. The name is a description of the design filter, not decoration.

The visual reference is `docs/concept/concept-layout.pdf`, ten pages. This is the same
design in words, so a session that cannot see the PDF still knows what it is building.

This concept changes what the project is. Read `05-STATUS.md` for the honest gap between
it and the code that exists today.

---

## The one sentence

**No page is rendered as sent.** Every document is pulled apart into blocks and laid back
out in the browser's own language. The site supplies content and structure; the browser
supplies the layout, always the same one.

## The design filter

Four stages on the way in: **parse, classify, order, lay out.** The filter sits *in front
of paint*, not after it. That distinction is the whole thing. Render-then-reflow would
show you the site's design and then take it apart in front of you; this way the site's own
CSS never reaches the screen at all.

### Ten block types cover the web you actually read

| block | what it holds |
|---|---|
| Heading | |
| Text | at a fixed measure |
| Image or video | |
| Table | |
| List or steps | |
| Quote or code | |
| Form or control | |
| Links out | |
| Comments | folded until asked for |
| Aside or footnote | |

Anything that classifies as chrome, promotion or tracking **gets no block**. It is not
hidden with CSS; it is never emitted.

### Three rules the filter obeys

**Structure is kept, decoration is not.** Reading order, headings, tables and captions
survive intact. Brand type, colour and spacing do not.

**Nothing is silently deleted.** Dropped elements are counted and listed on every page,
one click from being shown. The concept shows this as a panel: "Site navigation and
footer / Shorts shelf, 6 items / 24 recommendations / 3 tracking scripts — Show them
anyway."

**Escape hatch, per site.** Pages that only work as built — a map, a web app, a checkout —
render raw, and the tab says so. This is not a failure case, it is part of the design.

### Arrival is progressive and visible

Blocks land in reading order, top first. Each carries a state: `SETTLED`, `ARRIVING`,
`QUEUED`. The address bar shows the pipeline: `fetched · parsed · blocking 14 of 22 ·
laying out`.

The budget in the concept is **380ms to first block** on a cold visit.

### The block cache

Second visit is **0ms — served from the block cache**. The block layout is kept per URL.
Reopening is instant and a background check quietly refetches if the source moved.

Cache properties from the concept: pages held as blocks, searchable offline across text
and tables, and **nothing cached from a logged-in page**.

---

## The bar

One field, six states. It is **Claude by default**, and the `https://` button on the right
is the only way modes swap — it swaps back the same way. Nothing typed is sent while the
bar sits idle.

| state | looks like |
|---|---|
| **Idle** | "Ask about this page, or tell the browser what to do" — every new tab lands here |
| **Typing** | a chip shows what it can see: "THIS PAGE + 3 TABS" |
| **Working** | says what it is touching: "Reading tab 3 · span table, 2 of 3 done", with Stop |
| **Answered, collapsed** | the answer sheet folds into the bar, with "Open again" |
| **Classic entry** | mono type, no model in the loop, marked "CLAUDE PAUSED", with "Ask instead" |
| **Slash commands** | the browser's own verbs: `/layout` `/rules` `/reformat` `/web` |

In classic entry the dropdown offers: straight to a URL, search, a tab already open, and
"Press Tab to hand this line to Claude instead of loading it."

### Answering across tabs

Asking a question reads the open tabs rather than the web. The answer cites which tab and
which part of it — "tab 2 · price table", "tab 3 · span table, §4.2" — and states plainly
when it did not go outside: "No web search ran. Ask again with /web to go outside these
tabs."

The answer offers next moves rather than ending: compose one page from these tabs, show
the working, open more sources as tabs, keep as a note.

---

## Composition

**Tabs are the unit you compose with.** Drag one tab into another and the two become one
page. No dialog: Claude reads the blocks, picks a layout, builds it, and you correct it in
the bar afterwards.

### Where you drop decides what happens

| drop | marker | result |
|---|---|---|
| Between tabs | a clay seam | reorders, nothing is read |
| Onto a tab | a sage ring | composes one page from both, in the target's place |
| Onto a composed tab | | joins as another source |

**Four sources is the ceiling.** The slots are shown in the strip while dragging. A fifth
page has to replace one. The cap is a design decision — past four the layout stops being
readable — not a limit of the model.

### Tab states

Ordinary, active-with-rules-applied (a clay edge means the page was reformatted), lifted
(tilts off the strip), drop target (sage ring), composed-of-two and composed-of-three
(stacked marks, one per source), and **stale** when a source changed underneath.

### Rules that keep composition trustworthy

These are the important ones, and they are what separate this from a summariser:

- No dialog on drop. Claude decides, you correct afterwards.
- **Sources are never thrown away.** Split back returns the original tabs, untouched.
- **Every block carries the mark of the page it came from.**
- **Blocks that contradict each other are kept side by side, never averaged into one
  claim.** The concept shows a `CONFLICT` block doing exactly this.
- Nothing is composed from a page behind a login unless you say so, once per site.

`Cmd Z` undoes a composition whole. `/layout` in the bar reshapes it in words.

### The composed page

Addressed as `compose://pine-vs-ironbark`. Header states the arithmetic: "22 blocks in,
9 kept, laid out by Claude", with a dot per source.

Blocks are labelled by provenance and intent: `HEADING · WRITTEN FOR THE PAIR`,
`TABLE · TWO PRICE TABLES, MATCHED ON BOARD SIZE`, `CONFLICT`, `ASIDE · YOUR OTHER TAB`.

The side panel explains itself and offers the moves: ask for a different layout, rebuild
from source, drag in a third page, split back into two tabs, pin to the start page. It
also tracks **changed since it was built**, listing what moved in the sources since the
composition was made.

A composed page **lives only in this browser and rebuilds from its sources** when the tab
is opened. It is a view, not a copy.

### Relayout in words

Typing "put the two price tables side by side and drop the durability notes" relayouts
live. Blocks animate with intent labels — `TABLE · MOVING LEFT`, `TEXT · DURABILITY
NOTES — LEAVING` — and the panel reports **what your sentence changed**: "2 tables moved
into a two-column row / 1 text block dropped, kept in the index / Nothing refetched, all
three sources are cached."

Layout history keeps Claude's first pass and yours, with one click back. Note again:
`CONFLICT · KEPT` survives a relayout. "Blocks that disagree are never merged away,
whatever the layout."

---

## What this means for the existing code

Worth stating plainly, because it inverts the current design.

Today the browser lets Chromium render the site and then intervenes: rules hide elements
with CSS, scriptlets defuse scripts, the ad engine blocks requests. That is a *subtractive*
model working against a page that has already been laid out.

The concept is *reconstructive*: the page is never laid out by the site at all. Under it,

- **Hiding with CSS mostly stops being the mechanism.** You do not hide YouTube's sidebar;
  the filter does not emit a block for it. Clean YouTube becomes a classification outcome
  rather than a stylesheet.
- **The rules engine's real job changes** to per-site correction of the filter: which
  sites need the escape hatch, which selectors the classifier is getting wrong, which
  blocks to force or suppress. That is a better fit for it than selector whack-a-mole, and
  it is why the rules engine should not be thrown away.
- **`page_read` becomes the front end of the classifier**, not just an agent affordance.
  It already walks shadow DOM and assigns stable refs, which is most of what a parser
  needs.
- **Composed pages become `compose://`**, with real provenance, conflict preservation and
  rebuild-from-source. The current `page_create` is a rough ancestor of this.
- **Ad and tracker blocking stays**, because it is about the network, not the layout, and
  blocking a request is still cheaper than classifying what it loaded.

## Open questions that change the architecture

These need deciding before much is built. They are not details.

**1. Is Claude in the hot path?** 380ms to first block is not a model round trip. The
workable shape is almost certainly a deterministic classifier doing the common case fast,
with Claude refining, handling the hard pages, and writing per-site rules that are then
cached. Composition and relayout are where Claude genuinely belongs, because they are
judgement calls and happen on a gesture, not on every page load.

**2. How is "logged-in" detected?** "Nothing cached from a logged-in page" and "nothing
composed from behind a login" both need a reliable signal. Presence of a session cookie is
the obvious candidate and it is imperfect.

**3. Where is the line between a page and an app?** The escape hatch is the right idea but
the boundary is fuzzy, and getting it wrong in either direction is bad: a checkout
rendered as blocks is broken, a news site escaped to raw defeats the point. Likely a
per-site rule with a conservative default.

**4. What happens to forms and interaction?** "Form or control" is a block type, so the
filter has to re-emit working controls bound to the original page, not screenshots of
them. This is the hardest of the ten block types by some margin.

**5. Video.** The concept shows a real player inside a MEDIA block. Re-hosting a YouTube
player inside a reconstructed page is possible via the embed, but it is a different object
from the one the site shipped, and some sites will not embed.
