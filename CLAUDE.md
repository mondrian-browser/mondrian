# Claude Browser — Project Guide

A real browser (Electron 44 / Chromium) built so that Claude can steer it deeply and
Lloyd can enjoy using it. Not an automation harness bolted onto someone else's browser:
the chrome, the network layer and the page layer are all ours to change at runtime.

---

## 0. Start of every session

1. Read `MEMORY.md` if present, then this file.
2. Call `status`. It launches the browser if it is not running and tells you the port,
   the open tabs, the loaded rule sets and the active profile.
3. If you are changing the app itself (not just driving it), run `npm test` before and
   after. It is a real end-to-end run under a headless display; 53 checks, all should pass.

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
tools/mcp/server.js     stdio MCP server. One tool per entry in shared/commands.js.
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
flash. Scriptlet injection from filter lists is **not** implemented: scriptlets need the
page's main world and the preload runs isolated. Say so rather than implying full parity.

The lists are cached in `.runtime/` and refreshed every `refreshHours` (default 72). If the
download fails the engine runs on custom filters only and `status().degraded` says why.

Custom filters take Adblock Plus syntax, are matched before the downloaded lists, and are
what the test suite uses so it stays deterministic and offline.

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

## 9. Known rough edges

- YouTube selectors are current as of Sep 2026 and will drift.
- The watch-page half of the YouTube rules was verified on a datacentre IP that Google
  served a captcha to, so the sidebar, comments and autoplay behaviour there is
  **unverified on a real signed-in session**. Check it on Lloyd's machine before claiming
  it works.
- No find-in-page bar yet (Ctrl+F). No downloads UI; downloads work, they just go
  straight to the default folder.
- Filter-list scriptlets are not injected, so a handful of anti-adblock workarounds that
  rely on them will not fire.
- Real-site blocking was measured by request volume (roughly halved on news sites). The
  ad-element probes found nothing to count in either state on a datacentre IP, so element
  hiding on live ad slots is unproven; `tests/adblock-check.js` re-measures it anywhere.
- `window.open` always becomes a tab, never a popup window.
