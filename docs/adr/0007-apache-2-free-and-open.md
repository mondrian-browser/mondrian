# 0007. Apache-2.0, free and open source

Date: 2026-09-20
Status: accepted

## Context

Free and closed was considered and is legal. The dependency licences permit it: 91 MIT,
10 MPL-2.0, 9 ISC, 4 BSD, 1 Apache-2.0, with Ghostery's MPL engine wrapped rather than
forked.

Three arguments against it for this project specifically:

A browser sees everything its user types and reads. The concept's central promise is that
nothing is silently deleted, which is a claim people want to verify rather than believe.
Closed source makes it unfalsifiable.

Free and closed buys neither contributors nor revenue, while carrying code signing,
support and the Chromium update treadmill alone.

Shipping Electron closed carries an LGPL relinking obligation from bundled FFmpeg.

Apache-2.0 over MIT because it grants patents explicitly and has a trademark clause. For
software that touches codecs and network filtering, an explicit patent grant is worth the
extra length.

## Decision

Apache-2.0. Free and open source. No paid tier in v1. The trademark is retained; if there
is ever a commercial product it will be a hosted service rather than the binary.

## Consequences

The design filter's claims are auditable, which is the point.

Contributions are possible, and the licence protects contributors and users from patent
claims.

Relicensing away from open source later is effectively impossible once there are outside
contributors. This decision is close to permanent and was made deliberately.

`NOTICE` and third-party attribution have to be maintained as dependencies change.
