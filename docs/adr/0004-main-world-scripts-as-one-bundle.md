# 0004. Main-world scripts are injected as one bundle

Date: 2026-09-20
Status: accepted

## Context

Filter-list scriptlets were injected one `webFrame.executeJavaScript` call per scriptlet.
On YouTube, which matches 30 of them, the page stopped hydrating: pre-render skeleton
only, no player, `body.innerText` of zero, and stack overflows in the page while it
settled. With scriptlets disabled the same page loaded normally.

Separate calls are not guaranteed to all land before the page's first script, so the later
ones arrived mid-hydration. One scriptlet throwing also took the rest of the set with it.

Filter-list scriptlets are written to be concatenated. They share one `scriptletGlobals`
and expect to see each other.

## Decision

All of a set's main-world scripts are concatenated into a single IIFE, each part wrapped
in its own `try`, injected in one call.

## Consequences

YouTube hydrates, the player loads, and 30 scriptlets report zero failures.

Scriptlet declarations stay out of the page's globals, because the IIFE scopes them.

Failures are counted rather than guessed at, and surface as `scriptletFailures` on the
tab.

Scriptlets remain the most likely component to break a site, so they are separable:
`adblock_set({scriptlets: false})` disables them without losing network blocking or
element hiding.
