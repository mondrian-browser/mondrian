# Corpus

The frozen page set the design filter is developed against. NEXT.md B1, ADR 0008.

Captured through Mondrian itself, not an HTTP client, so client-rendered content, shadow
DOM and the effect of the ad blocker are all in it. Several pages per site, because a
region that repeats across pages of one site is the strongest chrome signal there is.

```
corpus/
  manifest.json            one line per listed page: captured or not, site, kind, tier, counts
  pages/<id>/
    dom.html               rendered DOM with geometry baked in (see below)
    regions.json           what tools/label/extract.js saw; the feature set B2 labels and B3 scores on
    shot.jpg               viewport at the top of the page, for whoever reviews the labels
    meta.json              urls, title, timing, blocked-request count, tier
```

The page list is `tools/corpus/pages.js`. Capture with `npm run corpus:capture`; it skips
pages already on disk, `--force` recaptures, ids as arguments capture only those.

## dom.html

Every element in the body carries:

- `data-mx-r="left,top,width,height"` — its box in page pixels at capture time
- `data-mx-h="1"` — if it was not visible (display none, visibility hidden, opacity 0, zero size)
- `data-mx-pos="fixed|sticky"` — if it was positioned that way
- `data-mx-f="size/weight"` — its computed font, only where it differs from its parent
- `data-mx-img="naturalWidth,naturalHeight"` — on images

Shadow roots are written as `<template shadowrootmode="open">`. Scripts, stylesheets and
event handlers are dropped; the geometry is what they produced. So the file is enough to
re-run region extraction offline, without a browser, and the heuristics of B3 have the
same features the live extractor has.

## What is in git

`manifest.json`, `meta.json` and `regions.json` are committed. `dom.html` and `shot.jpg`
are not: the repository is public and they are full copies of other people's pages,
some paywalled. They live on the capturing machine and in whatever backup Lloyd keeps.
`regions.json` holds a 400-character sample per region, which is enough to review a
label against.

## Freezing

Once B2 has labelled it, the corpus does not change. A site changing is not a reason to
recapture; a deliberate decision to refresh is, and it gets a new label run. Recapturing
one page invalidates its labels.
