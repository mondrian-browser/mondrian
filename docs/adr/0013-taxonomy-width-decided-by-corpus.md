# 0013. The block taxonomy is wide, and the corpus decides its width

Date: 2026-09-20
Status: accepted

## Context

The concept (`docs/project/01-CONCEPT.md`) fixes ten block types and says the milestone 1
gate is whether ten types "carve real pages at the joints". The ten were a design guess
made before anything had been measured.

The first Jev trial (`tools/label/trial.js`, 20 September 2026, six live pages of six
kinds, 137 regions) measured it. With the ten types plus chrome, promotion and unclear,
12% of regions came back below 0.5 confidence, and reading the flagged rows showed a
pattern: the model was not confused between the options it had, it was missing options it
needed. A teaser card on a news index is heading, prose and link at once; an interactive
compatibility table is neither form nor table; a tab strip is none of the ten. Each was
scored at 0.2 to 0.3 spread across three neighbours.

The same 137 regions rerun with 49 types, one flat list with a sentence of definition
each: 7% flagged, minimum confidence 0.32 against 0.19, first quartile 0.80 against
0.66, median unchanged at 0.94. 37 of the 49 types were chosen at least once. Widening
the list made the model more certain, not less. Cost doubled to $0.014 for the run,
which is 20 cents for a fifty-page corpus.

Two arguments for keeping the list short were considered and rejected. That a decision
model degrades with many options: the API allows 255 and the data shows the opposite
within the range tested. That the renderer needs few types: design systems with thirty to
forty components are routine and finished, and the development plan already holds that
the classifier is the hard half and the layout is a stylesheet.

## Decision

The taxonomy is as wide as the corpus supports. A type earns its place if a person and Jev
agree on it at useful confidence and something downstream, the layout or the block policy,
treats it differently from its neighbours. Types that fail either test are merged after
the corpus run, not before it.

The list lives in one place, `tools/label/questions.js`, with a one-sentence definition
per type. That file is the taxonomy. The concept's table of ten is superseded as a
specification and stands as the original sketch.

The width applies to Jev's labelling, which is offline. It does not by itself commit the
page-load classifier (ADR 0010) to reproducing every distinction: the B4 scorecard reports
per type which distinctions the heuristics recover, and a type the heuristics cannot find
becomes a per-site rule or a merge, decided on that evidence.

## Consequences

The milestone 1 gate changes wording. It is no longer "do ten types survive the real web"
but "does the corpus settle on a set of types that both the model and the heuristics can
find". The scorecard answers it per type rather than as one number.

Granular block policy becomes possible: "drop share buttons, keep the byline" needs
`share` and `byline` to be different types, and they are.

Jev's per-call cost scales with the definition text, since the criteria ride along on
every request. At 49 types that is about 2,500 input tokens per region. Acceptable for
offline labelling; one more reason it stays out of the hot path (ADR 0009).

Types unused on the trial pages (`table`, `video`, `math`, `footnote`, `sponsored`,
`newsletter`, `paywall`, `app_nag`, `decoration`) are a corpus requirement, not a
taxonomy fault: B1 must include pages that exercise them.

Definitions will need editing as the corpus exposes their edges. The trial already found
one: `tabs` was written as "without leaving the page" and MDN's top navigation buttons
scored 0.55 for it. Definition edits are ordinary work and do not need a new record;
adding or merging a type after the corpus run does.
