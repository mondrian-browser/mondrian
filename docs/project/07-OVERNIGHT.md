# Overnight run, 19–20 September 2026

You asked me to test everything and fix what I could without stopping. Six real bugs,
all fixed and verified. Two test suites added. Here is what happened, what is now
proven, and what is still open.

## Do this first

```
cd C:\Users\Lloyd\Documents\Claude\Projects\ClaudeBrowser
npm.cmd test
```

Expect **93 passed, 0 failed**. Everything in the repo is already on your machine and
checksum-verified, but the suites were run on Linux in the cloud container. Windows has
already caught one platform-specific bug tonight, so your run is the one that counts.

Optional, slower, needs the network:

```
npm.cmd run test:sites     # 20 live sites
npm.cmd run test:agent     # multi-step flows on live sites
```

## What is now verified on your machine

YouTube, real watch page, live:

| | |
|---|---|
| page hydrated | yes |
| player | loads, readyState 4, duration correct |
| autoplay | **off** |
| sidebar recommendations | 0 |
| comments | 0 |
| Shorts links | 0 |
| Shorts nav entry | 0 |
| end screens, merch | 0 |
| scriptlets | 30 injected, 0 failed |

A Shorts URL redirects to the normal player. Wikipedia search submits. archive.org
reads 3,288 characters where it used to read none.

## The six bugs

**1. Rule `js` was dead on every strict-CSP site.** Your console said it plainly once
I looked: `Code generation from strings disallowed for this context`. A preload's world
inherits the page's CSP for code generation, and YouTube's `script-src` has no
`unsafe-eval`, so `new Function` threw and rule `js` never ran. The CSS half kept
working, which is why Clean YouTube looked fine while half of it had never executed.
Rule `js` now runs in a dedicated isolated world, which is not subject to page CSP, has
full DOM access, and stays invisible to the page. I measured all three rather than
assuming them.

**2. Scriptlets broke YouTube outright.** Once rule `js` could run, YouTube stopped
hydrating: skeleton only, no player, and stack overflows in the page. The 30 scriptlets
EasyList carries for youtube.com were going in as 30 separate injections, and those are
not guaranteed to all land before the page's first script, so the later ones arrived
mid-hydration. Filter-list scriptlets are written to be concatenated. One bundle now,
each part in its own `try`.

**3. Enter never submitted anything.** `press_key Enter` delivered a keydown the page
could see and nothing happened. Chromium runs implicit form submission off the *char*
event, which was only being sent for single-character keys — and the char event carries
the character, not the key name, so Enter needs a carriage return. Wikipedia's search
box took the keystroke and sat there. `type({submit: true})` was dead the same way. Tab
now moves focus too.

**4. Refs died when a site replaced a node.** Wikipedia swaps its search input for a
different element on focus, so a ref from `find()` was already stale by the time
`type()` ran. Refs now carry a descriptor and a stale one is looked up again before
failing.

**5. `page_text` read the wrong element.** It took the first `main`/`article` it found.
Reddit puts a 32-character `<article>` near the top of a page carrying 6,500, so
`page_text` returned "September Contest: Metamorphosis" and nothing else. It now scores
every landmark and falls back to `<body>`. Reddit: 32 → 5,428 characters.

**6. `page_text` was blind to shadow DOM.** `innerText` stops at every shadow boundary,
so any site built from web components returned an empty page. archive.org holds 83,000
characters nested seven shadow roots deep. `page_read` already walked them, which is how
the suite caught it: 120 elements found on a page reporting no text. There is now a
shadow-aware fallback, and the result says `viaShadow` when it was used.

Two smaller ones on the way: `eval_js` could not report page errors at all (Electron
answers every throw with "Script failed to execute, check the renderer console", and
there is no renderer console here), and the browser had no way to restart itself, so
every main-process change needed you to close the window by hand. Both fixed. The
chrome's own close button was broken for the same reason and now works.

## What I added

`tests/site-suite.js` — twenty live sites of different shapes, running the command set
against each. It tells environment apart from breakage: this container is a datacentre
IP, so GitHub, npm and Amazon answer with bot walls, and those are reported as skipped.
A suite that cries wolf gets ignored.

`tests/agent-suite.js` — multi-step work on live sites: search and submit, click through
and go back, compose a page from two real sites, profile isolation, write a rule against
a live site, many tabs at once. 24 checks.

Both found things the fixture tests could not, because each of those bugs needs a page
that behaves like a real one.

## Still open

**The suites have not run on Windows since these changes.** That is the main gap, and
it is why `npm.cmd test` is the first thing above.

**Scriptlets are the risky part.** They run real JavaScript in the page and they are
what broke YouTube. They are on, and separable now: `adblock_set({scriptlets: false})`
turns them off without losing network blocking or element hiding. If a site misbehaves,
try that first.

**archive.org still renders nothing in the container** even with blocking fully off, so
that is the environment, not the browser. It reads fine on your machine.

**YouTube selectors will drift.** When Clean YouTube stops working, A/B it rather than
guessing: `node tests/youtube-ab.js` counts what is visible with the rule off and on.

**The MCP tool list is cached at desktop-app start.** `app_restart` and the `window`
close action exist in the code but will not appear as tools until you restart the Claude
desktop app. Until then they are reachable through the browser's own UI bridge.

**Not attempted:** signing into anything, anything that spends money, and the layouts
and Claude-panel work from the roadmap. Nothing in your `lloyd` profile was touched
beyond ordinary browsing; the testing used separate profiles.

One thing I changed on your behalf: you had clicked the shield on YouTube, which put
`www.youtube.com` in the ad-block allowlist and turned blocking off there entirely. I
cleared it, since I had said I would unless you objected. One click on the shield puts
it back.
