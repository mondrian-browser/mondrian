# Claude Browser — Project Guide

A real browser (Electron 44 / Chromium) built so that Claude can steer it deeply and
Lloyd can enjoy using it. Not an automation harness bolted onto someone else's browser:
the chrome, the network layer and the page layer are all ours to change at runtime.

**Where this is going.** `docs/project/01-CONCEPT.md`, with the visual reference in
`docs/concept/concept-layout.pdf`, describes the browser this becomes: no page rendered
as sent, every document pulled apart into blocks and laid back out in one layout
language, and tabs as the unit you compose with. Read it before proposing anything
substantial, because it changes what much of the code below is for — under the concept
you do not hide a sidebar with CSS, you never emit a block for it. `docs/project/05-STATUS.md`
holds the honest gap between the two.

---

## 0. Start of every session

1. Read `MEMORY.md` if present, then this file.
2. Call `status`. It launches the browser if it is not running and tells you the port,
   the open tabs, the loaded rule sets and the active profile.
3. If you are changing the app itself (not just driving it), run `npm test` before and
   after. It is a real end-to-end run under a headless display; 86 checks, all should pass.
   `npm run test:sites` (20 live sites) and `npm run test:agent` (multi-step flows on
   live sites) are slower, need the network, and are what actually finds things — every
   bug worth fixing so far came from one of those two rather than from the fixtures.

## 1. The two ways to work

**Driving** — reading and acting on pages through the MCP tools. Nothing to install,
nothing to restart. This is most sessions.

**Building** — changing the browser. Edit files under `app/`, then:
- `app/chrome/*` (the UI): `ui_reload` picks it up, no restart.
- `app/main/*` (main process): needs a restart. Close the window and call `status`.
- `rules/*.json`: picked up automatically, watched on disk.
- `themes/*.css`: `theme_set` re-reads from disk.

## 2. Architecture, in one pass

```
tools/mcp/server.js     stdio MCP server, registered as "cbrowser". One tool per entry
      │                 in shared/commands.js. NOT "claude-browser": that name is reserved
      │                 by the desktop app for its built-in browser pane and is refused.
      │                 Launches the app if it is not running; reconnects if it dies.
      │  ws://127.0.0.1:6510  (token in .runtime/control.json, localhost only)
      ▼
app/main/control.js     WebSocket control server inside the app.
app/main/handlers.js    Every command implemented, once. The UI and Claude both call these.
app/main/main.js        Boot, window, layout, shortcuts, context menus, IPC wiring.
app/main/tabs.js        BaseWindow + one WebContentsView per tab, stacked over the chrome.
app/main/profiles.js    One Electron session partition per profile = separate cookie jars.
app/main/rules.js       Site rules: match → block / redirect / css / js. Owns the single
                        onBeforeRequest listener and consults adblock.js after its own rules.
app/main/adblock.js     EasyList/EasyPrivacy via the Ghostery engine. Deliberately does NOT
                        install session hooks of its own; see section 4a.
app/main/preload-page.js  Runs in every page at document-start. Applies rules before
                          first paint; is the agent that reads structure and resolves refs.
app/chrome/*            The browser's own UI. Plain HTML/CSS/JS, no framework.
```

`shared/commands.js` is the single source of truth. Add a command there and implement it
in `handlers.js`, and it appears as an MCP tool automatically — no separate registration.

## 3. Driving a page

- `page_text` for prose. `page_read` for a list of elements, each with a `ref`.
  `find` when you know the visible text.
- Act with `click` / `type` / `press_key` / `scroll` / `select_option`, passing a `ref`.
- **Refs die on navigation.** After anything that loads a page, read again. The error
  message says so too.
- `screenshot` when the layout is the question. Otherwise prefer text — it is cheaper
  and more precise.
- `eval_js` for anything the structured tools do not cover.

## 4. Site rules

A rule set is one JSON file in `rules/`:

