# Decisions

Things only Lloyd can do. Roles add entries, Lloyd writes the answer under each one, the
role acts on it next run and marks it (done). Format is in `ROLES.md`.

---

### D1 (open) setup, 2026-09-20
Ask: publish the repo to GitHub (NEXT A4) and give the role tasks a way to push.
The roles run in the cloud and clone fresh each time. Reading a public repo needs nothing.
Pushing branches, opening PRs and appending to LOG.md needs a credential.
Options:
  a. Fine-grained personal access token scoped to the one repo, permissions Contents
     read/write and Pull requests read/write, 90 day expiry, stored as an environment
     secret for the scheduled tasks. Simplest. Rotate quarterly (operations will remind).
  b. A GitHub App installed on the repo. More setup, better audit trail, no expiry churn.
Recommendation: a, then b if the company grows past one repo.
Answer:

### D2 (open) operations, 2026-09-20
Ask: file TM Headstart for MONDRIAN in class 9, $200 now, $130 later to convert.
Specification, narrow on purpose to avoid the Phasecraft citation (TM 2677332, quantum
software, priority 13 Nov 2025):
  Class 9: Web browser software; downloadable web browser software; browser extension
  software; software for reformatting and laying out web page content for reading.
Add class 42 only if a hosted service exists later.
Answer:

### D3 (open) operations, 2026-09-20
Ask: company structure and timing. Sole trader with ABN and business name now (ABN free,
business name under $50 a year), or Pty Ltd now ($636 to register, $342 annual review).
Depends on D2: if the name clears Headstart, registering the company under it makes sense;
if not, a neutral holding name or wait.
Answer:

### D4 (open) engineering, 2026-09-20
Ask: OV code signing certificate for NEXT C2, 200 to 400 a year. Not urgent until there is
a build worth signing, but the vetting takes weeks and needs a registered business, so it
sits behind D3.
Answer:
