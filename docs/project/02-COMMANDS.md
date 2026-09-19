# Command reference

Every command the browser understands. Each is exposed as an MCP tool named
`mcp__remote-devices__cbrowser__<name>` once the server is registered, and the browser's
own interface calls the identical set.

**Generated from `shared/commands.js` by `npm run docs`. Do not edit by hand.**
44 commands, 9 groups.


## Browser itself

### `status`

Browser status: version, window, profiles, tab count, active tab, connected clients, loaded rule sets.

No arguments.

### `app_restart`

Restart the browser. Needed after changing anything under app/main (preloads and main-process code are not hot-reloadable). Tabs are not restored. The control socket drops and comes back within a few seconds; just call status again.

| argument | type | required | notes |
|---|---|---|---|
| `quit` | boolean |  | Quit without relaunching. Default `false`. |

### `window`

Control the browser window: focus, minimize, maximize, restore, fullscreen, setBounds, close (closing the window quits the browser).

| argument | type | required | notes |
|---|---|---|---|
| `action` | "focus" \| "minimize" \| "maximize" \| "restore" \| "fullscreen" \| "unfullscreen" \| "setBounds" \| "close" \| "get" | yes |  |
| `bounds` | object |  |  |

## Tabs and navigation

### `tabs_list`

List open tabs with id, url, title, profile, loading state and which one is active.

No arguments.

### `tab_open`

Open a new tab. Returns the tab. Waits for the page to finish loading unless wait is false.

| argument | type | required | notes |
|---|---|---|---|
| `url` | string |  | URL to load. Defaults to the home page. |
| `profile` | string |  | Profile (isolated cookie jar) to open it in. Created on first use. Defaults to the settings default profile. |
| `activate` | boolean |  | Bring the tab to the front. Default `true`. |
| `wait` | boolean |  | Wait for load to finish (up to 20 s). Default `true`. |

### `tab_close`

Close a tab.

| argument | type | required | notes |
|---|---|---|---|
| `tabId` | string | yes | Tab id to close. |

### `tab_activate`

Bring a tab to the front.

| argument | type | required | notes |
|---|---|---|---|
| `tabId` | string | yes |  |

### `navigate`

Load a URL in a tab and wait for it to finish loading. A bare search phrase is sent to the search engine.

| argument | type | required | notes |
|---|---|---|---|
| `tabId` | string |  | Tab id. Omit for the active tab. |
| `url` | string | yes | URL, or a search phrase. |
| `wait` | boolean |  |  Default `true`. |

### `history`

Back, forward, reload or stop in a tab.

| argument | type | required | notes |
|---|---|---|---|
| `tabId` | string |  | Tab id. Omit for the active tab. |
| `action` | "back" \| "forward" \| "reload" \| "stop" | yes |  |

### `wait_for`

Wait until a condition holds: page load finished, a selector exists, text appears, or the URL contains a string. Returns when met or times out.

| argument | type | required | notes |
|---|---|---|---|
| `tabId` | string |  | Tab id. Omit for the active tab. |
| `load` | boolean |  | Wait for the current load to finish. |
| `selector` | string |  |  |
| `text` | string |  | Case-insensitive text somewhere in the page. |
| `urlIncludes` | string |  |  |
| `timeoutMs` | number |  |  Default `15000`. |

## Reading a page

### `page_text`

Readable text of the page (title, url, main text with whitespace collapsed). Cheapest way to read a page.

| argument | type | required | notes |
|---|---|---|---|
| `tabId` | string |  | Tab id. Omit for the active tab. |
| `selector` | string |  | Limit to this element. |
| `maxChars` | number |  |  Default `20000`. |

### `page_read`

Structured view of the page: one line per element with a ref you can pass to click, type, hover, scroll. Default filter is interactive elements plus headings; use "all" for text too.

| argument | type | required | notes |
|---|---|---|---|
| `tabId` | string |  | Tab id. Omit for the active tab. |
| `filter` | "interactive" \| "all" |  |  Default `"interactive"`. |
| `selector` | string |  | Only elements inside this container. |
| `maxItems` | number |  |  Default `300`. |

### `find`

Find elements by visible text, label, placeholder, title, alt or aria-label (case-insensitive substring). Returns refs.

| argument | type | required | notes |
|---|---|---|---|
| `tabId` | string |  | Tab id. Omit for the active tab. |
| `query` | string | yes |  |
| `maxItems` | number |  |  Default `20`. |

### `screenshot`

Screenshot of the tab viewport (or a single element). Returns an image scaled to at most maxWidth px wide.

