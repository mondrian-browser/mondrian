# 0010. Heuristics before any trained classifier

Date: 2026-09-20
Status: accepted

## Context

Milestone 1 proves the design filter. The open question was whether to train a classifier
for ten-way block typing straight away, since a trained model generalises to sites nobody
has written rules for and a rule set does not.

That argument is correct as far as it goes. The counter is that the variation between
sites is mostly cosmetic. Class names, tag choices and framework differ; the signals that
identify a block do not. A nav is link-dense with short text wherever it appears.
Mozilla Readability handles sites it has never seen with no per-site knowledge, precisely
because it ignores what varies.

## Decision

Milestone 1 runs in a fixed order: capture the corpus, label it, build a heuristics-only
baseline, score it and read the failures, and only then decide whether to train anything.

If a model is trained, the default is gradient boosted trees over structural features
rather than a neural model, unless the failure analysis gives a specific reason otherwise.

## Consequences

The ordering is chosen so the cheapest thing that could kill the milestone fires first,
and that is not accuracy. The likely failure is that the ten block types do not carve real
pages at the joints. A heuristic that cannot separate two types exposes the feature values
and therefore the reason, so a taxonomy problem announces itself. A model returns a worse
number and no explanation, and the natural response to a worse number is to collect more
data, which does not fix a taxonomy.

The baseline is also the thing a model has to beat. Without it, any accuracy figure from a
trained classifier is unanchored.

Preferring trees is about more than size and speed, though they are small and fast. The
concept promises that nothing is silently deleted and that a user can tell a bug from a
decision. Software whose job is discarding parts of pages has to be able to say why it
discarded something, and a tree can name the feature that decided the call. This is a
product requirement, not an engineering preference.

The cost is that a trained classifier arrives later than it otherwise would, so the long
tail of unseen sites stays weaker for longer. The labelling in 1.2 produces the training
data either way, so nothing is wasted by waiting, and 1.4 tells us how long that tail
actually is rather than assuming.
