# 0006. Deterministic core, Claude optional

Date: 2026-09-20
Status: accepted

## Context

The design filter has a budget of under 400ms to first block. A model round trip does not
fit in that budget, and requiring one would mean every user needs an API key or a
subscription before the browser renders anything.

Mondrian is also meant to be distributable free software. A hard dependency on a paid
service would make that incoherent.

## Decision

The filter, the layout and the block cache are deterministic and work with no model
present. Claude is optional and plugs in two ways: through the MCP server for people who
have the Claude desktop app, and through an API key pasted into settings for those who do
not. Neither is required.

Claude's place is where a gesture has already happened and a second of thinking is
acceptable: composition on drop, relayout in words, and improving the deterministic
classifier offline by writing per-site rules that then ship or cache.

## Consequences

Mondrian works offline and on a machine that has never heard of Claude.

The classifier has to be good on its own, which is why proving it is the first milestone.

Claude improves the product without being in the render path, so a slow or absent model
degrades features rather than breaking pages.

Two integration paths means two code paths to maintain and two sets of failure modes to
present clearly in the interface.
