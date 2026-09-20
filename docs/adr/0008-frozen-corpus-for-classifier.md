# 0008. The classifier is developed against a frozen corpus

Date: 2026-09-20
Status: accepted

## Context

Mondrian's live-site test suite showed what developing against the real web costs. From a
single IP, bot walls and rate limits made a third of twenty sites unreachable, results
varied run to run, and a full pass took minutes.

Classifier work needs an iteration loop measured in milliseconds and results that do not
change when a site does.

## Decision

Capture the corpus once and store the serialised DOM. Iterate offline.

Capture through Mondrian rather than an HTTP client, because the preload already walks
shadow DOM and much of the web renders client-side. A `curl` corpus would misrepresent
exactly the pages that are hardest to classify.

Store several pages per site, because a region that repeats identically across pages of
one site is the strongest available signal that it is chrome.

## Consequences

The classifier can be measured deterministically and regressions are visible as a diff
against the previous run.

The corpus goes stale and has to be refreshed deliberately. That is a feature: the
classifier should not change because a site did, unless someone chose to look.

A separate, slower suite still runs against live sites, to catch the difference between
the corpus and the web as it is now.
