# Calendar

Dated obligations. Operations checks this every run and acts when today is within the
lead time. Dates are Melbourne local. Unknown dates are written as `unset` with the rule
that sets them, so nothing is silently missing.

| when | what | lead time | owner | notes |
|---|---|---|---|---|
| n/a (retired 21 Sep 2026) | rotate the GitHub token | n/a | operations | D1 answered: the routines push through the Claude GitHub App as Lloyd and no token is stored, so there is nothing to rotate. Reinstate if a token is ever issued. |
| unset (D2 filing + 5 business days) | TM Headstart report due back | 0 | operations | read it, log the outcome, queue the conversion decision |
| unset (Headstart report + 5 business days) | convert Headstart to a full application, $130 | 3 days | operations | expires if not converted |
| unset (D3) | ASIC annual review, $342, due on the registration anniversary | 30 days | operations | set when the company exists |
| unset (D3) | BAS, quarterly, 28 days after quarter end | 21 days | operations | only if GST registered; prepare figures, Lloyd lodges |
| unset | domain renewal | 30 days | operations | set when a domain is bought |
| unset (D4) | code signing certificate renewal | 45 days | operations | set when issued |
| every Monday | weekly report | 0 | operations | `company/reports/YYYY-WW.md`, ISO week, named for the week it covers, which is the one that ended yesterday |
| 1st of the month | dependency and licence audit | 0 | operations | npm audit, npm outdated, NOTICE check |
| 1st of the month | positioning check against PRD | 0 | marketing | only produces output if the PRD changed |
