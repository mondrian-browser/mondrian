# Architecture decision records

One file per decision that would be expensive to reverse or confusing to rediscover.
Numbered, dated, and never edited after acceptance: if a decision changes, write a new
record that supersedes the old one and mark the old one superseded. The point is a
readable trail of why the code looks like it does.

Format is Michael Nygard's: context, decision, consequences, status. Keep them short.
A record nobody reads is worse than none.

Records 0002 to 0007 were written after the fact, from decisions already made and
measured during development. Their dates are when the decision was made, not when it
was written down.

| # | decision | status |
|---|---|---|
| 0001 | Record architecture decisions | accepted |
| 0002 | Electron as the shell | accepted |
| 0003 | Rule JavaScript runs in a dedicated isolated world | accepted |
| 0004 | Main-world scripts are injected as one bundle | accepted |
| 0005 | One request listener, ad blocking as a library | accepted |
| 0006 | Deterministic core, Claude optional | accepted |
| 0007 | Apache-2.0, free and open source | accepted |
| 0008 | Classifier is developed against a frozen corpus | accepted |
| 0009 | TypeSafe Jev for offline classification work, not the hot path | accepted |
| 0010 | Heuristics before any trained classifier | accepted |
| 0011 | Three rendering tiers, no raw escape | accepted |
| 0012 | Credentials per profile, steering scoped per profile | accepted |
