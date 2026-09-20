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
