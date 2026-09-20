# Prior art

Searched 20 September 2026, before committing to the build. The question was whether
Mondrian already exists.

**Short answer: no, but one part of it does, and its numbers should change the plan.**

---

## The closest thing: Brave SpeedReader

[SpeedReader](https://brave.com/blog/speed-reader/) is the only shipped product found
that shares Mondrian's central architectural insight, and it is worth reading properly
before writing a classifier.

What it gets right, and what this confirms:

- **It runs before paint.** It decides what the page's core content is before fetching
  or rendering, so the original layout is never shown. Same insight, independently
  reached, shipping in a mainstream browser.
- **A fast classifier is achievable.** Theirs is machine-learned on 3,000 pages,
  reported at 91% accuracy, 91% precision, 87% recall, running in about 1.9ms. Fast
  enough to be always-on.

That second point is the most useful thing in this document. It is evidence that the
400ms budget in the PRD is realistic and that ADR 0006's deterministic core is the right
bet, not wishful thinking.

### The number that should worry us

**SpeedReader applies to 22% of general web pages.** 31% on X, 42% on Reddit. It refuses
single-page applications, index pages, and layouts with complex presentation
dependencies. Brave state plainly that it is not "intended to be used across the entire
web".

That bears directly on the PRD's second risk, that too much of the web is an application.
If a funded research team with a trained classifier found roughly a fifth of pages
distillable, an escape hatch firing on most of a browsing session is a real possibility.

**The caveat, which is genuine and not consolation.** SpeedReader answers a narrower
question than Mondrian does: "is this an article that can become reader mode?" Mondrian
asks "what blocks is this page made of?" A search results page fails the first and
answers the second easily, as a list of links out. A forum thread fails the first and is
a sequence of text blocks. So 22% is a floor for Mondrian's coverage rather than a
prediction of it.

But it is the only hard number anyone has published on this, and the honest way to treat
it is as the thing milestone 1 is testing. If Mondrian's corpus comes back at 25%, the
concept is a better reader mode. If it comes back at 80%, it is a browser.

### Where Mondrian differs

SpeedReader is binary: distil into one column of article text, or render normally.
Mondrian classifies into ten typed blocks, keeps tables as tables and lists as lists,
counts and lists what it dropped, and composes pages together. None of that is in
SpeedReader.

---

## AI browsers: adjacent, and not this

Dia, Comet, ChatGPT Atlas, Brave Leo and Arc all add an agent or chat layer over ordinary
Chromium rendering. A survey of the
[agentic browser landscape](https://presenc.ai/research/agentic-browser-wars-2026) turned
up no evidence that any of them reformats page rendering, imposes a uniform layout, or
merges pages into one composition. Their differentiation is routing, task completion and
summarisation.

[Dia](https://en.wikipedia.org/wiki/Dia_(web_browser)) is the nearest in spirit, with
"chat with your tabs" and an assistant in the URL bar, which resembles Mondrian's bar
answering across open tabs. But it is a chat sidebar over unmodified pages, not
composition: no blocks, no provenance, no merged document. It is macOS-only as of March
2026, Atlassian acquired The Browser Company for $610M in October 2025, and Dia Pro is
$20 a month.

Worth noting for positioning: Arc is in maintenance mode and the AI browser field is
crowded on the agent axis. Mondrian is on a different axis, layout rather than agency,
and nobody appears to be on it.

---

## Split view is everywhere, and is not composition

Chrome, Firefox, Vivaldi, Arc and Zen all ship split view now. All of them put two pages
side by side, each in its own layout, each in its own frame.

Mondrian's composition reads the blocks of both pages and builds **one new document**,
with every block marked with its origin and contradictions kept side by side rather than
resolved. Nothing found does this. It appears to be the genuinely novel part of the
concept, more so than the design filter.

---

## Reader mode, the long tail

Firefox Reader View, Safari Reader, Edge Immersive Reader, and a large family of
extensions that force reader mode on every page. All of them are article extraction, all
of them post-render, all of them binary. The
[survey of reading-mode parsers](https://www.ctrl.blog/entry/browser-reading-mode-parsers/)
is a good account of how varied and fragile these are in practice.

Mozilla Readability (Apache-2.0) and Postlight Parser (MIT) are the extraction engines
most of these sit on. Both are worth reading before writing a classifier, as recorded in
the development plan. Neither produces typed blocks.

---

## What this means for the plan

Nothing changes in the milestone order. Two things change in emphasis.

**Measure coverage first, not accuracy.** The plan's milestone 1 measures how well the
classifier types blocks. Add a prior question, because it is cheaper and more decisive:
on a 50-site corpus, what fraction of pages can be blocked at all, and what fraction have
to escape? If that number is near Brave's 22%, the product is reader mode with
composition, which may still be worth building but is a different thing and should be
called one.

**Composition is the differentiator, not the filter.** The filter has prior art, a
shipped implementation and published numbers. Composition has none. If effort has to be
cut, cut it from the filter's ambition rather than from composition.

## Sources

- [SpeedReader: Fast and Private Reader Mode for the Web, Brave](https://brave.com/blog/speed-reader/)
- [SpeedReader research paper, WWW19](https://brave.com/research/files/speedreader-www19.pdf)
- [The Agentic Browser Wars 2026](https://presenc.ai/research/agentic-browser-wars-2026)
- [Dia (web browser), Wikipedia](https://en.wikipedia.org/wiki/Dia_(web_browser))
- [Web Reading Mode: the non-standard rendering mode, ctrl.blog](https://www.ctrl.blog/entry/browser-reading-mode-parsers/)
- [Split View in Firefox, Mozilla](https://blog.mozilla.org/en/firefox/split-view/)
- [Chrome split view, Google](https://support.google.com/chrome/answer/16971124)
