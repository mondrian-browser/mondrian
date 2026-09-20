// Features for the heuristic block classifier. NEXT.md B3.
//
// Everything here is derived from what the extractor already recorded for a region
// (tools/label/extract.js) plus two things only the whole corpus can supply: how many
// pages of the same site carry an identical region, and where the region sits among
// its page's regions. No model, no network, no page kind from pages.js; a browser at
// document-start would have all of this.
//
// The text signals follow Mozilla Readability (comma count, length bands, link density
// with in-page links discounted, the byline regex) and Postlight Parser (class and id
// hint lists). Both are cited in NEXT.md B3.

'use strict';

// Words in class, id, role and aria-label that say what a region is for. Order matters
// only where two hit the same region; the classifier checks them in its own order.
const HINTS = {
  cookie: /cookie|consent|gdpr|privacy-(banner|notice|center)|sp_message|sourcepoint/,
  comments: /\bcomment|disqus|discussion|conversation|replies|\bthread/,
  reviews: /\breview/,
  rating: /\brating|stars?\b|score/,
  vote: /\bvot(e|ing)|upvote|downvote|useful/,
  reaction: /reaction|\blike-|likes\b|clap|applause/,
  share: /\bshare|sharedaddy|social|addthis|sociable/,
  byline: /byline|author(?!-bio)|dateline|writtenby|p-author|timestamp|posted-on|post-meta|article-meta|entry-meta|meta-dynamic/,
  authorBio: /author-bio|bio\b|about-the-author|author-box|author-card/,
  related: /related|recommend|also-like|you-may|more-like|similar|read-more|more-from|further|see-also|hatnote/,
  trending: /trending|popular|most-read|most-viewed|most-shared|hot-network|top-stories|top-picks|best-?seller/,
  tags: /\btags?\b|topics?\b|keywords?|labels?\b|tag-cloud|tag-list|taglist/,
  newsletter: /newsletter|mailing|email-signup|formkit|seva-form/,
  subscribe: /subscribe|subscription|membership|member-only/,
  paywall: /paywall|regwall|meter|premium|locked|gate\b/,
  ad: /(^|[^a-z])ad([^a-z]|$)|advert|adbox|ad-unit|ad-slot|adslot|banner-ad|dfp|gpt-|taboola|outbrain|skyscraper|billboard|mpu\b|leaderboard/,
  sponsored: /sponsor|branded|partner-content|paid-post|promoted/,
  promo: /promo|cross-?promo|upsell|marketing|campaign|house-ad/,
  toolbar: /toolbar|tool-bar|actions-bar|action-bar/,
  pageTools: /page-tools|page-actions|article-tools|utility|utilities|print|save|bookmark/,
  hero: /\bhero|jumbotron|masthead-hero|splash|cover-wrap|billboard-hero/,
  testimonial: /testimonial|pull-?quote|quote-card|customer-story/,
  pricing: /pricing|price-table|plans?\b|tier/,
  cta: /\bcta\b|call-to-action|signup-cta|get-started|try-|start-/,
  card: /\bcard|teaser|story|promo-card|article-item|post-item|listing-item|result-item|product-item|entry-list|item-card|tile\b/,
  product: /product|listing|sku|price\b|buy/,
  infobox: /infobox|fact-?box|key-facts|at-a-glance|vcard|summary-box/,
  callout: /admonition|hatnote|\bnote\b|alert|notice|warning|callout|tip\b|important|caution|dyk|did-you-know/,
  caption: /caption|credit/,
  accordion: /accordion|collapsible|expandable|disclosure|details/,
  tabs: /\btabs?\b|tablist|tabbed|underline-?nav/,
  filters: /filter|facet|sort-?by|refine/,
  search: /search|searchbox|search-form|typeahead/,
  login: /login|log-in|signin|sign-in|password|auth\b/,
  account: /account|user-menu|profile-menu|avatar|signup|sign-up|register/,
  breadcrumb: /breadcrumb|crumb/,
  pagination: /paginat|pager\b|page-nav|load-more|show-more|see-more|next-page|prev-page/,
  toc: /\btoc\b|table-of-contents|tableofcontents|contents-list|in-this-article|jump-links|on-this-page|sidebar-nav|left-nav/,
  references: /reference|citation|reflist|cite|bibliograph|sources?\b|works-cited/,
  footnote: /footnote|fn-|endnote|noteref|sosumi|legal-footnote/,
  skip: /skip-?(to|link|nav)|visually-hidden|sr-only|screen-reader/,
  footer: /\bfooter|\bfoot\b|site-footer|page-footer|colophon/,
  header: /\bheader|masthead|site-header|page-header|top-?bar|navbar|global-nav|topbar/,
  nav: /\bnav\b|\bmenu|navigation|subnav|sidenav|sidebar-nav|section-nav|local-nav|tabs-nav/,
  legal: /legal|copyright|terms|disclaimer|imprint|impressum|sosumi|fine-?print/,
  disclosure: /disclosure|affiliate|why-trust|trust-|editorial-standards|how-we-test/,
  version: /version|edition|language|lang-|locale|switcher|dropdown-lang|region-select/,
  settings: /settings|preferences|appearance|theme|units/,
  steps: /instruction|direction|method|steps?\b|procedure|how-to/,
  ingredients: /ingredient/,
  nutrition: /nutrition/,
  gallery: /gallery|slideshow|carousel|slider|photos/,
  video: /video|player|youtube|vimeo|jwplayer|brightcove/,
  audio: /audio|podcast|listen/,
  chart: /\bchart|\bgraph\b|infographic|visuali[sz]ation|datawrapper|flourish/,
  map: /\bmap\b|leaflet|mapbox|google-maps/,
  code: /\bcode|highlight|syntax|prettyprint|codeblock/,
  quote: /blockquote|\bquote|pullquote/,
  stats: /\bstats?\b|statistic|counter|numbers|metrics|figures/,
  team: /\bteam\b|staff|people|members/,
  logos: /logo-?(cloud|wall|bar|grid)|trusted-by|as-seen|partners|customers-logos|clients/,
  feature: /feature|benefit|bento|value-prop|capabilit|solution/,
  form: /\bform\b|fieldset|input-group/,
  poll: /\bpoll|survey|quiz|vote-poll/,
  chat: /\bchat|intercom|drift|livechat|bot\b|assistant/,
  sticky: /sticky|fixed-bar|floating|toast|snackbar/,
  popup: /modal|popup|overlay|lightbox|dialog|interstitial/,
  empty: /empty|placeholder|skeleton|no-results|nothing/,
  progress: /progress|loading|spinner|skeleton|loader/,
  status: /status|flash|alert-success|alert-error/,
  hidden: /\bhidden\b|d-none|sr-only|visually-hidden/,
  decoration: /decorat|divider|separator|spacer|ornament|background|bg-|gradient|icon-only/,
  title: /\btitle|headline|heading-1|page-title|article-title|entry-title|post-title|firstheading|first-heading/,
  summary: /standfirst|\bdeck\b|\blede\b|lead\b|subtitle|sub-?head|excerpt|summary|description|abstract|intro\b|dek\b|teaser-text|tldr/,
  content: /article|entry-content|post-content|content-body|story-body|article-body|prose|rich-text|wysiwyg|body-copy|paragraph/,
  metadata: /\bmeta\b|details|specs?\b|specification|facts|info\b|properties|attributes|about-item|recipe-details/,
  transcript: /transcript/,
  correction: /correction|amend|clarification/,
  contentWarning: /content-warning|trigger-warning|sensitive|nsfw/,
  badge: /\bbadge|\blabel\b|pill\b|chip\b|flag\b|tag-label/,
  contact: /contact-(us|details|info)|\baddress|\bphone|email-us|get-in-touch|vcard/,
  download: /download|attachment|file-list|\bpdf\b/,
  cart: /\bcart|basket|bag\b/,
  checkout: /checkout|payment|billing/,
  buy: /buy-?box|add-to-cart|purchase|price-box|offer-box|deals?\b/,
  calendar: /calendar|schedule|dates|events/,
  canvas: /canvas|editor|workspace|whiteboard|drawing/,
  agegate: /age-?gate|age-verif|adult/,
  appNag: /app-banner|smart-banner|get-the-app|download-app|open-in-app|app-nag|install-app/,
  siteNotice: /site-notice|announcement|global-alert|banner-notice|top-notice|promo-bar/,
  external: /external-links|outbound|links-section/,
  user: /user-card|profile-card|user-info|author-card|member-card|hovercard/,
  feedback: /feedback|helpful|was-this|rate-this-page/,
};