```json
{
  "title": "Clean YouTube",
  "enabled": true,
  "match":    ["*://*.youtube.com/*"],
  "block":    ["*://*.youtube.com/youtubei/v1/reel/*"],
  "redirect": [{ "from": "*://*.youtube.com/shorts/*", "to": "https://www.youtube.com/watch?v=$3" }],
  "css":      "ytd-reel-shelf-renderer { display: none !important }",
  "js":       "if (location.pathname.startsWith('/shorts/')) { /* ... */ }",
  "options":  { "killAutoplay": true }
}
```

- `match` selects **pages**, not requests. `block` patterns are then tested against the
  requests those pages make. "On YouTube, block X" means what it says.
- `$1`, `$2`… in a redirect are the `*` wildcards of `from`, in order.
- `css` and `js` are applied by the preload at document-start, before the page's own
  scripts run, and again on SPA route changes. No flash of the thing you removed.
- `js` receives `(options, reason)` and may `return` early.
- Write rules with `rules_set`, not by hand — it saves and applies in one step.

**Selectors rot.** YouTube reshuffles its DOM every few months. When a rule stops working,
A/B it: `rules_toggle` off, count what is visible, toggle on, count again. `tests/youtube-ab.js`
does exactly this and is the pattern to copy for any site.

## 4a. Ad and tracker blocking

On by default. `adblock_status` / `adblock_set` / `adblock_update`.

Electron allows exactly **one** webRequest listener per event per session, and a second
`onBeforeRequest` silently replaces the first. `@ghostery/adblocker-electron` installs its
own, which would clobber the rules engine without any error. So this project uses the plain
`@ghostery/adblocker` engine and calls `match()` from inside the rules listener. Order of
precedence: your site rules first, then the filter lists. Do not switch to the -electron
package without understanding what it would overwrite.

Element hiding rides the same document-start channel as rule CSS, so hidden elements never
flash. Scriptlets are injected too (see section 4b), which is what defuses anti-adblock
scripts. Verified on real sites: 5 injected on bild.de, 6 on tomshardware.com.

The lists are cached in `.runtime/` and refreshed every `refreshHours` (default 72). If the
download fails the engine runs on custom filters only and `status().degraded` says why.

Custom filters take Adblock Plus syntax, are matched before the downloaded lists, and are
what the test suite uses so it stays deterministic and offline.

## 4b. Main-world injection

Two kinds of injected JavaScript, and the difference matters:

- **`js`** on a rule runs in the preload's **isolated world**. It shares the DOM but not
  the page's globals, the page cannot see or tamper with it, and it re-runs on SPA route
  changes. This is the default and the safer of the two.
- **`mainJs`** on a rule, and every filter-list scriptlet, runs in the **page's own world**,
  before the page's own scripts, once per document. It can set page globals, stub a
  function the site is about to call, or patch an API before the site touches it.

The mechanism is `webFrame.executeJavaScript` from the preload. Three properties were
measured on Electron 44, not assumed, and the test suite asserts all three:

1. It lands in the main world, not the isolated one.
2. It runs **before** the page's own inline scripts.
3. It is **not** subject to the page's CSP, so `script-src 'self'` does not stop it.

Do not switch this to an injected `<script>` element. At document-start
`document.documentElement` is still null so the element cannot be created, and even
later a strict `script-src` would refuse it. Both failure modes were observed.

`mainJs` runs once per document and deliberately does not re-run on SPA route changes —
a scriptlet that defuses something on load would double-apply. Use `js` for anything that
needs to run again after a route change.

## 5. Profiles

Separate cookie jars, one Electron partition each.
- `lloyd` — his browsing. **Do not sign into things here or clear it without asking.**
- `claude` — accounts that exist for Claude's use.
- Any other name works and is created on first use. `profile_clear` is irreversible.

`tab_open({ profile: "claude" })`. Verified isolated by the test suite.

## 6. Composed pages

`page_create({ name, html })` writes `pages/<name>.html` and opens it. This is how you
build something out of several sites at once — a tutorial beside a manual, a results grid
assembled from four shops, a project hub.

