// Label policies: definitions sharpened after the B3/B4 reading (NEXT.md), applied to
// `final` on top of the judgements by `review.js --apply`. Each is a rule over a region
// and its neighbours, and each region it changes records the policy name, so the
// change is visible and reversible. These are the decisions; questions.js should say
// the same thing in words before the next Jev run.
//
// Signature: (region, final, prevRegion, nextRegion) -> new type or undefined.

'use strict';

const RELATED_HEAD = /^(related|read more|you may also like|you might also like|recommended( for you)?|see also|more (from|on|like) |also (in|on) |further reading|more stories|explore more|next up|up next|discover more|you.ll also love|most-saved)/i;
const TRENDING_HEAD = /^(most (read|popular|viewed|shared|watched|commented)|trending|popular|top (stories|picks|rated)|hot network|editor.?s picks|best ?sellers?)/i;

const POLICIES = {
  // A heading is a heading, even when it names a related or trending slot. The slot's
  // cards carry the slot type; its heading does not.
  'heading-is-heading': (r, final) =>
    /^h[1-6]$/.test(r.tag) && r.textLength < 40 && (final === 'related' || final === 'trending') ? 'heading' : undefined,

  // Cards directly under a heading that says "related" are related; under "most read"
  // they are trending. The slot's heading decides, not the cards' own look.
  'related-slot': (r, final, prev) =>
    final === 'teaser_card' && prev && prev.textLength < 40 && RELATED_HEAD.test(prev.text) ? 'related' : undefined,
  'trending-slot': (r, final, prev) =>
    final === 'teaser_card' && prev && prev.textLength < 40 && TRENDING_HEAD.test(prev.text) ? 'trending' : undefined,
};

module.exports = { POLICIES, RELATED_HEAD, TRENDING_HEAD };