const TEXT = {
  byline: /^\s*(by|von|par|written by|words by|photograph(y|s)? by)\b|last modified|modified on|answered|asked \d|edited \d|\b(by|von)\s+[A-Z][a-z]+\s+[A-Z]|published|updated on|updated \d|posted (on|by)|min(ute)?s? read|\b\d+ ?(hours?|days?|minutes?|weeks?|months?|years?) ago\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? \d{1,2},? \d{4}|\d{1,2} (jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]* \d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}/i,
  hnSubtext: /\d+ points? by \S+ .*\bcomments?\b|\bpoints? by\b/i,
  cookie: /\bcookies?\b|consent|we and our partners|accept all|manage (your )?(cookies|preferences|choices)|privacy (policy|settings)|personali[sz]ed ad/i,
  skip: /^skip (to|navigation)|^jump to (main|content|navigation)|^back to top/i,
  legal: /©|\(c\) ?\d{4}|copyright|all rights reserved|\bterms (of|&|and)\b|privacy policy|\bimprint\b|\bimpressum\b|is not responsible for|trademark|registered in/i,
  signin: /^(sign|log) ?in\b|^(sign|log) ?in ?(or|\/) ?(sign ?up|register|create)|sign in or register|create (a |an )?(free )?account|^register\b|^sign ?up\b|^log ?in\b|^my account|^account$|^profile$/i,
  subscribe: /\bsubscribe\b|\bsubscription\b|newsletter|sign up (for|to) (our|the)|get (our|the) (free )?newsletter|inbox|join (free|now|today)|become a (member|supporter)/i,
  paywall: /subscribe to (read|continue)|to continue reading|already (a )?subscriber|member-only|members only|log in to (read|view)|you('ve| have) reached|free articles? (left|remaining)|unlock (this|full|all)|premium (access|content|subscri)/i,
  related: /^(related|more|read more|you may also like|you might also like|recommended|see also|more (from|on|like|in) |also (in|on) |further reading|more stories|explore more|next up|up next|latest from|discover more)/i,
  trending: /^(most (read|popular|viewed|shared|commented)|trending|popular|top (stories|picks|rated)|hot network|what's hot|editor'?s picks|best ?sellers?)/i,
  comments: /^(comments?|discussion|responses?|replies|join the conversation|leave a (reply|comment)|add a comment|\d+ comments?)\b/i,
  reviews: /^(customer )?reviews?\b|\breviews? \(\d|\d+ reviews?\b|write a review/i,
  rating: /\d(\.\d)? ?(out of|\/) ?\d|\d+(,\d{3})* ratings?|★|☆|stars?\b.*\d|\brate (this|it)\b|rating/i,
  vote: /^(upvote|downvote|vote)|this (answer|question) (is|shows)|useful|not useful|\+\d+\b.*\b\d+$|▲|▼/i,
  share: /^(share|share this|share on|copy link|tweet|email this|print)\b/i,
  pagination: /^(load more|show more|see (all|more)|more results|view (all|more)|next( page)?|previous( page)?|older|newer|page \d|\d+ of \d+|«|»|›|‹|→|←)\b|^(\d+\s*){3,}$/i,
  search: /^search\b|search the site|search for|^find\b|type to search|search\.\.\.|^q$/i,
  cta: /^(get started|start (now|free|your)|try (it|now|free)|sign up (now|free)|learn more|download (now|the app)|buy now|shop now|contact (us|sales)|book (now|a demo)|request (a )?demo|join (now|us|free)|apply now|donate|support us|find out more|see how|watch now|listen now|read (the )?story|explore)\b/i,
  appNag: /(get|open|download|use) (the |our )?app\b|available on the app store|get it on google play|continue in (the )?app|better in the app/i,
  contact: /\b(tel|call us|email us|contact us|opening hours|\+\d{1,3}[ -]?\d{2,4}[ -]?\d{3,4})\b/i,
  ago: /\b(\d+|a|an|over a) ?(hours?|days?|minutes?|weeks?|months?|years?|h|d|m) ago\b|\byesterday\b|\btoday\b/i,
  answered: /^(answered|asked|edited|modified|viewed)\b/i,
  steps: /^(step \d|\d+\.\s)|^(preheat|mix|stir|add|bake|whisk|combine|heat|cook|pour|place|remove|serve|let|cool|beat|fold|roll|cut|chop|slice|drain|season|bring|reduce|simmer|fry|grill|roast|boil)\b/i,
  ingredient: /^\d+([\/.]\d+)? ?(cups?|tbsp|tsp|tablespoons?|teaspoons?|g|kg|ml|l|oz|lb|pounds?|ounces?|cloves?|large|medium|small|pinch|handful)\b/i,
  nutrition: /calories|\bfat\b|\bcarbs?\b|protein|sodium|nutrition/i,
  metadata: /(prep|cook|total) time|servings?|yield|serves|difficulty|\bversion\b|licen[cs]e|file size|word count|released? (on|date)|runtime|genre|director|writer|stars?:|born|died|founded|population|isbn|price:|\bsku\b/i,
  loading: /^loading|lorem ipsum|nulla facilisi|please wait|^…$|^\.\.\.$/i,
  empty: /no (results|comments|items|posts|reviews) (yet|found)|nothing (here|to show|found)|be the first to|your (cart|basket|list) is empty/i,
  error: /something went wrong|try again|an error occurred|could not load|failed to load/i,
  quiz: /\bquiz\b|\bpoll\b|vote now|what do you think\?|take our|test your/i,
  correction: /^(correction|clarification|editor'?s note|this (article|story) (was|has been) (corrected|amended|updated))/i,
  disclosure: /affiliate|we may earn|commission|sponsored by|paid partnership|why you can trust|our (expert|review) process|how we test|editorial (independence|standards)|advertiser disclosure/i,
  contentWarning: /content warning|trigger warning|may (be|contain|find) (upsetting|distressing|disturbing)|viewer discretion|contains (strong|explicit|graphic)/i,
  agegate: /are you (over|at least) 1[89]|(confirm|verify) (your|you are of) (legal )?age|enter your (date of )?birth|must be 1[89]/i,
  feedback: /was this (page |article )?(helpful|useful)|rate this page|give feedback|report (a )?(problem|bug|abuse|issue)|send feedback|tell us what you think/i,
  download: /\bdownload\b|\.pdf\b|\.zip\b|\.docx?\b|\.xlsx?\b|\(pdf,? ?\d|\bkb\b|\bmb\b/i,
  cart: /\b(cart|basket|bag)\b.*\b\d|\d+ items? in (your )?(cart|basket)|add(ed)? to (cart|basket|bag)/i,
  checkout: /checkout|proceed to payment|place (your )?order|payment (method|details)|billing address|shipping address/i,
  weather: /°[CF].*°[CF]|\bfeels like\b|\bchance of (rain|showers)/i,
  transcript: /^\[?\d{1,2}:\d{2}(:\d{2})?\]?|^[A-Z][a-z]+ ?[A-Z]?[a-z]*: /,
  dictionary: /\bnoun\b|\bverb\b|\badjective\b|pronunciation|\/[a-zˈˌːə]+\//i,
};

// Signature for "the same region on another page of this site": tag, first class and
// the first 60 characters of text, case and whitespace folded.
function signature(r) {
  const cls = (r.class || '').split(/\s+/)[0] || '';
  return `${r.tag.replace(/×\d+$/, '')}|${cls}|${(r.text || '').toLowerCase().replace(/\s+/g, ' ').slice(0, 60)}`;
}

// Build the per-site repetition index from every page's regions. Returns a Map of
// signature -> Set of page ids, and a Map of site -> number of pages.
function siteIndex(pages) {
  const sigPages = new Map();
  const sitePages = new Map();
  for (const p of pages) {
    sitePages.set(p.site, (sitePages.get(p.site) || 0) + 1);
    const seen = new Set();
    for (const r of p.regions) {
      if (!r.text || r.textLength < 6) continue; // empty regions repeat for no reason
      const k = `${p.site}|${signature(r)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (!sigPages.has(k)) sigPages.set(k, new Set());
      sigPages.get(k).add(p.id);
    }
  }
  return { sigPages, sitePages };
}

const word = (s) => (s.match(/\S+/g) || []).length;

// Features for one region. `page` is the page record from run.js (id, site, url,
// regions, viewport, pageHeight), `i` the region's index, `index` the site index.
function features(page, i, index) {
  const r = page.regions[i];
  const text = r.text || '';
  const t = text.trim();
  const lower = t.toLowerCase();
  const hint = [r.class, r.id, r.role, r.ariaLabel].filter(Boolean).join(' ').toLowerCase();
  const tag = r.tag.replace(/×\d+$/, '');
  const run = /×\d+$/.test(r.tag);
  const lines = t ? t.split('\n').map((l) => l.trim()).filter(Boolean) : [];
  const words = word(t);
  const commas = (t.match(/[,،，]/g) || []).length;
  const sentences = (t.match(/[.!?](\s|$)/g) || []).length;
  const avgLine = lines.length ? t.length / lines.length : 0;
  const lm = r.landmarks || [];
  const last = lm[lm.length - 1] || '';
  const pagesOfSite = index.sitePages.get(page.site) || 1;
  const rep = index.sigPages.get(`${page.site}|${signature(r)}`);
  const repeatPages = rep ? rep.size : 0;
  const c = r.counts;
  const h = (name) => HINTS[name].test(hint);
  const tx = (name) => TEXT[name].test(t);
  const capsWords = (t.match(/\b[A-Z][A-Z]{2,}\b/g) || []).length;

  return {
    r, tag, run, text: t, lower, hint, lines, words, commas, sentences, avgLine,
    len: r.textLength, ltr: tag === 'a' ? 1 : r.linkTextRatio, c,
    links: c.links + (tag === 'a' ? 1 : 0), images: c.images, headings: c.headings, items: c.listItems, rows: c.tableRows, controls: c.controls, paragraphs: c.paragraphs, repeats: c.repeats,
    imgs: r.images || [], bigImage: (r.images || []).some((im) => im.width >= 120 && im.height >= 80), iconsOnly: (r.images || []).length > 0 && (r.images || []).every((im) => im.width < 64 && im.height < 64),
    frame: r.frame,
    lm, last,
    inHeader: lm.includes('header') || lm.includes('role=banner'),
    inFooter: lm.includes('footer') || lm.includes('role=contentinfo'),
    inNav: lm.includes('nav') || lm.includes('role=navigation'),
    inMain: lm.includes('main') || lm.includes('role=main') || lm.includes('article'),
    inAside: lm.includes('aside') || lm.includes('role=complementary'),
    inForm: lm.includes('form') || lm.includes('role=form') || tag === 'form',
    inDialog: lm.includes('dialog') || lm.includes('role=dialog') || r.role === 'dialog',
    inSearch: lm.includes('role=search'),
    g: r.geometry, top: r.geometry.pageFraction, aboveFold: r.geometry.aboveFold, height: r.geometry.height, wide: r.geometry.widthFraction >= 0.6, narrow: r.geometry.widthFraction <= 0.35,
    pos: i / Math.max(page.regions.length - 1, 1), first: i === 0, lastRegion: i === page.regions.length - 1, index: i,
    prev: page.regions[i - 1], next: page.regions[i + 1],
    repeatPages, repeated: pagesOfSite >= 2 && repeatPages >= 2, repeatFrac: pagesOfSite >= 2 ? repeatPages / pagesOfSite : 0, pagesOfSite,
    h, tx, capsWords,
    actionWord: /\b(save|share|cook mode|rss|feed|follow|subscribe|add|jump|expand|collapse|show|hide|load|copy|print|reply|edit|rate|report|more|close|open|menu|search|play|pause|mute|like|bookmark|merken|hinzufügen|zur merkliste|teilen|speichern|read more|see all|view all|sign|log|get|try|start|go to|skip|next|previous|back|submit|send|post|comment|upvote|downvote|vote|watch|listen|download|install|buy|cart|checkout|apply|donate|join|register|continue|accept|reject|agree|dismiss|ok|yes|no|cancel)\b/i.test(t),
    prevText: (page.regions[i - 1] || {}).text || '',
    firstProse: !page.regions.slice(0, i).some((q) => (q.tag === 'p' || /^p×/.test(q.tag) || q.counts.paragraphs >= 1) && q.textLength >= 300 && q.linkTextRatio < 0.3), prevTitleish: [1, 2, 3].some((k) => { const q = page.regions[i - k]; return q && (/^(h1|header|hgroup)/.test(q.tag) || q.counts.headings >= 1 && q.textLength < 160); }),
    short: r.textLength < 40, tiny: r.textLength < 16, prose: r.textLength >= 80 && r.linkTextRatio < 0.3 && (sentences > 0 || commas > 0 || words > 15),
    linky: r.linkTextRatio >= 0.6 && c.links >= 3,
  };
}

module.exports = { HINTS, TEXT, features, siteIndex, signature };