Composed pages are the **one** place where `X-Frame-Options` and `frame-ancestors` are
stripped, so they can embed sites that normally refuse to be embedded. The stripping is
scoped to subframes of `pages/*.html` and nowhere else; the test suite asserts both halves
(a composed page may frame a DENY site, a normal page still may not). Do not widen that
scope — it is the difference between a useful tool and a clickjacking machine.

## 7. The browser's own UI

- `ui_css` injects or replaces a CSS block by id. `persist: true` writes it to
  `themes/custom.css` so it survives a restart.
- `ui_eval` runs JS inside the chrome document. Full DOM access.
- `ui_note` posts to the activity panel and toasts. **Use it.** Lloyd is often watching
  the window rather than the chat; tell him what you are doing there.
- `theme_set` swaps `themes/<name>.css`. Themes are just token overrides on `:root`.

## 8. Code rules

- CommonJS, Node built-ins, no build step, no framework. Keep it that way — the point of
  this project is that any part of it can be read and changed in one sitting.
- Every command: define it in `shared/commands.js` with a real description and a zod
  schema, implement it in `handlers.js`. The description is what a future Claude reads
  to decide whether to call it, so write it for that reader.
- Errors are instructions. `No tab "t7".` is bad; `No tab "t7". Open one with tab_open.`
  is the standard.
- Anything that touches the network layer, the profiles or the framing scope gets a test
  in `tests/e2e.js` **with its negative case**. A test that only proves the feature works
  is half a test.

## 8a. What breaks, and where to look first

Hard-won, in the order they cost the most time. `docs/OVERNIGHT.md` has the full account.

- **A preload's world inherits the page's CSP for code generation.** `new Function` and
  `eval` both throw on any site whose `script-src` lacks `unsafe-eval`, which is most
  large sites. Rule `js` runs in isolated world 1234 for this reason. Never move it back.
- **Filter-list scriptlets must be injected as one bundle.** Separate calls are not
  guaranteed to land before the page's first script; the later ones arrive mid-hydration
  and broke YouTube completely.
- **`innerText` stops at shadow boundaries.** Anything reading page text needs the
  shadow-aware path, or web-component sites look empty.
- **Chromium's implicit form submission runs off the char event**, and that event carries
  the character, not the key name. Enter without a carriage-return char event submits
  nothing while still looking like a real keypress to the page.
- **Real sites replace nodes.** Refs carry a descriptor so a stale one can be found
  again; do not reduce that to a bare element reference.
- **`device_commit_files` has reported success without writing.** When shipping to
  Lloyd's machine, stage the file back and compare checksums.

## 8b. Building toward the concept

Three rules from the design that are easy to violate by accident:

- **The filter sits in front of paint.** Render-then-reflow shows the site's design and
  then takes it apart in view, which is the single thing the concept rules out. Anything
  that runs after first paint is the wrong place for it.
- **Emit, do not hide.** Dropping content means never making a block for it. `display:none`
  is the old mechanism and leaves the site's layout underneath.
- **Nothing is silently deleted.** Whatever the filter drops is counted and listed, one
  click from being shown. A filter that quietly eats content is not trustworthy and Lloyd
  will not be able to tell a bug from a decision.

And for composition: sources are never thrown away, every block keeps the mark of the page
it came from, and blocks that contradict each other are kept side by side rather than
averaged into one claim.

## 9. Known rough edges

- YouTube selectors are current as of Sep 2026 and will drift.
- The watch-page half of the YouTube rules was verified on a datacentre IP that Google
  served a captcha to, so the sidebar, comments and autoplay behaviour there is
  **unverified on a real signed-in session**. Check it on Lloyd's machine before claiming
  it works.
- No find-in-page bar yet (Ctrl+F). No downloads UI; downloads work, they just go
  straight to the default folder.
- Real-site blocking was measured by request volume (roughly halved on news sites). The
  ad-element probes found nothing to count in either state on a datacentre IP, so element
  hiding on live ad slots is unproven; `tests/adblock-check.js` re-measures it anywhere.
- `window.open` always becomes a tab, never a popup window.
