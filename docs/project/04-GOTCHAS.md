# Gotchas

Everything here was found by something breaking, not by reading documentation. Each one
was an invisible failure: the feature looked fine while half of it had never run. Read
this before touching the preload, the rules engine or input handling.

The pattern in all of them: **a guess about what Chromium or Electron does, which was
wrong.** When a question like this comes up, write a throwaway Electron harness and
measure it. It takes ten minutes and it has been right every time.

---

## 1. A preload's world inherits the page's CSP for code generation

`new Function` and `eval` both throw `Code generation from strings disallowed for this
context` in a preload on any site whose `script-src` lacks `unsafe-eval` — which is most
large sites, including YouTube.

This killed the entire `js` half of the rules engine on those sites. The `css` half kept
working, so Clean YouTube looked like it had a selector problem rather than dead code.

Measured against a page serving `script-src 'self'`:

| approach | result |
|---|---|
| `new Function` | refused |
| indirect `eval` | refused |
| injected `<script>` element | impossible at document-start (`documentElement` is null), refused later by CSP |
| `webFrame.executeJavaScriptInIsolatedWorld` | runs, full DOM access, own persistent globals, invisible to the page |
| `webFrame.executeJavaScript` | runs in the page's own world, before its scripts, not subject to CSP |

Rule `js` uses the isolated-world call. Rule `mainJs` and scriptlets use the main-world
one. Do not move either back to `new Function`.

## 2. Filter-list scriptlets must be injected as one bundle

Injecting a set's scriptlets as separate `executeJavaScript` calls broke YouTube
completely: it served its pre-hydration skeleton and stopped, no player, `body.innerText`
of 0, and stack overflows in the page while it settled.

Separate calls are not guaranteed to all land before the page's first script, so the
later ones arrive mid-hydration. One throwing also took the rest of the set with it.
Filter-list scriptlets are written to be concatenated — they share one `scriptletGlobals`
and expect to see each other.

They now go in as one IIFE with each part in its own `try`, which also keeps their
declarations out of the page's globals and lets failures be counted rather than guessed
at. `tabs_list` reports `scriptletFailures`.

Scriptlets are the single most likely thing to break a site. `adblock_set({scriptlets:
false})` turns them off without losing network blocking or element hiding. Try that first
when a site misbehaves.

## 3. `innerText` cannot see shadow DOM

It stops at every shadow boundary, so a site built from web components reads as an empty
page. archive.org holds 83,000 characters nested seven shadow roots deep under
`<app-root>`; `document.body.innerText` returns 0.

`page_read` and `find` already walked shadow roots, which is how this surfaced: the site
suite found 120 real links on a page reporting no text at all. When two of your own tools
disagree about a page, one of them is wrong — chase it.

`page_text` now falls back to a shadow-aware read and reports `viaShadow: true` when it
did. The first attempt at that walk descended element by element and stopped at the first
one with any text, which missed everything below it: 364 characters out of 83,000.
Collecting every open shadow root instead works, because `innerText` covers everything
between boundaries, so the union of the roots is the page.

## 4. Implicit form submission runs off the char event

`press_key Enter` delivered a keydown the page could see, with `isTrusted: true`, and
submitted nothing. Chromium drives implicit form submission from the **char** event, and
`sendKey` only produced one for single-character keys.

The char event also carries the **character**, not the key name: Enter needs `\r`, Tab
needs `\t`. Sending `keyCode: 'Enter'` as a char does nothing useful.

Wikipedia's search box accepted the keystroke and sat there. `type({submit: true})` was
dead the same way, and Tab did not move focus.

Related, and worth knowing before you write a test: HTML only does implicit submission
when a form has a submit button **or** exactly one field that blocks it. A fixture form
with two bare inputs and no button is correctly ignored by Enter — that is the spec, not
a bug. One of my own tests was wrong this way.

## 5. Real sites replace nodes under you

Wikipedia swaps its search input for a different element the moment it gains focus. A ref
taken from `find()` was already dead by the time `type()` ran.

Refs carry a descriptor — id, name, aria-label, placeholder, href, role, text — and a
stale one is looked up again before failing. The act path reports `relocated: true` when
that happened. Do not reduce refs to a bare element reference.

Refs are still cleared on a real navigation, and the error message says to read again.

## 6. Electron reports every page-side throw identically

`Script failed to execute, this normally means an error was thrown. Check the renderer
console for the error.` There is no renderer console to check from a headless control
socket, and a **syntax** error reads exactly the same as a runtime one.

Two consequences. `eval_js` catches inside the page and carries the real message and
stack back out. And the expression-versus-statements fallback cannot key off the message
text — it retries on any failure, because a runtime throw now comes back as a value
rather than a rejection, so a rejection means the code would not parse as an expression.

Statement-form code returns nothing. `document.cookie = "x"; document.cookie` gives you
`null`, not the cookie. Wrap it: `(() => { ...; return x; })()`. Another of my own tests
was wrong this way.

## 7. `file://` URLs on Windows need three slashes

`'file://' + 'C:\\Users\\...'` gives `file://C:/Users/...`; Chromium uses
`file:///C:/Users/...`. The composed-page prefix check compared against the two-slash
form, so it could never match and frame-header stripping was silently off on Windows
while passing on Linux, where the path already starts with `/`.

Use `url.pathToFileURL` for anything that turns a path into a URL. This was found by
running the suite on Windows, which is why the suites should be run on both.

## 8. Electron needs `--no-sandbox` as an argv flag on Linux, root or not

