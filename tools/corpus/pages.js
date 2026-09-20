// The corpus page list. NEXT.md B1, ADR 0008.
//
// Spread beats favourites, and several pages per site is load-bearing: a region that
// repeats identically across pages of one site is the strongest chrome signal there is.
//
// Each entry: id (the folder name under corpus/pages/), url, site, kind, tier.
//   kind  what the page is for a reader; the labels are free text, not a taxonomy.
//   tier  the rendering tier the page would get today (ADR 0011): relayout, skinned or
//         contained. A first guess, recorded so the coverage number exists from the
//         first scorecard. Lloyd confirms or changes it.
//   via   instead of a fixed url, follow the first link matching `selector` (and, if
//         given, whose href matches the regex `pattern`) on the already-captured page
//         `page`. For sites whose article URLs change daily.
//   notes anything the person reviewing the capture should know.

'use strict';

const PAGES = [
  // ---- news
  { id: 'bbc-news-index', url: 'https://www.bbc.com/news', site: 'bbc.com', kind: 'news index', tier: 'relayout' },
  { id: 'bbc-news-tech', url: 'https://www.bbc.com/news/technology', site: 'bbc.com', kind: 'news section index', tier: 'relayout' },
  { id: 'bbc-news-article', via: { page: 'bbc-news-index', selector: 'a[href*="/news/articles/"]' }, site: 'bbc.com', kind: 'news article', tier: 'relayout' },
  { id: 'bbc-news-article-2', via: { page: 'bbc-news-tech', selector: 'a[href*="/news/articles/"]' }, site: 'bbc.com', kind: 'news article', tier: 'relayout' },
  { id: 'abc-news-index', url: 'https://www.abc.net.au/news', site: 'abc.net.au', kind: 'news index', tier: 'relayout' },
  { id: 'abc-news-article', via: { page: 'abc-news-index', selector: 'a[href*="/news/20"]' }, site: 'abc.net.au', kind: 'news article', tier: 'relayout' },
  { id: 'guardian-index', url: 'https://www.theguardian.com/international', site: 'theguardian.com', kind: 'news index, consent banner', tier: 'relayout' },
  { id: 'guardian-article', via: { page: 'guardian-index', selector: 'a[href*="theguardian.com/"][href*="/20"]' }, site: 'theguardian.com', kind: 'news article, consent banner', tier: 'relayout' },

  // ---- paywalls and consent walls
  { id: 'economist-index', url: 'https://www.economist.com/', site: 'economist.com', kind: 'news front, paywall', tier: 'relayout' },
  { id: 'economist-article', via: { page: 'economist-index', selector: 'a[href*="/2026/"]:not([href*="/interactive/"])' }, site: 'economist.com', kind: 'paywalled article', tier: 'relayout' },
  { id: 'nytimes-index', url: 'https://www.nytimes.com/', site: 'nytimes.com', kind: 'news front, paywall', tier: 'relayout' },
  { id: 'nytimes-article', via: { page: 'nytimes-index', selector: 'a[href*="nytimes.com/20"]' }, site: 'nytimes.com', kind: 'paywalled article', tier: 'relayout' },
  { id: 'spiegel-index', url: 'https://www.spiegel.de/', site: 'spiegel.de', kind: 'news front, consent wall (German)', tier: 'relayout', notes: 'Expect a full-screen consent dialog. Capture it as it appears.' },
  { id: 'medium-tag', url: 'https://medium.com/tag/programming', site: 'medium.com', kind: 'blog listing, sign-up prompt', tier: 'relayout' },
  { id: 'medium-post', via: { page: 'medium-tag', selector: 'a[href*="?source=topic_portal---selected_stories"]', pattern: '-[0-9a-f]{10,12}[?]' }, site: 'medium.com', kind: 'blog post, metered paywall, app nag', tier: 'relayout' },

  // ---- long-form essays and blogs
  { id: 'pg-essay-1', url: 'https://paulgraham.com/greatwork.html', site: 'paulgraham.com', kind: 'long essay, table layout', tier: 'relayout' },
  { id: 'pg-essay-2', url: 'https://paulgraham.com/ds.html', site: 'paulgraham.com', kind: 'essay with footnotes, table layout', tier: 'relayout' },
  { id: 'pg-index', url: 'https://paulgraham.com/articles.html', site: 'paulgraham.com', kind: 'essay index', tier: 'relayout' },
  { id: 'substack-index', url: 'https://www.astralcodexten.com/', site: 'astralcodexten.com', kind: 'newsletter front, subscribe prompt', tier: 'relayout' },
  { id: 'substack-post', via: { page: 'substack-index', selector: 'a[href*="/p/"]' }, site: 'astralcodexten.com', kind: 'newsletter post, subscribe prompt, comments', tier: 'relayout' },
  { id: 'devto-article', url: 'https://dev.to/t/javascript', site: 'dev.to', kind: 'blog listing', tier: 'relayout' },
  { id: 'devto-post', via: { page: 'devto-article', selector: 'a[id^="article-link-"]' }, site: 'dev.to', kind: 'blog post with reactions', tier: 'relayout' },

  // ---- documentation
  { id: 'mdn-innertext', url: 'https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/innerText', site: 'developer.mozilla.org', kind: 'documentation page, compatibility table', tier: 'relayout' },
  { id: 'mdn-flexbox', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_flexible_box_layout/Basic_concepts_of_flexbox', site: 'developer.mozilla.org', kind: 'documentation guide, live examples', tier: 'relayout' },
  { id: 'python-json', url: 'https://docs.python.org/3/library/json.html', site: 'docs.python.org', kind: 'documentation, versioned', tier: 'relayout' },
  { id: 'python-tutorial', url: 'https://docs.python.org/3/tutorial/controlflow.html', site: 'docs.python.org', kind: 'documentation tutorial', tier: 'relayout' },

  // ---- reference and tables
  { id: 'wiki-mondrian', url: 'https://en.wikipedia.org/wiki/Piet_Mondrian', site: 'en.wikipedia.org', kind: 'encyclopaedia article, infobox', tier: 'relayout' },
  { id: 'wiki-population', url: 'https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_population', site: 'en.wikipedia.org', kind: 'encyclopaedia list, large sortable table', tier: 'relayout' },
  { id: 'wiki-melbourne', url: 'https://en.wikipedia.org/wiki/Melbourne', site: 'en.wikipedia.org', kind: 'encyclopaedia article, long, many tables', tier: 'relayout' },
  { id: 'premierleague-table', url: 'https://www.premierleague.com/tables', site: 'premierleague.com', kind: 'league table', tier: 'relayout' },
  { id: 'worldometers', url: 'https://www.worldometers.info/world-population/population-by-country/', site: 'worldometers.info', kind: 'plain data table, ad-heavy', tier: 'relayout' },
  { id: 'bom-melbourne', url: 'https://www.bom.gov.au/vic/forecasts/melbourne.shtml', site: 'bom.gov.au', kind: 'weather forecast, old government layout', tier: 'relayout' },

  // ---- forums and Q&A
  { id: 'hn-front', url: 'https://news.ycombinator.com/', site: 'news.ycombinator.com', kind: 'forum listing, table layout', tier: 'relayout' },
  { id: 'hn-thread', url: 'https://news.ycombinator.com/item?id=3078128', site: 'news.ycombinator.com', kind: 'forum thread, nested comments', tier: 'relayout' },
  { id: 'reddit-login-wall', url: 'https://old.reddit.com/r/programming/', site: 'old.reddit.com', kind: 'login wall (old.reddit redirects signed-out visitors)', tier: 'relayout', notes: 'Captured on purpose: a wall is something the filter must recognise.' },
  { id: 'reddit-listing', url: 'https://www.reddit.com/r/programming/', site: 'reddit.com', kind: 'forum listing, single-page app', tier: 'relayout' },
  { id: 'reddit-thread', via: { page: 'reddit-listing', selector: 'a[href*="/comments/"]' }, site: 'reddit.com', kind: 'forum thread, nested comments, vote controls', tier: 'relayout' },
  { id: 'so-sorted-array', url: 'https://stackoverflow.com/questions/11227809/why-is-processing-a-sorted-array-faster-than-processing-an-unsorted-array', site: 'stackoverflow.com', kind: 'Q&A, code blocks, votes', tier: 'relayout' },
  { id: 'so-yield', url: 'https://stackoverflow.com/questions/231767/what-does-the-yield-keyword-do-in-python', site: 'stackoverflow.com', kind: 'Q&A, many answers', tier: 'relayout' },

  // ---- video
  { id: 'youtube-watch', url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', site: 'youtube.com', kind: 'video page, sidebar, comments', tier: 'skinned', notes: 'Clean YouTube rule set is on; capture reflects it. Big Buck Bunny.' },
  { id: 'youtube-results', url: 'https://www.youtube.com/results?search_query=piet+mondrian', site: 'youtube.com', kind: 'video search results', tier: 'skinned' },

  // ---- shopping and products
  { id: 'ebay-search', url: 'https://www.ebay.com.au/sch/i.html?_nkw=usb+c+cable', site: 'ebay.com.au', kind: 'product listing, filters', tier: 'relayout' },
  { id: 'ebay-item', via: { page: 'ebay-search', selector: 'a[href*="/itm/"]' }, site: 'ebay.com.au', kind: 'product page, gallery, buy box', tier: 'relayout' },
  { id: 'raspberrypi-product', url: 'https://www.raspberrypi.com/products/raspberry-pi-5/', site: 'raspberrypi.com', kind: 'product page, spec table', tier: 'relayout' },
  { id: 'jbhifi-listing', url: 'https://www.jbhifi.com.au/collections/computers-tablets/laptops', site: 'jbhifi.com.au', kind: 'shop listing, single-page app', tier: 'skinned' },

  // ---- search results
  { id: 'ddg-web', url: 'https://duckduckgo.com/?q=piet+mondrian&ia=web', site: 'duckduckgo.com', kind: 'web search results', tier: 'relayout' },
  { id: 'ddg-web-2', url: 'https://duckduckgo.com/?q=how+to+bake+bread&ia=web', site: 'duckduckgo.com', kind: 'web search results, instant answer', tier: 'relayout' },

  // ---- government
  { id: 'govuk-licence', url: 'https://www.gov.uk/renew-driving-licence', site: 'gov.uk', kind: 'government service page', tier: 'relayout' },
  { id: 'govuk-start', url: 'https://www.gov.uk/apply-first-provisional-driving-licence', site: 'gov.uk', kind: 'government service start page', tier: 'relayout' },
  { id: 'ato-index', url: 'https://www.ato.gov.au/individuals-and-families/your-tax-return', site: 'ato.gov.au', kind: 'government information', tier: 'relayout' },
  { id: 'services-australia', url: 'https://www.servicesaustralia.gov.au/medicare', site: 'servicesaustralia.gov.au', kind: 'government service hub', tier: 'relayout' },

  // ---- recipes
  { id: 'allrecipes-cookies', url: 'https://www.allrecipes.com/recipe/10813/best-chocolate-chip-cookies/', site: 'allrecipes.com', kind: 'recipe, ad-heavy, reviews', tier: 'relayout' },
  { id: 'allrecipes-banana', url: 'https://www.allrecipes.com/recipe/20144/banana-banana-bread/', site: 'allrecipes.com', kind: 'recipe, ad-heavy, reviews', tier: 'relayout' },
  { id: 'bbcgoodfood-victoria', url: 'https://www.bbcgoodfood.com/recipes/classic-victoria-sandwich-recipe', site: 'bbcgoodfood.com', kind: 'recipe', tier: 'relayout' },
  { id: 'sallys-recipe', url: 'https://sallysbakingaddiction.com/chewy-chocolate-chip-cookies/', site: 'sallysbakingaddiction.com', kind: 'recipe blog, long preamble, ads, jump link', tier: 'relayout' },

  // ---- health
  { id: 'nhs-flu', url: 'https://www.nhs.uk/conditions/flu/', site: 'nhs.uk', kind: 'health information', tier: 'relayout' },
  { id: 'nhs-index', url: 'https://www.nhs.uk/conditions/', site: 'nhs.uk', kind: 'A-Z index', tier: 'relayout' },

  // ---- entities, ratings, reviews
  { id: 'imdb-title', url: 'https://www.imdb.com/title/tt0111161/', site: 'imdb.com', kind: 'entity page, ratings, reviews', tier: 'relayout' },
  { id: 'imdb-name', url: 'https://www.imdb.com/name/nm0000151/', site: 'imdb.com', kind: 'person page, filmography', tier: 'relayout' },

  // ---- marketing
  { id: 'stripe-home', url: 'https://stripe.com/au', site: 'stripe.com', kind: 'marketing landing', tier: 'relayout' },
  { id: 'apple-iphone', url: 'https://www.apple.com/iphone/', site: 'apple.com', kind: 'marketing landing, heavy animation', tier: 'relayout' },

  // ---- deliberately awful
  { id: 'tomshardware-index', url: 'https://www.tomshardware.com/', site: 'tomshardware.com', kind: 'tech news front, ad-heavy', tier: 'relayout' },
  { id: 'tomshardware-article', via: { page: 'tomshardware-index', selector: 'a.article-link' }, site: 'tomshardware.com', kind: 'tech article, ad-heavy, anti-adblock', tier: 'relayout' },
  { id: 'forbes-article', url: 'https://www.forbes.com/sites/', site: 'forbes.com', kind: 'article listing, ad-heavy, interstitials', tier: 'relayout' },
  { id: 'genius-lyrics', url: 'https://genius.com/Bob-dylan-blowin-in-the-wind-lyrics', site: 'genius.com', kind: 'lyrics with annotations, ad-heavy', tier: 'relayout' },

  // ---- repository (document-like application)
  { id: 'github-repo', url: 'https://github.com/electron/electron', site: 'github.com', kind: 'repository home, README', tier: 'skinned' },
  { id: 'github-issues', url: 'https://github.com/electron/electron/issues', site: 'github.com', kind: 'issue list, filters', tier: 'skinned' },
  { id: 'github-file', url: 'https://github.com/electron/electron/blob/main/README.md', site: 'github.com', kind: 'file view', tier: 'skinned' },

  // ---- PDF
  { id: 'arxiv-pdf', url: 'https://arxiv.org/pdf/1706.03762', site: 'arxiv.org', kind: 'PDF in the built-in viewer', tier: 'contained' },

  // ---- applications
  { id: 'excalidraw', url: 'https://excalidraw.com/', site: 'excalidraw.com', kind: 'application, canvas', tier: 'contained' },
  { id: 'photopea', url: 'https://www.photopea.com/', site: 'photopea.com', kind: 'application, image editor', tier: 'contained' },
  { id: 'openstreetmap', url: 'https://www.openstreetmap.org/#map=14/-37.8136/144.9631', site: 'openstreetmap.org', kind: 'application, map', tier: 'contained' },
  { id: 'squoosh', url: 'https://squoosh.app/', site: 'squoosh.app', kind: 'application, image tool', tier: 'contained' },
  { id: 'diagrams-net', url: 'https://app.diagrams.net/', site: 'app.diagrams.net', kind: 'application, diagram editor, start dialog', tier: 'contained' },
];

module.exports = { PAGES };
