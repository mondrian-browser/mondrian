# Frozen 20 September 2026

The corpus is frozen as of this date, per ADR 0008. 74 pages, 45 sites, 3,277 regions,
tiers confirmed by Lloyd, labelled by Jev (`jev-latest`, 100 types, `tools/label/questions.js`
as of commit d7a381d's successor) and reviewed.

Do not recapture a page without deciding to. A recapture changes `regions.json` and
invalidates that page's `labels.json`; relabel it (`node tools/label/label.js <id> --force`)
and review it again, and say so here.

## Labels

Every region in `pages/<id>/labels.json` has Jev's `choice`, `confidence`, `margin`, the top
five probabilities, and `final`: the type to score against. `final` is Jev's choice unless
the review corrected it (`review: "wrong"`, 62 regions). Judgements are in
`tools/label/judgements/corpus-all.json`; `tools/label/review.js --score` reproduces the
numbers below.

- Flagged for review (confidence < 0.5 or top-two margin < 0.1): 467 (14%). All judged.
- Random sample of the unflagged: 150 (seed 1). Judged.
- Flagged: 44% top label right, 87% right-or-acceptable, 13% wrong.
- Unflagged: 91% top label right, 99% right-or-acceptable, 1% wrong.
- Weighted over the corpus: **84% top label right, 97% right-or-acceptable, 2.4% wrong.**
- Four regions are `unsure`, routed to Lloyd: `ebay-search:13`, `spiegel-index:64`,
  `spiegel-index:98`, `spiegel-index:171`. All are text-less containers.
- Application score: the five applications 0.85 to 0.96, every document 0.27 or below,
  YouTube's watch page 0.50. No page disagreed with its tier.

Cost: 15.0M input tokens, $0.63.

## Known gap

Cross-origin iframes (consent walls, embeds, ad frames) are not in `regions.json`: the extractor drops a region with no text and no images. Spiegel's consent wall is the visible case. Fix in the extractor under B3, then recapture and relabel the affected pages and record it here.

**Closed 20 Sep 2026, same day.** `tools/corpus/add-iframes.js` appended the 15 visible
frames (≥80px) from `dom.html` to the 8 pages that have them, after the existing regions
so no index moved; `node tools/label/label.js --new` labelled them (3,292 regions now).
Jev: 9 `embed` (MDN live examples), 2 `video` (YouTube), 1 `chat_widget`, and the three
full-viewport consent frames as `cookie_banner`, corrected to `consent_gate` in review.
The extractor now emits frames itself (`frame: { host, width, height }`), so a future
capture does not need this pass.

**Added 20 Sep 2026:** `counts.coverLinks` and `coverLabel` on every region, computed from
`dom.html` by `tools/corpus/add-cover-links.js` (anchors that wrap or overlay a region, and
the first one's aria-label). The extractor now records both itself. No index moved.

## Grown 20 September 2026

Forty-four sites, 160 pages, 4,700 regions added through `tools/sites/solve.js`
(`tools/corpus/growth-1.txt`), chosen so the rarer types land on several sites each. The
new labels are Jev's choices, unreviewed: by the earlier measurement about 3% wrong, 14%
flagged. Four sites came back as bot walls or app shells and were dropped
(english.stackexchange.com, fbref.com, msn.com, bestbuy.com). The corpus is now 236 pages,
86 sites, 7,996 regions. On it the rules score 63% (the 70% before was fitted to the
first 45 sites); the directory then the rules 73% by leave-one-page-out.

## Grown again 21 September 2026

`tools/corpus/growth-2.txt`, 100 sites: 104 solved (some hosts redirected to variants) in
two and a half hours, one Cloudflare wall dropped (dictionary.cambridge.org), four empty
pages dropped. **662 pages, 186 sites, 22,300 regions**, 150 directory entries. Rules on
this corpus: 60.7% strict (holdout 56.4%); directory then rules 72.2%, coverage 41%,
92% right where covered.