`app.commandLine.appendSwitch('no-sandbox')` inside `main.js` runs too late; the fatal
check happens first. So `main.js`'s own Linux no-sandbox line never takes effect, and
the flag has to come from the command line.

The first half of this was found in the container, running as root, and the harnesses
were given the flag **only when `getuid() === 0`**. That was the wrong condition and it
left CI red on `main` for nine consecutive runs, unnoticed because the Linux job was the
only one failing and the suite passed everywhere it was run by hand:

```
FATAL:setuid_sandbox_host.cc(166)] The SUID sandbox helper binary was found, but is
not configured correctly. ... chrome-sandbox is owned by root and has mode 4755.
```

A normal user cannot set the setuid bit on `node_modules/electron/dist/chrome-sandbox`,
so an npm-installed Electron never has it, and GitHub's runners restrict unprivileged
user namespaces, so there is no namespace sandbox to fall back on. Root is not the
special case — **not having a correctly configured sandbox helper is the normal case for
Electron out of node_modules**, and that is true of every non-root Linux box, not just
CI. All three harnesses now pass `--no-sandbox` on Linux unconditionally.

`--disable-gpu` was keyed on the same wrong condition and is the same bug one layer
down: without it the runner has no working viz compositor, so `capturePage` fails with
`UnknownVizError` and clicks miss their target. Both flags are about **headless Linux**,
not about root, and all three harnesses now pass both on Linux unconditionally.

Two lessons, both about the shape of the mistake rather than the flag:

- The symptom was `browser never wrote control.json`, which says nothing about sandboxes.
  Whenever you see it, the app log printed under it is the actual error; read that first.
- A guard written from one machine's symptom (`asRoot`) encoded *where the bug was found*
  rather than *what the bug was*. It then held on every machine anyone tested by hand and
  failed only on the one nobody watched.

## 9. `device_commit_files` has reported success without writing

A write of `preload-page.js` to Lloyd's machine returned `{"written": [...]}` and the old
file was still there. Nothing else in that batch was affected, and a second attempt
worked.

When shipping to his machine, stage the files back and compare checksums. It costs one
call and the alternative is debugging a fix that was never applied — which happened, and
cost a confusing twenty minutes.

## 10. The MCP tool list is cached at desktop-app start

The server reads `shared/commands.js` once when the Claude desktop app launches it. A new
command will not appear as a tool until the desktop app is fully restarted, and the old
zod schema keeps rejecting arguments the new code would accept.

Workaround that avoids the restart: send the command through the browser's own UI bridge,
which goes straight to `dispatch` and skips the MCP schema entirely.

```
ui_eval({ code: "window.browser.cmd('window', { action: 'close' })" })
```

## 11. `claude-browser` is a reserved MCP server name

The desktop app reserves it for its own built-in browser pane and refuses to start a
server whose name normalises onto it, with `Its name collides with a reserved internal
server name`. The failure is silent from the Claude side: the server appears in the
config and simply never starts, so the tools never show up.

This project registers as `mondrian`. It was briefly `cbrowser`; `install-mcp` deletes
both older registrations when it runs.

---

## 12. A start page that will not load used to stop the browser booting

`webContents.loadURL` rejects on any main-frame navigation failure. `boot()` awaited the
start-page `tab_open` without catching, so the rejection reached the boot `catch` and
called `app.exit(1)`. The result was the worst possible failure for a browser: offline,
behind a captive portal, behind a proxy that refuses CONNECT, or with a typo in
`homeUrl`, Mondrian would not start **at all** — no window, no control socket, and no
omnibox to type a working URL into. The one thing a browser must do when the network is
bad is open.

Found 20 Sep 2026 when the fixture suite would not run in a cloud container whose proxy
refuses `CONNECT duckduckgo.com`. It had never shown up before because every machine the
suite had run on could reach the configured `homeUrl`.

Two things were wrong and both are fixed:

- The start-page load is wrapped. The tab is already created when `loadURL` rejects, so
  Chromium paints its own error page in it and `did-fail-load` records `tab.lastError`;
  the failure is visible rather than swallowed. `control.json` is still written last, so
  it keeps meaning "ready for commands".
- The fixture suite launched with no `--url=`, so it booted to `settings.homeUrl` and put
  duckduckgo.com on the critical path of all 86 checks of a suite documented as hermetic.
  It now boots to its own fixture server.

The lesson is the general one: **anything a suite calls hermetic should be run once with
the network taken away.** A network dependency in a boot path is invisible until you are
on the machine that cannot reach it, and that machine is usually CI.

---

## Things that are true and easy to forget

- Tests must kill their process tree. `spawn` without `detached: true` means
  `process.kill(-pid)` does nothing, and every run under `xvfb-run` orphans an Electron
  holding a control port. Twenty runs exhausted the port range and launches began failing
  outright. The app takes a single-instance lock now, so this cannot happen in normal use.
- `control.json` is written **last** during boot. Its existence means the browser is ready
  for commands. Starting the control server earlier let a client interleave with startup.
- YouTube evals can throw `Maximum call stack size exceeded` for a few seconds while the
  page settles, then work fine. Wait and retry before concluding anything.
- Ad-element probes find nothing on a datacentre IP, so element-hiding claims cannot be
  verified from the container. Request-count A/B works there; element counts need a real
  machine.
- `resources.scriptlets` is an Array, so read `.length`. Reading `.size` returned 0 and
  made it look like no scriptlet library had loaded.