| argument | type | required | notes |
|---|---|---|---|
| `tabId` | string |  | Tab id. Omit for the active tab. |
| `ref` | string |  | Element ref from page_read or find, e.g. "e12". |
| `selector` | string |  | CSS selector. Used when ref is not given. |
| `maxWidth` | number |  |  Default `1280`. |
| `format` | "png" \| "jpeg" |  |  Default `"jpeg"`. |

### `eval_js`

Run JavaScript in the page (main world) and return its JSON-serialisable result. Promises are awaited.

| argument | type | required | notes |
|---|---|---|---|
| `tabId` | string |  | Tab id. Omit for the active tab. |
| `code` | string | yes |  |

### `console_read`

Recent console messages from a tab.

| argument | type | required | notes |
|---|---|---|---|
| `tabId` | string |  | Tab id. Omit for the active tab. |
| `level` | "all" \| "error" \| "warning" \| "info" \| "debug" |  |  Default `"all"`. |
| `pattern` | string |  | Regex filter. |
| `limit` | number |  |  Default `100`. |
| `clear` | boolean |  |  Default `false`. |

### `network_read`

Recent network requests made by a tab (method, url, status, type). Blocked-by-rules requests are marked.

| argument | type | required | notes |
|---|---|---|---|
| `tabId` | string |  | Tab id. Omit for the active tab. |
| `pattern` | string |  | Regex filter on the URL. |
| `limit` | number |  |  Default `100`. |
| `clear` | boolean |  |  Default `false`. |

## Acting on a page

### `click`

Click an element (by ref or selector) or a viewport coordinate. Scrolls it into view first and sends real mouse events.

| argument | type | required | notes |
|---|---|---|---|
| `tabId` | string |  | Tab id. Omit for the active tab. |
| `ref` | string |  | Element ref from page_read or find, e.g. "e12". |
| `selector` | string |  | CSS selector. Used when ref is not given. |
| `x` | number |  |  |
| `y` | number |  |  |
| `button` | "left" \| "middle" \| "right" |  |  Default `"left"`. |
| `clickCount` | number |  |  Default `1`. |
| `modifiers` | "shift" \| "control" \| "alt" \| "meta"[] |  |  |

### `hover`

Move the mouse over an element or coordinate.

| argument | type | required | notes |
|---|---|---|---|
| `tabId` | string |  | Tab id. Omit for the active tab. |
| `ref` | string |  | Element ref from page_read or find, e.g. "e12". |
| `selector` | string |  | CSS selector. Used when ref is not given. |
| `x` | number |  |  |
| `y` | number |  |  |

### `type`

Type text. Focuses the target first if given. clear replaces existing content; submit presses Enter afterwards.

| argument | type | required | notes |
|---|---|---|---|
| `tabId` | string |  | Tab id. Omit for the active tab. |
| `ref` | string |  | Element ref from page_read or find, e.g. "e12". |
| `selector` | string |  | CSS selector. Used when ref is not given. |
| `text` | string | yes |  |
| `clear` | boolean |  |  Default `false`. |
| `submit` | boolean |  |  Default `false`. |
| `mode` | "insert" \| "keys" |  | insert = fast paste-like input; keys = one key event per character for sites that need it. Default `"insert"`. |

### `press_key`

Press a key, e.g. Enter, Tab, Escape, ArrowDown, a, with optional modifiers.

| argument | type | required | notes |
|---|---|---|---|
| `tabId` | string |  | Tab id. Omit for the active tab. |
| `key` | string | yes |  |
| `modifiers` | "shift" \| "control" \| "alt" \| "meta"[] |  |  |
| `repeat` | number |  |  Default `1`. |

### `scroll`

Scroll the page or an element. Use to: top|bottom, or dy/dx in pixels, or scroll a ref into view.

| argument | type | required | notes |
|---|---|---|---|
| `tabId` | string |  | Tab id. Omit for the active tab. |
| `ref` | string |  | Element ref from page_read or find, e.g. "e12". |
| `selector` | string |  | CSS selector. Used when ref is not given. |
| `to` | "top" \| "bottom" \| "element" |  |  |
| `dx` | number |  |  |
| `dy` | number |  |  |

### `select_option`

Choose an option in a <select> by value or visible label.

| argument | type | required | notes |
|---|---|---|---|
| `tabId` | string |  | Tab id. Omit for the active tab. |
| `ref` | string |  | Element ref from page_read or find, e.g. "e12". |
| `selector` | string |  | CSS selector. Used when ref is not given. |
| `value` | string |  |  |
| `label` | string |  |  |

## The browser interface

### `ui_css`

Inject or replace a CSS block in the browser chrome (toolbar, tabs, panel). Same id replaces; empty css removes. persist writes it into themes/custom.css so it survives restarts.

| argument | type | required | notes |
|---|---|---|---|
| `id` | string |  |  Default `"claude"`. |
| `css` | string | yes |  |
| `persist` | boolean |  |  Default `false`. |

