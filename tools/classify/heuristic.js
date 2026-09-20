// The heuristic block classifier: no model. NEXT.md B3.
//
// One ordered list of rules. Each takes the features of a region (features.js) and
// returns a type from tools/label/questions.js, or nothing to let the next rule try.
// The first rule that answers wins, and its name goes into the result, so a wrong
// answer can be traced to the rule that gave it (`npm run classify` prints the rules
// behind the biggest confusions).
//
// The order is: what the region *is* (frame, code, table, heading, media, control),
// then what its site says it is (cookie, skip, breadcrumbs, pagination, and the header,
// nav and footer landmarks), then what its class names say (Readability and Postlight's
// hint lists, widened), then what its text says, then shape (link density, length,
// repetition across pages), then the fallbacks. Specific before general, throughout.
//
// This is the baseline the scorecard measures, and every rule in it is a guess that
// the corpus either confirms or refutes. Do not tune a rule to one site; if a site
// needs its own rule, that is a site rule (rules/*.json), not this file.

'use strict';

const { features, siteIndex } = require('./features');

const RULES = [
  // ---------------------------------------------------------------- frames
  ['frame-video', (f) => f.frame && /youtube|youtu\.be|vimeo|dailymotion|twitch|wistia|brightcove|jwplayer/.test(f.frame.host) && 'video'],
  ['frame-consent', (f) => f.frame && (f.g.widthFraction >= 0.8 && f.frame.height >= 500 || /consent|sourcepoint|privacy|cmp|gdpr|sp-/.test(f.frame.host + ' ' + f.hint + ' ' + (f.frame.title || '').toLowerCase())) && 'consent_gate'],
  ['frame-chat', (f) => f.frame && /bot|chat|intercom|drift|assistant/.test(f.frame.host + ' ' + f.hint) && 'chat_widget'],
  ['frame-ad', (f) => f.frame && (/doubleclick|googlesyndication|adnxs|adsafeprotected|criteo|taboola|outbrain|amazon-adsystem|safeframe/.test(f.frame.host) || f.h('ad')) && 'ad'],
  ['frame-map', (f) => f.frame && /maps\.google|openstreetmap|mapbox/.test(f.frame.host) && 'map'],
  ['frame-embed', (f) => f.frame && 'embed'],

  // ---------------------------------------------------------------- the tag says
  ['pre-code', (f) => f.tag === 'pre' && 'code'],
  ['code-hint', (f) => (f.tag === 'code' || f.h('code') && f.tag !== 'a') && f.ltr < 0.2 && 'code'],
  ['table-navbox', (f) => f.tag === 'table' && (f.inNav || /navbox|vertical-navbox|navigation/.test(f.hint) || /^v\s*\|?\s*t\s*\|?\s*e\b/.test(f.text)) && 'section_nav'],
  ['table-authority', (f) => f.tag === 'table' && /authority control/i.test(f.text) && 'metadata'],
  ['table-infobox', (f) => f.tag === 'table' && f.h('infobox') && 'infobox'],
  ['table', (f) => (f.tag === 'table' || f.tag === 'tbody' || f.tag === 'thead') && 'table'],
  ['canvas', (f) => f.tag === 'canvas' && (f.h('chart') ? 'chart' : f.wide && f.height > 300 ? 'canvas' : 'decoration')],
  ['video-tag', (f) => f.tag === 'video' && 'video'],
  ['audio-tag', (f) => f.tag === 'audio' && 'audio'],
  ['hr', (f) => f.tag === 'hr' && 'decoration'],

  // ---------------------------------------------------------------- headings
  ['h1-title', (f) => f.tag === 'h1' && (f.top < 0.35 || f.index < 8) && !f.inHeader && 'title'],
  ['h1-site', (f) => f.tag === 'h1' && f.inHeader && f.short && (f.repeated ? 'site_header' : 'title')],
  ['h1-heading', (f) => f.tag === 'h1' && 'heading'],
  ['h-skip', (f) => /^h[2-6]$/.test(f.tag) && f.tx('skip') && f.lines.length <= 2 && 'skip_link'],
  ['h-related-head', (f) => /^h[2-6]$/.test(f.tag) && /^related\b/i.test(f.text) && f.len < 40 && 'related'],
  ['h-trending-head', (f) => /^h[2-6]$/.test(f.tag) && f.tx('trending') && f.len < 40 && 'trending'],
  ['h-related', (f) => /^h[2-6]$/.test(f.tag) && f.links >= 3 && f.ltr > 0.6 && (f.tx('related') ? 'related' : 'section_nav')],
  ['h-comments', (f) => /^h[2-6]$/.test(f.tag) && f.tx('comments') && f.len < 60 && 'comments'],
  ['h-heading', (f) => /^h[2-6]$/.test(f.tag) && f.len < 200 && 'heading'],
  ['heading-edit', (f) => f.lines.length <= 2 && f.len < 60 && /\|\s*edit$/i.test(f.text) && 'heading'],
  ['heading-short-div', (f) => /^(div|span|section|header)$/.test(f.tag) && f.headings >= 1 && f.len < 40 && f.images === 0 && f.lines.length <= 2 && !f.tx('comments') && 'heading'],
  ['comments-head', (f) => f.tx('comments') && f.len < 60 && f.lines.length <= 2 && f.controls === 0 && !/^(add|leave|post|write|reply)/i.test(f.text) && 'comments'],
  ['comments-asked', (f) => /^(asked|answered|posted|written|commented) by\b/i.test(f.text) && f.len > 40 && 'comments'],
  ['comments-shape', (f) => (f.tx('ago') || /\bago\b/i.test(f.lines[1] || '') || /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(f.lines[1] || '')) && f.len > 100 && f.ltr < 0.3 && f.lines.length >= 3 && f.lines[0].length < 40 && f.inMain && f.top > 0.1 && (f.tx('ago') ? /ago/i.test(f.lines.slice(0, 5).join(' ')) : true) && 'comments'],
  ['article-header-card', (f) => f.tag === 'header' && f.lm.includes('article') && f.index > 2 && f.len < 250 && f.lines.length >= 2 && f.lines.length <= 3 && 'teaser_card'],
  ['header-heading', (f) => f.tag === 'header' && f.headings >= 1 && f.len < 200 && f.index > 2 && !f.inHeader && f.images === 0 && 'heading'],
  ['header-title', (f) => (f.tag === 'header' || f.tag === 'hgroup') && f.headings > 0 && f.top < 0.25 && !f.inHeader && f.len < 400 && f.ltr < 0.3 && (f.index <= 2 || f.h('title')) && 'title'],

  // ---------------------------------------------------------------- media
  ['gallery', (f) => (f.tag === 'figure' || f.tag === 'img' || f.tag === 'picture' || f.h('gallery')) && (f.run && f.images >= 2 || f.imgs.filter((im) => im.width >= 100).length >= 3) && !f.h('card') && 'gallery'],
  ['figure-video', (f) => f.tag === 'figure' && (f.h('video') || /video/i.test(f.text)) && f.len < 60 && 'video'],
  ['figure-chart', (f) => f.tag === 'figure' && f.h('chart') && 'chart'],
  ['figure-map', (f) => f.tag === 'figure' && f.h('map') && 'map'],
  ['figure', (f) => (f.tag === 'figure' || f.tag === 'picture') && (f.len < 220 || f.ltr < 0.3) && 'image'],
  ['img', (f) => f.tag === 'img' && (f.imgs.length === 0 || f.iconsOnly ? 'decoration' : 'image')],
  ['svg', (f) => f.tag === 'svg' && (f.h('chart') ? 'chart' : 'decoration')],

  // ---------------------------------------------------------------- quotes, lists of a kind
  ['blockquote-testimonial', (f) => f.tag === 'blockquote' && (f.h('testimonial') || /commented|says|raves|reader/i.test(f.text.slice(0, 80))) && 'testimonial'],
  ['blockquote', (f) => f.tag === 'blockquote' && 'quote'],
  ['dl', (f) => f.tag === 'dl' && 'definition_list'],

  // ---------------------------------------------------------------- single controls
  ['control-search', (f) => /^(button|input|select|textarea|form)$/.test(f.tag) && (f.tx('search') || f.h('search') || f.inSearch) && 'search'],
  ['control-login', (f) => /^(button|input|form)$/.test(f.tag) && (f.h('login') || /password|log ?in|sign ?in/i.test(f.text)) && f.len < 200 && 'login_form'],
  ['control-newsletter', (f) => f.tag === 'form' && (f.h('newsletter') || f.tx('subscribe')) && 'newsletter'],
  ['control-form', (f) => f.tag === 'form' && (f.controls >= 2 || f.len > 60) && 'form'],
  ['control-pagination', (f) => /^(button|a|div|span)$/.test(f.tag) && f.tx('pagination') && f.len < 60 && 'pagination'],
  ['control-cta', (f) => /^(button|a)$/.test(f.tag) && f.tx('cta') && f.len < 80 && 'cta'],
  ['control-account', (f) => /^(button|a|div)$/.test(f.tag) && f.tx('signin') && f.len < 60 && 'account'],
  ['control-share', (f) => /^(button|a|div)$/.test(f.tag) && f.tx('share') && f.len < 40 && 'share'],
  ['control-version', (f) => /^(button|select|label|a)$/.test(f.tag) && (f.h('version') || /^(english|español|deutsch|français|italiano|português|日本語|中文|русский|aus|uk|us|int|edition)\b/i.test(f.text)) && f.len < 80 && 'version_switcher'],
  ['control-settings', (f) => /^(button|select|label)$/.test(f.tag) && f.h('settings') && 'settings'],
  ['control-button', (f) => /^(button|input|select|textarea|label)$/.test(f.tag) && 'action_button'],

  // ---------------------------------------------------------------- site furniture, by unmistakable signs
  ['cookie', (f) => (f.h('cookie') || f.inDialog && f.tx('cookie')) && f.tx('cookie') && (f.g.widthFraction >= 0.8 && f.height >= 400 && f.controls >= 2 ? 'consent_gate' : 'cookie_banner')],
  ['cookie-text', (f) => f.tx('cookie') && /accept|agree|manage|reject|settings|preferences/i.test(f.text) && f.len < 1500 && f.links <= 6 && (f.text.match(/cookie/gi) || []).length >= 2 && (f.top < 0.05 || f.top > 0.9 || f.inDialog) && 'cookie_banner'],
  ['skip-link', (f) => f.tx('skip') && f.len < 60 && 'skip_link'],
  ['breadcrumbs', (f) => (f.h('breadcrumb') || /breadcrumb/.test(f.hint)) && 'breadcrumbs'],
  ['breadcrumbs-shape', (f) => f.inNav && f.links >= 2 && f.links <= 6 && f.top < 0.12 && f.len < 120 && /[›>»\/·]|\n/.test(f.text) && f.lines.length <= 6 && !f.h('nav') && 'breadcrumbs'],
  ['pagination-hint', (f) => f.h('pagination') && f.len < 300 && 'pagination'],
  ['pagination-shape', (f) => f.tx('pagination') && f.len < 80 && f.links + f.controls >= 1 && 'pagination'],
  ['toc', (f) => (f.h('toc') || /^(contents|table of contents|in this article|on this page|jump to)\b/i.test(f.text)) && f.links >= 2 && 'table_of_contents'],
  ['footnote', (f) => (f.h('footnote') || /^\d+\.\s|^\[\d+\]|^\*|^†/.test(f.text) && f.top > 0.7 && f.len < 1500) && f.tag !== 'ol' && 'footnote'],
  ['footnote-ol', (f) => f.tag === 'ol' && f.h('footnote') && 'footnote'],
  ['references', (f) => (f.h('references') && (f.tag === 'ol' || f.tag === 'ul' || f.tag === 'div') && f.len > 200 || /\bretrieved\b|\barchived from\b|\bdoi:|\bisbn\b/i.test(f.text) && f.len > 200 && f.top > 0.6) && 'references'],
  ['legal', (f) => f.tx('legal') && f.len < 600 && f.ltr < 0.5 && f.links <= 3 && (f.top > 0.85 || f.inFooter || f.h('legal')) && !(f.inFooter && f.lastRegion) && 'legal_notice'],
  ['disclosure', (f) => f.tx('disclosure') && f.len < 800 && 'disclosure'],
  ['content-warning', (f) => f.tx('contentWarning') && f.len < 400 && 'content_warning'],
  ['age-gate', (f) => f.tx('agegate') && 'age_gate'],
  ['correction', (f) => f.tx('correction') && f.len < 600 && 'correction'],
  ['app-nag', (f) => f.tx('appNag') && f.len < 300 && 'app_nag'],
  ['paywall', (f) => (f.h('paywall') && f.len < 800 || f.tx('paywall') && f.len < 600 && f.links <= 3) && 'paywall'],
  ['feedback', (f) => f.tx('feedback') && f.len < 300 && 'feedback'],
  ['loading', (f) => (f.h('progress') || f.tx('loading')) && f.len < 400 && (f.h('empty') || f.tx('loading') ? 'progress' : 'progress')],
  ['empty-state', (f) => (f.h('empty') || f.tx('empty')) && f.len < 300 && 'empty_state'],
  ['error-state', (f) => f.tx('error') && f.len < 200 && 'status_message'],

  // ---------------------------------------------------------------- landmarks: header, nav, footer
  ['header-search', (f) => f.inHeader && (f.tx('search') || f.h('search') || f.inSearch) && f.len < 120 && 'search'],
  ['header-account', (f) => f.inHeader && f.tx('signin') && f.len < 80 && 'account'],
  ['header-subscribe', (f) => f.inHeader && f.tx('subscribe') && f.len < 80 && 'subscribe'],
  ['header-nav', (f) => f.inHeader && (f.inNav || f.h('nav')) && f.links >= 4 && 'site_nav'],
  ['header-linky', (f) => f.inHeader && f.linky && f.links >= 6 && f.len > 80 && 'site_nav'],
  ['header', (f) => f.inHeader && f.top < 0.08 && f.len < 600 && (f.tag !== 'p') && 'site_header'],
  ['footer-newsletter', (f) => f.inFooter && (f.h('newsletter') || f.tx('subscribe') && f.controls > 0) && 'newsletter'],
  ['footer-legal', (f) => f.inFooter && f.tx('legal') && f.ltr < 0.4 && f.links <= 3 && f.len < 500 && 'legal_notice'],
  ['footer-promo', (f) => f.inFooter && f.h('promo') && 'cross_promo'],
  ['footer', (f) => f.inFooter && 'site_footer'],
  ['nav-tabs', (f) => f.inNav && f.h('tabs') && 'tabs'],
  ['nav-top', (f) => f.inNav && f.top < 0.1 && f.links >= 4 && !f.h('breadcrumb') && (f.h('nav') || f.inHeader || f.repeated || f.links >= 8) && 'site_nav'],
  ['nav-version', (f) => f.inNav && (f.h('version') || /english|español|deutsch|français|日本語|中文/i.test(f.text)) && 'version_switcher'],
  ['nav-settings', (f) => f.inNav && f.h('settings') && 'settings'],
  ['nav-menu', (f) => f.inNav && f.top < 0.06 && f.links >= 4 && 'site_nav'],
  ['nav-section', (f) => f.inNav && f.links >= 2 && (f.tx('related') || f.h('related') ? 'related' : 'section_nav')],
  ['nav', (f) => f.inNav && 'section_nav'],
  ['top-account', (f) => f.top < 0.03 && f.tx('signin') && f.len < 80 && 'account'],
  ['top-search', (f) => f.top < 0.03 && (f.tx('search') || f.h('search')) && f.len < 100 && 'search'],
  ['top-notice', (f) => f.top < 0.02 && f.h('siteNotice') && f.len < 300 && 'site_notice'],
  ['top-header', (f) => f.top < 0.02 && f.first && f.len < 400 && f.links >= 1 && 'site_header'],
  ['top-linky', (f) => f.top < 0.03 && f.linky && f.links >= 5 && f.repeated && 'site_nav'],
  ['bottom-footer', (f) => f.top > 0.92 && (f.repeated || f.lastRegion) && f.links >= 3 && f.ltr > 0.4 && 'site_footer'],
  ['bottom-legal', (f) => f.top > 0.9 && f.tx('legal') && f.len < 500 && f.links <= 3 && 'legal_notice'],

  // ---------------------------------------------------------------- class and id hints, most specific first
  ['context-related', (f) => f.links >= 1 && f.len > 40 && /^(related|read more|you may also like|you might also like|recommended( for you)?|see also|more (from|on|like) |also (in|on) |further reading|more stories|explore more|next up|up next|discover more|you'll also love|most-saved)/i.test(f.prevText) && f.prevText.length < 40 && 'related'],
  ['context-trending', (f) => f.links >= 1 && f.len > 40 && /^(most (read|popular|viewed|shared|watched|commented)|trending|popular|top (stories|picks|rated)|hot network|what's hot|editor'?s picks|best ?sellers?)/i.test(f.prevText) && f.prevText.length < 80 && 'trending'],
  ['hint-comments-form', (f) => f.h('comments') && f.controls >= 1 && f.len < 200 && (/add a comment|leave a|reply/i.test(f.text) ? 'action_button' : 'form')],
  ['hint-comments', (f) => f.h('comments') && !f.h('rating') && (f.tx('comments') || f.len > 40 || f.run) && 'comments'],
  ['hint-reviews', (f) => (f.h('reviews') || f.tx('reviews')) && (f.len > 80 || f.run) && !f.h('rating') && 'reviews'],
  ['hint-rating', (f) => (f.h('rating') || f.tx('rating')) && f.len < 300 && !f.h('card') && 'rating'],
  ['hint-vote', (f) => (f.h('vote') || f.tx('vote')) && f.len < 300 && 'vote_controls'],
  ['hint-reaction', (f) => f.h('reaction') && f.len < 200 && 'reactions'],
  ['hint-share', (f) => (f.h('share') || f.tx('share')) && f.len < 200 && f.ltr < 0.9 && 'share'],
  ['hint-author-bio', (f) => (f.h('authorBio') || /^about the author|^written by\b/i.test(f.text)) && f.len > 40 && 'author_bio'],
  ['hint-byline', (f) => f.h('byline') && f.len < 500 && (f.tx('byline') || f.tx('ago') || f.len < 120) && 'byline'],
  ['hint-user', (f) => f.h('user') && f.len < 400 && 'user_card'],
  ['hint-tags', (f) => f.h('tags') && f.linky && f.avgLine < 30 && 'tag_cloud'],
  ['hint-trending', (f) => (f.h('trending') || f.tx('trending')) && f.links >= 2 && 'trending'],
  ['hint-related', (f) => (f.h('related') || f.tx('related')) && (f.links >= 1 || f.headings > 0) && f.len < 3000 && 'related'],
  ['hint-newsletter', (f) => f.h('newsletter') && 'newsletter'],
  ['hint-subscribe', (f) => (f.h('subscribe') || f.tx('subscribe')) && f.len < 600 && (f.controls > 0 || f.links > 0) && 'subscribe'],
  ['hint-sponsored', (f) => (f.h('sponsored') || /^(sponsored|promoted|paid|partner content|advertisement feature)\b/i.test(f.text)) && 'sponsored'],
  ['hint-ad', (f) => f.h('ad') && !f.h('card') && (f.len < 80 || /advertisement/i.test(f.text)) && 'ad'],
  ['hint-promo', (f) => f.h('promo') && 'cross_promo'],
  ['hint-toolbar', (f) => f.h('toolbar') && f.len < 400 && 'toolbar'],
  ['hint-page-tools', (f) => f.h('pageTools') && f.len < 300 && 'page_tools'],
  ['hint-hero', (f) => f.h('hero') && f.top < 0.2 && 'hero'],
  ['hint-testimonial', (f) => f.h('testimonial') && 'testimonial'],
  ['hint-pricing', (f) => f.h('pricing') && (f.len > 80 || /\$|£|€|per (month|year)/.test(f.text)) && 'pricing_table'],
  ['hint-logos', (f) => f.h('logos') && 'logo_cloud'],
  ['hint-team', (f) => f.h('team') && f.images >= 2 && 'team'],
  ['hint-stats', (f) => f.h('stats') && f.len < 400 && /\d/.test(f.text) && 'stats'],
  ['hint-cta', (f) => f.h('cta') && f.len < 400 && 'cta'],
  ['hint-feature', (f) => f.h('feature') && (f.run || f.headings >= 2 || f.items >= 3 || f.tag === 'button') && 'feature_grid'],
  ['hint-infobox', (f) => f.h('infobox') && 'infobox'],
  ['hint-callout', (f) => f.h('callout') && f.len > 20 && f.len < 1500 && 'callout'],
  ['hint-caption', (f) => f.h('caption') && f.len < 300 && 'image'],
  ['hint-accordion', (f) => f.h('accordion') && 'accordion'],
  ['hint-tabs', (f) => f.h('tabs') && f.len < 300 && 'tabs'],
  ['hint-filters', (f) => f.h('filters') && f.len < 600 && 'filters'],
  ['hint-search', (f) => f.h('search') && f.len < 200 && 'search'],
  ['hint-login', (f) => f.h('login') && f.len < 400 && 'login_form'],
  ['hint-account', (f) => f.h('account') && f.len < 120 && 'account'],
  ['hint-version', (f) => f.h('version') && f.len < 300 && 'version_switcher'],
  ['hint-settings', (f) => f.h('settings') && f.len < 300 && 'settings'],
  ['hint-metadata', (f) => (f.h('metadata') || f.h('nutrition') || f.tx('metadata') && f.avgLine < 40) && f.len < 800 && f.ltr < 0.6 && !f.h('card') && 'metadata'],
  ['hint-steps', (f) => (f.tag === 'ol' || f.h('steps')) && (f.h('steps') || f.tx('steps') && f.items >= 2) && 'steps'],
  ['hint-ingredients', (f) => (f.h('ingredients') || f.tx('ingredient')) && f.items >= 2 && 'list'],
  ['hint-poll', (f) => (f.h('poll') || f.tx('quiz')) && f.len < 400 && (f.controls > 0 || f.links > 0) && 'poll'],
  ['hint-chat', (f) => f.h('chat') && f.len < 400 && 'chat_widget'],
  ['hint-app-nag', (f) => f.h('appNag') && 'app_nag'],
  ['hint-site-notice', (f) => f.h('siteNotice') && f.len < 300 && 'site_notice'],
  ['hint-sticky', (f) => f.h('sticky') && f.len < 300 && 'sticky_bar'],
  ['hint-popup', (f) => (f.h('popup') || f.inDialog) && f.len < 800 && 'popup'],
  ['hint-contact', (f) => f.h('contact') && f.tx('contact') && f.len < 500 && 'contact_details'],
  ['hint-download', (f) => (f.h('download') || f.tx('download')) && f.links >= 1 && f.len < 400 && 'download'],
  ['hint-cart', (f) => f.h('cart') && 'cart'],
  ['hint-checkout', (f) => f.h('checkout') && 'checkout'],
  ['hint-buy', (f) => f.h('buy') && (f.controls > 0 || /\$|£|€|A\$|price|check/i.test(f.text)) && 'buy_box'],
  ['hint-product', (f) => f.h('product') && (f.run || f.images >= 1 && f.links >= 1) && /\$|£|€|A\$|\d+\.\d\d|price|rating|save/i.test(f.text) && 'product_card'],
  ['hint-map', (f) => f.h('map') && 'map'],
  ['hint-chart', (f) => f.h('chart') && 'chart'],
  ['hint-video', (f) => f.h('video') && f.len < 200 && 'video'],
  ['hint-audio', (f) => f.h('audio') && f.len < 200 && 'audio'],
  ['hint-transcript', (f) => f.h('transcript') && 'transcript'],
  ['hint-badge', (f) => f.h('badge') && f.len < 30 && 'badge'],
  ['hint-summary', (f) => f.h('summary') && f.len >= 30 && f.len < 800 && f.ltr < 0.4 && 'summary'],
  ['hint-title', (f) => f.h('title') && f.len < 200 && f.top < 0.3 && f.headings >= 1 && 'title'],
  ['hint-quote', (f) => f.h('quote') && f.len > 20 && 'quote'],
  ['hint-canvas', (f) => f.h('canvas') && f.height > 300 && 'canvas'],
  ['hint-external', (f) => f.h('external') && f.links >= 2 && 'external_links'],
  ['hint-legal', (f) => f.h('legal') && f.len < 600 && 'legal_notice'],
  ['hint-disclosure', (f) => f.h('disclosure') && 'disclosure'],
  ['hint-card', (f) => f.h('card') && (f.links >= 1 || f.run) && (f.images >= 1 || f.headings >= 1 || f.run || f.ltr > 0.5) && 'teaser_card'],
  ['hint-gallery', (f) => f.h('gallery') && f.images >= 2 && 'gallery'],
  ['hint-nav', (f) => f.h('nav') && f.links >= 3 && (f.top < 0.1 ? 'site_nav' : f.top > 0.9 ? 'site_footer' : 'section_nav')],
  ['hint-header', (f) => f.h('header') && f.top < 0.05 && f.len < 600 && 'site_header'],
  ['hint-footer', (f) => f.h('footer') && f.top > 0.7 && 'site_footer'],

  // ---------------------------------------------------------------- text says
  ['text-hn-subtext', (f) => f.tx('hnSubtext') && f.len < 200 && 'byline'],
  ['text-answer-footer', (f) => /share a link to this|improve this (answer|question)|cc by-sa/i.test(f.text) && 'byline'],
  ['text-byline', (f) => f.tx('byline') && f.len < 250 && f.paragraphs <= 1 && f.lines.length <= 8 && f.ltr < 0.8 && f.sentences <= 1 && 'byline'],
  ['text-answered', (f) => f.tx('answered') && f.len < 200 && 'metadata'],
  ['text-comments-head', (f) => f.tx('comments') && f.len < 60 && 'comments'],
  ['text-vote', (f) => f.tx('vote') && f.len < 200 && 'vote_controls'],
  ['text-cta', (f) => f.tx('cta') && f.len < 250 && (f.controls > 0 || f.links > 0) && 'cta'],
  ['text-contact', (f) => f.tx('contact') && f.len < 400 && f.tag !== 'p' && 'contact_details'],
  ['text-weather', (f) => f.tx('weather') && f.lines.length >= 4 && (f.rows > 0 || f.run ? 'table' : 'list')],
  ['text-nutrition', (f) => f.tx('nutrition') && f.len < 300 && 'metadata'],

  // ---------------------------------------------------------------- shape
  ['ol-steps', (f) => f.tag === 'ol' && f.tx('steps') && 'steps'],
  ['ul-ingredients', (f) => f.tag === 'ul' && f.tx('ingredient') && 'list'],
  ['linky-related', (f) => f.linky && f.tx('related') && 'related'],
  ['linky-trending', (f) => f.linky && f.tx('trending') && 'trending'],
  ['ul-main-list', (f) => f.tag === 'ul' && f.inMain && !f.inNav && !f.inAside && f.links >= 6 && f.images === 0 && f.headings === 0 && f.avgLine > 14 && 'list'],
  ['linky-tags', (f) => f.linky && f.links >= 4 && f.avgLine < 22 && f.lines.length >= 4 && f.images === 0 && f.headings === 0 && (f.h('tags') || f.tx('related') ? 'tag_cloud' : f.top < 0.12 ? 'site_nav' : f.top > 0.88 ? 'site_footer' : 'section_nav')],
  ['linky-cards', (f) => f.linky && (f.images >= 1 || f.headings >= 1) && f.avgLine > 20 && 'teaser_card'],
  ['linky-top', (f) => f.linky && f.top < 0.1 && f.links >= 5 && 'site_nav'],
  ['linky-bottom', (f) => f.linky && f.top > 0.88 && f.links >= 4 && 'site_footer'],
  ['linky-list', (f) => f.linky && f.items >= 3 && f.avgLine > 40 && 'list'],
  ['linky-repeated', (f) => f.linky && f.repeated && f.links >= 4 && (f.top < 0.5 ? 'site_nav' : 'site_footer')],
  ['linky-aside', (f) => f.linky && f.inAside && 'related'],
  ['linky-run', (f) => f.linky && f.run && 'teaser_card'],
  ['linky', (f) => f.linky && (f.links >= 6 ? (f.avgLine < 30 ? 'section_nav' : 'list') : f.avgLine > 50 ? 'teaser_card' : 'list')],
  ['card-article', (f) => (f.tag === 'article' || f.run && /^(div|li|article|section|tr)$/.test(f.tag)) && f.links >= 1 && (f.images >= 1 || f.headings >= 1) && f.ltr > 0.3 && f.len < 3000 && 'teaser_card'],
  ['card-index', (f) => /^(div|li|article|section|a|ol|ul|span|header)$/.test(f.tag) && f.links >= 1 && f.len >= 20 && f.len < 900 && f.avgLine < 90 && (f.sentences <= 3 || f.run) && !f.tx('comments') && (f.tx('byline') || f.tx('ago') || /topic:|\bby [A-Z]|\d+ (hrs?|mins?|hours?|minutes?|days?) ago|\|\s*(live|video|watch)\b/i.test(f.text) || f.images >= 1 && f.ltr > 0.15 || f.headings >= 1 && (f.ltr > 0.1 || f.run) && f.len >= 40 || f.tag === 'a' && f.lines.length <= 3 && (f.images >= 1 || /\d/.test(f.text) || f.h('card'))) && !f.inFooter && !f.inHeader && f.index > 0 && 'teaser_card'],
  ['card-single', (f) => /^(div|li|section|tr|a)$/.test(f.tag) && f.links >= 1 && f.images >= 1 && f.ltr > 0.35 && f.len < 800 && f.inMain && !f.inFooter && 'teaser_card'],
  ['comments-run', (f) => f.run && f.tx('ago') && f.len > 200 && f.ltr < 0.3 && 'comments'],
  ['comments-shape', (f) => (f.tx('ago') || /\bago\b/i.test(f.lines[1] || '') || /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(f.lines[1] || '')) && f.len > 120 && f.ltr < 0.3 && f.lines.length >= 3 && f.lines[0].length < 40 && f.inMain && f.top > 0.3 && 'comments'],
  ['reviews-run', (f) => f.run && f.tx('rating') && f.len > 300 && 'reviews'],
  ['summary-early', (f) => f.top < 0.25 && f.index <= 12 && f.len >= 50 && f.len <= 500 && f.ltr < 0.2 && f.paragraphs <= 1 && f.sentences <= 4 && !f.run && (f.prevTitleish || f.firstProse && f.tag === 'p') && 'summary'],
  // Modern card layouts link the whole card through one overlay anchor with an aria-label,
  // so link text is zero. A run of siblings that each carry a heading and a paragraph, or
  // a list whose items each carry a heading, is a row of cards whatever the link count.
  ['card-run', (f) => f.run && f.headings >= f.repeats && f.paragraphs + f.images >= f.repeats && f.len / f.repeats < 500 && !f.inFooter && !f.inHeader && 'teaser_card'],
  ['card-ul-headed', (f) => f.tag === 'ul' && f.items >= 2 && f.headings >= 2 && f.len / f.items < 400 && !f.inNav && 'teaser_card'],
  ['card-headed', (f) => /^(div|li|article|section)$/.test(f.tag) && f.headings >= 1 && f.images >= 1 && f.paragraphs >= 1 && f.len < 400 && f.sentences <= 3 && !f.inHeader && !f.inFooter && f.index > 0 && 'teaser_card'],
  ['ul-teasers', (f) => f.tag === 'ul' && f.links >= 2 && f.lines.length >= 4 && f.avgLine > 40 && f.ltr >= 0.15 && f.ltr < 0.7 && !f.inNav && !f.h('nav') && f.sentences <= f.lines.length / 2 && 'teaser_card'],
  ['ul-cards', (f) => (f.tag === 'ul' || f.tag === 'ol') && f.links >= 2 && (f.images >= 1 || f.headings >= 1) && (f.ltr > 0.2 || f.tx('ago') || f.headings >= 3) && 'teaser_card'],
  ['list-ul', (f) => (f.tag === 'ul' || f.tag === 'ol') && f.ltr < 0.6 && 'list'],
  ['prose-p', (f) => (f.tag === 'p' || f.paragraphs >= 1 && f.prose) && f.len >= 30 && f.ltr < 0.5 && 'text'],
  ['prose', (f) => f.prose && f.len >= 120 && 'text'],
  ['metadata-pairs', (f) => f.lines.length >= 4 && f.avgLine < 25 && f.ltr < 0.3 && f.len < 500 && /\d/.test(f.text) && 'metadata'],
  ['action-word', (f) => f.len < 40 && f.lines.length <= 2 && f.actionWord && f.links <= 1 && 'action_button'],
  ['button-like', (f) => f.len < 30 && f.controls >= 1 && f.links === 0 && 'action_button'],
  ['heading-like', (f) => f.headings >= 1 && f.len < 80 && f.ltr < 0.5 && 'heading'],
  ['short-link', (f) => f.len < 40 && f.links >= 1 && f.ltr > 0.7 && (f.tx('related') ? 'related' : f.tx('pagination') ? 'pagination' : 'action_button')],
  ['short-heading', (f) => f.len < 60 && f.lines.length <= 2 && f.links === 0 && f.controls === 0 && (f.images === 0 || f.iconsOnly) && !/[.!?]$/.test(f.text) && 'heading'],
  ['image-only', (f) => f.len === 0 && f.images >= 1 && (f.bigImage ? 'image' : 'decoration')],
  ['controls-only', (f) => f.len < 20 && f.controls >= 1 && 'action_button'],
  ['empty', (f) => f.len === 0 && 'decoration'],
  ['long-text', (f) => f.len >= 200 && f.ltr < 0.5 && 'text'],
  ['repeated-chrome', (f) => f.repeated && (f.top < 0.5 ? 'site_header' : 'site_footer')],
  ['list-items', (f) => f.items >= 2 && 'list'],
  ['fallback-text', (f) => f.len >= 80 && 'text'],
  ['fallback', (f) => 'unclear'],
];

function classify(f) {
  for (const [name, rule] of RULES) {
    const type = rule(f);
    if (type) return { type, rule: name };
  }
  return { type: 'unclear', rule: 'none' };
}

// Classify every region of every page. `pages` is [{ id, site, url, regions, ... }].
// Returns a Map of "pageId:index" -> { type, rule }.
function classifyAll(pages) {
  const index = siteIndex(pages);
  const out = new Map();
  for (const p of pages) {
    for (let i = 0; i < p.regions.length; i++) {
      out.set(`${p.id}:${i}`, classify(features(p, i, index)));
    }
  }
  return out;
}

module.exports = { RULES, classify, classifyAll };
