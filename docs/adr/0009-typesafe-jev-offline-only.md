# 0009. TypeSafe Jev for offline classification work, not the hot path

Date: 2026-09-20
Status: accepted

## Context

TypeSafe AI came out of stealth in September 2026 with Jev, a "System One" model that
returns typed decisions rather than text. Three primitives: Choice (pick from options,
with per-option probabilities and confidence), Score (rate against ordered levels), and
Noul (yes/no with probability). Reported at 70 to 500ms end to end, $0.042 per million
input tokens with output free, roughly $0.0001 per call, and 76% accuracy on TypeSafe's
own workflow evaluations. Python and JavaScript SDKs, plus an agent skill for Claude Code.

The shape is a good match for Mondrian's central problem. "Which of ten block types is
this element, or is it chrome?" is exactly a Choice. "Is this page a document or an
application?" is exactly a Noul. So the question is where it belongs.

## Decision

Jev is used for offline work only. It does not go in the page-load path.

**Used for:**

1. **Labelling the milestone 1 corpus.** Ground truth is the tedious blocker on proving
   the classifier. Choice over the ten block types with confidence thresholding, routing
   low-confidence cases to Lloyd for review, turns days of hand-labelling into an
   afternoon of review.
2. **Measuring the ceiling.** Running Jev over the labelled corpus tells us how well a
   decision model does this specific task, which no published number currently does.
   That measurement decides whether it earns any larger role.
3. **Finding where heuristics lose.** Compare the deterministic classifier against Jev
   over the corpus. The disagreements are where per-site rules need writing.
4. **Composition adjudication, possibly.** Deciding whether two blocks contradict is a
   Noul, and composition happens on a gesture rather than a page load, so 500ms is
   acceptable. To be evaluated at milestone 4, not before.

**Not used for:** classifying elements during a page load, or the escape-hatch decision
on first visit to a site.

## Consequences

Three reasons the hot path is closed to it, in order of severity.

**Privacy.** Jev is a hosted API with no self-hosted option. Classifying during page load
means sending the content of every page a user visits to a third party. That is
unacceptable in a browser regardless of the vendor's data handling, and it contradicts
the PRD directly: no telemetry, no server, block cache local. This alone settles it.

**It breaks the deterministic core.** ADR 0006 requires the filter, layout and cache to
work with no model and no network. A hosted dependency in the render path means Mondrian
does not work offline and every user needs an API key before a page renders.

**Latency and shape.** The budget is 400ms to first block for a whole page. One Jev call
is 70 to 500ms, and a page has dozens of candidate regions. Even batched, a single
round trip can consume the entire budget.

Cost is a lesser concern but real: $0.0001 per call is trivial individually and is still
a per-page-load cost carried by someone, which is incoherent for free software.

**On the evidence.** Coverage so far is promotional and there is no independent
validation of the accuracy claims. The 76% figure is on TypeSafe's own evaluations of
generic workflows, which says little about ten-way block typing on real web pages, a
harder problem than the binary readability decision Brave's SpeedReader classifier
reports 91% on. Treat all of it as unmeasured until it has been run against Mondrian's
own corpus. That measurement is cheap and is step 2 above.

**If a self-hosted or on-device version ships**, this decision should be revisited. The
privacy objection disappears and the latency question becomes an empirical one. Write a
new record rather than editing this one.
