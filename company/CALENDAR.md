# Calendar

Dated obligations. Operations checks this every run and acts when today is within the
lead time. Dates are Melbourne local. Unknown dates are written as `unset` with the rule
that sets them, so nothing is silently missing.

| when | what | lead time | owner | notes |
|---|---|---|---|---|
| unset (D1 + 90 days) | rotate the GitHub token | 14 days | operations | set when D1 is answered |
| unset (D2 filing + 5 business days) | TM Headstart report due back | 0 | operations | read it, log the outcome, queue the conversion decision |
| unset (Headstart report + 5 business days) | convert Headstart to a full application, $130 | 3 days | operations | expires if not converted |
| unset (D3) | ASIC annual review, $342, due on the registration anniversary | 30 days | operations | set when the company exists |
| unset (D3) | BAS, quarterly, 28 days after quarter end | 21 days | operations | only if GST registered; prepare figures, Lloyd lodges |
| unset | domain renewal | 30 days | operations | set when a domain is bought |
| unset (D4) | code signing certificate renewal | 45 days | operations | set when issued |
| every Monday | weekly report | 0 | operations | `company/reports/YYYY-WW.md` |
| 1st of the month | dependency and licence audit | 0 | operations | npm audit, npm outdated, NOTICE check |
| 1st of the month | positioning check against PRD | 0 | marketing | only produces output if the PRD changed |
