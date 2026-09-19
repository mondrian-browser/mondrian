# Status

As of 20 September 2026. Update this when the picture changes; a stale status file is
worse than none.

## Versions

Electron 44.4.3 (Chromium 152), Node 22, `@ghostery/adblocker` 2.18, MCP SDK 1.30,
zod 3.25. CommonJS, no build step. 12 commits, 44 commands.

## Test suites

| suite | what it is | count | last result |
|---|---|---|---|
| `npm test` | fixtures, hermetic, fast | 86 | all passing (Linux) |
| `npm run test:sites` | 20 live sites, whole command set on each | 20 sites | 17/17 reachable clean, 3 skipped as bot walls |
| `npm run test:agent` | multi-step flows on live sites | 24 | all passing |

Every bug worth fixing so far came from the latter two. The fixtures pass because they
were built to; they are regression protection, not discovery.

The site suite distinguishes environment from breakage. The container is a datacentre IP
behind an egress proxy, so GitHub, npm and Amazon answer with bot walls and are reported
as skipped rather than failed. A suite that cries wolf gets ignored.

## Verified working, on Lloyd's machine, live

YouTube watch page: page hydrates, player reaches readyState 4, autoplay off, sidebar
recommendations 0, comments 0, Shorts links 0, Shorts nav entry 0, end screens 0, merch 0,
30 scriptlets injected with 0 failures. A Shorts URL redirects to the normal player.

Wikipedia: search box found by label, typed into, submitted with Enter, lands on the
article.

archive.org: 3,288 characters read through shadow DOM where it previously read none.

Ad blocking, measured in the container by request volume with blocking off then on:
smh.com.au 240 to 105, theage.com.au 233 to 106, speedtest.net 122 to 36. Mostly cascade —
killing one tag manager prevents dozens of downstream calls.

Scriptlets on real sites: 5 injected on bild.de, 6 on tomshardware.com.

## Not verified

**The suites have not been run on Windows since the overnight changes.** This is the main
gap. Windows has already caught one platform-specific bug (`file://` paths), so it matters.
`npm.cmd test` is the first thing to run.

**Element hiding on live ad slots.** Ad-element probes find nothing to count on a
datacentre IP, in either state, so the element-hiding half of ad blocking is unproven
from the container. `tests/adblock-check.js` re-measures it anywhere.

**Signed-in behaviour.** Everything tested so far is signed out. The browser has its own
cookie jars, so signing into YouTube in it is a separate act from being signed in on
Chrome. Nothing about a signed-in session has been checked.

## Known rough edges

- Filter-list selectors rot. When Clean YouTube stops working, A/B it with
  `node tests/youtube-ab.js` rather than guessing at selectors.
- No find-in-page bar (Ctrl+F). No downloads UI, though downloads work.
- `window.open` always becomes a tab, never a popup window.
- archive.org renders nothing in the container even with blocking fully off. Environment,
  not the browser; it reads fine on Lloyd's machine.
- Scriptlets are on by default and are the most likely thing to break a site.

## Deliberately not built

Credential storage for Lloyd's real accounts, and anything touching card numbers. The
reasoning is in `docs/ROADMAP.md` and it is a design position, not a missing feature:
Claude may act with his sessions, never with his secrets. A browser that cannot spend
money cannot be talked into spending money, and prompt injection is unsolved.

Also not built: pages that obey instructions found in their own content. Page text is
data, not instruction. A browser that follows page content is one any site can steer.
