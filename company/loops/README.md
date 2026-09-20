# Loop prompts

One file per role. Each is the complete prompt a scheduled task sends to a fresh Claude
session, so it has to stand alone: the session has no memory of any previous run and
learns everything from the repo it clones.

Keep the prompts short and put the substance in `../ROLES.md`, which every run reads
after cloning. That way a change to how a role works is one edit in one file and takes
effect on the next run, with no task to update.

Placeholders, filled in when D1 is answered:

- `REPO_URL`: the GitHub clone URL
- `MONDRIAN_GITHUB_TOKEN`: environment variable holding the push credential

Bootstrap, common to all four:

```
git clone "$REPO_URL" mondrian && cd mondrian
git config user.name "Mondrian <role>" && git config user.email "experiment935@gmail.com"
```

Pushing: `git push "https://x-access-token:${MONDRIAN_GITHUB_TOKEN}@github.com/OWNER/mondrian.git" <branch>`.
Opening a PR: POST to `https://api.github.com/repos/OWNER/mondrian/pulls` with the token.
Never echo the token, never write it into any file in the repo.

Running the fixture suite in the cloud (Linux, no display):

```
npm ci
xvfb-run -a --server-args="-screen 0 1440x900x24" dbus-run-session -- npm test
```
