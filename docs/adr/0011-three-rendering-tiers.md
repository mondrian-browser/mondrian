# 0011. Three rendering tiers, no raw escape

Date: 2026-09-20
Status: accepted. Supersedes the "escape hatch to raw" position in the concept and the PRD.

## Context

The concept and the PRD said that pages which only work as built (a map, a web app, a
checkout) escape to raw rendering, and that Mondrian is therefore not a browser for
everything. Lloyd rejected that on 20 September 2026: nobody runs one browser for a few
things and another for the rest. Mondrian has to be a complete browser, and a page that
cannot be relaid out still has to look and behave like it belongs in it.

The PRD's own risk list already said why this matters: if the escape hatch fires on a
third of browsing, the product is reader mode with extra steps.

## Decision

Every page is rendered in one of three tiers, and the tab says which.

1. **Relayout.** The page is parsed into the ten block types and laid out in Mondrian's
   language. This is the product, and the target is as many sites as possible. Moving a
   site from a lower tier into this one is ordinary, expected work, not scope creep.
2. **Skinned.** The site keeps its own layout and behaviour. Mondrian's typography,
   colour tokens, spacing, corners and light or dark scheme are applied over it at
   document-start, so it never paints in the site's own design. The rules engine already
   injects per-site CSS before first paint; this tier is a generic Mondrian stylesheet
   plus per-site overrides on top of that mechanism.
3. **Contained.** The page runs exactly as built, but as one large block inside
   Mondrian's frame. It still gets the tab marking, the dropped-content panel for what
   the network layer blocked, and it still composes: a contained page can sit beside
   relaid blocks from another source. It is a sub-page, not an escape.

There is no fourth tier. A page that breaks even when contained is a bug.

Tier assignment is per site, by rule, with a conservative default that the classifier
and Claude may propose and Lloyd or a rule confirms. A document must never land in tier
2 or 3; an application must never be relaid into broken blocks. Both directions are
gates in the PRD.

## Consequences

The PRD's "not a Chrome replacement for everything" non-goal is withdrawn. Mail, maps,
editors and checkouts are in scope, in tier 2 or 3, and the coverage number per tier is
reported on every scorecard run.

The skinned tier is new engineering: a Mondrian base stylesheet robust enough to apply
to arbitrary sites without breaking them, and a per-site override path. It reuses the
document-start CSS channel, so it costs no new subsystem, but it is a milestone 2 item
and does not change the order in `docs/project/NEXT.md`. Milestone 1 still has to prove
relayout on documents first.

The contained tier needs the block renderer to host a live page as a block, which
overlaps with the existing composed-page work and the frame-header scope. That scope is
not widened: a contained page is Mondrian's own frame around a top-level document, not a
third-party page framing another.

"Nothing is silently deleted" now applies per tier. In tiers 2 and 3 the only things
dropped are network-level blocks, and they are still counted and listed.
