# 0005. One request listener, ad blocking as a library

Date: 2026-09-19
Status: accepted

## Context

Electron allows exactly one `webRequest` listener per event per session. Registering a
second silently replaces the first, with no error anywhere.

`@ghostery/adblocker-electron` installs its own `onBeforeRequest`. Using it would have
silently disabled Mondrian's entire site-rules engine.

## Decision

Use the plain `@ghostery/adblocker` engine as a library and call `match()` from inside the
single listener owned by `rules.js`. Order of precedence: site rules first, then filter
lists.

## Consequences

Hand-written site rules outrank the filter lists, which is the behaviour a user expects
when they write a rule.

There is one place where request decisions happen, so the order is readable.

Do not switch to the `-electron` package. The failure mode is silent and would be hard to
attribute.

Ghostery's engine is MPL-2.0, which is file-level copyleft. Wrapping it rather than
forking keeps the licence obligation to Ghostery's own files.
