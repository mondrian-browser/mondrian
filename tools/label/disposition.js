// What the filter does with each type by default: keep it in the reading column, demote
// it (kept, but out of the way: collapsed, in the margin, or in the browser's own
// chrome), or drop it (not emitted; counted and listed one click away, per the concept:
// nothing is silently deleted).
//
// This is the decision that has to be right. Calling a paragraph "summary" costs
// nothing visible; calling the article body "ad" and dropping it is the one failure a
// reader will not forgive. So the scorecard reports disposition accuracy separately
// from type accuracy, and two rates in particular: content lost (a keep region called
// drop) and chrome leaked (a drop region called keep).
//
// This is the default policy, not the taxonomy: a type keeps its name whatever its
// disposition, and a site rule or a user setting can move a type between columns.

'use strict';

const DROP = new Set([
  'ad', 'sponsored', 'cross_promo', 'newsletter', 'subscribe', 'paywall', 'app_nag',
  'cookie_banner', 'consent_gate', 'age_gate', 'popup', 'sticky_bar', 'chat_widget',
  'site_notice', 'decoration', 'skip_link',
]);

const DEMOTE = new Set([
  'site_header', 'site_nav', 'site_footer', 'legal_notice', 'account', 'search',
  'version_switcher', 'settings', 'share', 'page_tools', 'toolbar', 'feedback',
  'action_button', 'related', 'trending', 'tag_cloud', 'external_links',
  'hero', 'cta', 'logo_cloud', 'unclear',
]);

// Everything else is content: keep.
function dispositionOf(type) {
  if (DROP.has(type)) return 'drop';
  if (DEMOTE.has(type)) return 'demote';
  return 'keep';
}

module.exports = { DROP, DEMOTE, dispositionOf };
