# Site directory

One JSON file per site, mapping the site's stable selectors to block types, made by
`node tools/sites/solve.js <url>` (capture four pages, label with Jev, derive) or
`node tools/sites/derive.js <site>` from pages already in the corpus. Regions a selector
covers get the type at Jev's accuracy; the rest fall back to the rules. Leave-one-page-
out over the corpus: 93% right where covered, 35% coverage from one to three other
pages, rising with pages per site (Ars Technica, four pages: 84% of regions covered).

Selectors are built from what the extractor records (landmark chain, tag, one stable
class or id), so they match offline against `regions.json` and at runtime against the
DOM with the same meaning. Hashed and utility classes are never used; CSS-module names
become `[class*="Part_name__"]` prefixes.

Pages captured by `solve.js` are listed in `tools/corpus/sites.json` and live in
`corpus/pages/<host>-<n>/` like any other; they count in the scorecard.
