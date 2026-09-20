// The whole TypeSafe client: one POST. No SDK, because the API is a single endpoint and
// ADR 0006 keeps the core free of model dependencies; this lives in tools/, never app/.
//
// The key comes from TYPESAFE_API_KEY. It is never logged. On Windows the user-level
// variable is read from the registry when the process env lacks it, so a shell opened
// before the key was set still works.

'use strict';

const { execFileSync } = require('child_process');

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const MODEL = 'jev-latest';

function apiKey() {
  if (process.env.TYPESAFE_API_KEY) return process.env.TYPESAFE_API_KEY;
  if (process.platform === 'win32') {
    try {
      const out = execFileSync('powershell.exe', ['-NoProfile', '-Command',
        '[Environment]::GetEnvironmentVariable("TYPESAFE_API_KEY","User")'], { encoding: 'utf8' }).trim();
      if (out) return out;
    } catch (_) {}
  }
  throw new Error('TYPESAFE_API_KEY is not set. Create a key at https://console.typesafe.ai/keys and export it.');
}

// Ask Jev a set of questions over one state. Returns the parsed response:
// { model, answers: { <id>: answer }, usage: { input_tokens, output_tokens } }.
// Retries 429 and 529 with backoff; everything else throws with the server's message.
async function ask(state, questions, { retries = 4 } = {}) {
  const key = apiKey();
  const body = JSON.stringify({ state, model: MODEL, questions });
  let wait = 800;
  for (let attempt = 0; ; attempt++) {
    const started = Date.now();
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body,
    });
    if (res.ok) {
      const json = await res.json();
      json.ms = Date.now() - started;
      return json;
    }
    const text = await res.text();
    if ((res.status === 429 || res.status === 529) && attempt < retries) {
      await new Promise((r) => setTimeout(r, wait));
      wait *= 2;
      continue;
    }
    throw new Error(`TypeSafe ${res.status}: ${text.slice(0, 500)}`);
  }
}

module.exports = { ask, MODEL, ENDPOINT };
