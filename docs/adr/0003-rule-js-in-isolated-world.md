# 0003. Rule JavaScript runs in a dedicated isolated world

Date: 2026-09-19
Status: accepted

## Context

A site rule's `js` was executed with `new Function` inside the preload. On any site whose
`script-src` lacks `unsafe-eval`, which is most large sites including YouTube, this throws
`Code generation from strings disallowed for this context`. A preload's own world inherits
the page's content security policy for code generation.

The failure was invisible. The rule's `css` still applied, so a rule looked like it had a
selector problem rather than never having run. Clean YouTube appeared to work while half
of it had never executed once.

Measured against a page serving `script-src 'self'`:

| approach | result |
|---|---|
| `new Function` | refused |
| indirect `eval` | refused |
| injected `<script>` element | impossible at document-start, `documentElement` is null; refused later by CSP |
| `webFrame.executeJavaScriptInIsolatedWorld` | runs, full DOM access, own persistent globals, invisible to the page |

## Decision

Rule `js` runs via `executeJavaScriptInIsolatedWorld` in world 1234. `options` and
`reason` are passed in, so existing rules are unchanged.

## Consequences

Rules work on every site rather than only permissive ones.

Rule code is isolated from the page, which is the safer default and means a rule cannot be
tampered with by the site.

Anything needing to touch the page's own globals must use `mainJs` instead, which runs in
the page's world. The distinction is documented in `CLAUDE.md` section 4b.

The test suite serves a page with `script-src 'self'` and asserts rule `js` runs there,
so this cannot regress silently.
