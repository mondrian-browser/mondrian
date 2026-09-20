# 0001. Record architecture decisions

Date: 2026-09-20
Status: accepted

## Context

Mondrian has already accumulated decisions that are expensive to reverse and not
obvious from the code. Several were reached by measuring browser behaviour rather than
reading documentation, and the measurement is the reason the decision holds. That
reasoning was living in commit messages and in one long chat, neither of which a future
contributor will read.

## Decision

Keep architecture decision records in `docs/adr/`, numbered sequentially, in Nygard
format. Write one whenever a decision would be expensive to reverse, surprising to a
newcomer, or was reached by measurement that would otherwise have to be repeated.

Records are immutable once accepted. A changed decision gets a new record that supersedes
the old one.

## Consequences

Decisions become reviewable in a pull request, which is the point.

`docs/project/04-GOTCHAS.md` keeps a different job: it records browser behaviour that
surprised us, not decisions we made. Some entries there are the evidence behind a record
here, and they cross-reference.