### `ui_eval`

Run JavaScript inside the browser chrome UI (not the page). Full access to the chrome DOM and the window.browser bridge.

| argument | type | required | notes |
|---|---|---|---|
| `code` | string | yes |  |

### `ui_reload`

Reload the browser chrome UI from disk (after editing app/chrome/*). Tabs are untouched.

No arguments.

### `ui_panel`

Open or close the activity side panel.

| argument | type | required | notes |
|---|---|---|---|
| `open` | boolean | yes |  |

### `ui_note`

Post a note to Lloyd in the browser activity panel (and as a toast). Use it to explain what you are doing or ask him to take over.

| argument | type | required | notes |
|---|---|---|---|
| `text` | string | yes |  |
| `level` | "info" \| "success" \| "warning" |  |  Default `"info"`. |

### `theme_list`

List theme files in themes/ and the active one.

No arguments.

### `theme_set`

Switch the active chrome theme (a file in themes/, without .css).

| argument | type | required | notes |
|---|---|---|---|
| `name` | string | yes |  |

## Site rules

### `rules_list`

List site rule sets from rules/*.json with match patterns, enabled state and hit counts.

No arguments.

### `rules_get`

Return the full JSON of one rule set.

| argument | type | required | notes |
|---|---|---|---|
| `name` | string | yes |  |

### `rules_set`

Create or replace a rule set (rules/<name>.json) and apply it immediately. Schema: {enabled, match[], block[], redirect[{from,to}], css, js, mainJs, options{}}. "js" runs in an isolated world with DOM access (safe, invisible to the page, re-runs on SPA route changes). "mainJs" runs in the page's OWN world before its scripts, once per document, and is not subject to the page CSP — use it to set or replace page globals, stub a function the site calls, or patch an API before the site touches it.

| argument | type | required | notes |
|---|---|---|---|
| `name` | string | yes |  |
| `rule` | object | yes |  |

### `rules_toggle`

Enable or disable a rule set.

| argument | type | required | notes |
|---|---|---|---|
| `name` | string | yes |  |
| `enabled` | boolean | yes |  |

### `rules_reload`

Re-read rules/ from disk and re-apply to open tabs.

No arguments.

## Ad and tracker blocking

### `adblock_status`

Ad and tracker blocking: whether it is on, which lists, how old they are, how much has been blocked, and the per-site allowlist.

No arguments.

### `adblock_set`

Change ad blocking: turn it on or off, swap list sets, allowlist sites, or add custom filters in Adblock Plus syntax (e.g. "||ads.example.com^" or "example.com##.promo-banner"). Persists to config/settings.json.

| argument | type | required | notes |
|---|---|---|---|
| `enabled` | boolean |  |  |
| `lists` | "ads-only" \| "ads-and-tracking" \| "full" |  | ads-and-tracking is the default. "full" adds annoyance and cookie-notice lists. |
| `allowlist` | string[] |  | Domains where blocking is off entirely. Replaces the current list. |
| `scriptlets` | boolean |  | Filter-list scriptlets: real JavaScript injected into the page to defuse anti-adblock and paywall scripts. Powerful and the most likely thing to break a site, so it can be turned off without losing network blocking or element hiding. |
| `customFilters` | string[] |  | Adblock Plus syntax lines, applied before the downloaded lists. Replaces the current set. |

### `adblock_update`

Re-download the filter lists now instead of waiting for the scheduled refresh.

No arguments.

## Composed pages

### `page_create`

Write a composed page to pages/<name>.html and return its URL. Use it to build a page out of other pages (a tutorial beside a manual), a results grid you assembled from several sites, or any tool Lloyd asked for. Composed pages may frame sites that normally refuse to be framed.

| argument | type | required | notes |
|---|---|---|---|
| `name` | string | yes | File name without extension, e.g. "print-quote". |
| `html` | string | yes | Complete HTML document. |
| `open` | boolean |  | Open it in a tab straight away. Default `true`. |
| `profile` | string |  |  |

### `page_list`

List composed pages in pages/ with size and last modified.

No arguments.

### `page_read_source`

Return the HTML source of a composed page, so you can revise it rather than rewrite it.

| argument | type | required | notes |
|---|---|---|---|
| `name` | string | yes |  |

### `page_delete`

Delete a composed page.

| argument | type | required | notes |
|---|---|---|---|
| `name` | string | yes |  |

## Profiles

### `profiles_list`

List profiles (isolated cookie jars) with open tab counts.

No arguments.

### `profile_clear`

Wipe cookies, storage and cache for a profile. Irreversible.

| argument | type | required | notes |
|---|---|---|---|
| `name` | string | yes |  |
