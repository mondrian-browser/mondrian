// Jev trial: does a decision model type page regions well enough, and does its confidence
// separate the easy regions from the hard ones? Answers that on a handful of live pages
// before B1 commits to capturing fifty of them. ADR 0009, NEXT.md B2.
//
//   node tools/label/trial.js            six pages of six kinds
//   node tools/label/trial.js <url>...   your own
//
// Drives the running browser over its control socket (launch it first: `status` from
// the MCP, or `npm start`), extracts regions with extract.js, asks Jev one question per
// region plus one per page, prints a table, and writes the full result to
// .runtime/label-trial/<timestamp>.json so the numbers can be looked at again.

'use strict';

const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { ask, MODEL } = require('./jev');
const { EXTRACT_SOURCE } = require('./extract');
const { REVIEW_BELOW, regionQuestion, applicationQuestion } = require('./questions');

const ROOT = path.resolve(__dirname, '..', '..');
const CONTROL = path.join(ROOT, '.runtime', 'control.json');
const OUT_DIR = path.join(ROOT, '.runtime', 'label-trial');
const PROFILE = 'claude';
const CONCURRENCY = 4;

const DEFAULT_PAGES = [
  'https://en.wikipedia.org/wiki/Piet_Mondrian',                              // reference
  'https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/innerText',   // documentation
  'https://news.ycombinator.com/item?id=3078128',                             // forum thread
  'https://www.bbcgoodfood.com/recipes/classic-victoria-sandwich-recipe',     // recipe
  'https://www.bbc.com/news/technology',                                      // listing
  'https://excalidraw.com/',                                                  // application
];

// ---------------------------------------------------------------- control client
class Client {
  constructor(info) { this.info = info; this.seq = 0; this.pending = new Map(); }
  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://${this.info.host}:${this.info.port}`);
      const t = setTimeout(() => reject(new Error('control socket timeout')), 5000);
      ws.once('error', reject);
      ws.once('open', () => ws.send(JSON.stringify({ auth: this.info.token })));
      ws.on('message', (raw) => {
        const m = JSON.parse(raw.toString());
        if (m.type === 'hello') { clearTimeout(t); this.ws = ws; return resolve(this); }
        if (m.type === 'event') return;
        const p = this.pending.get(m.id);
        if (!p) return;
        this.pending.delete(m.id);
        m.ok ? p.resolve(m.result) : p.reject(new Error(m.error));
      });
    });
  }
  call(cmd, args = {}, timeoutMs = 45000) {
    return new Promise((resolve, reject) => {
      const id = `l${++this.seq}`;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${cmd} timed out`)); }, timeoutMs);
      this.pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
      this.ws.send(JSON.stringify({ id, cmd, args }));
    });
  }
  close() { this.ws.close(); }
}

// ---------------------------------------------------------------- helpers
const brief = (r) => r ? `${r.tag}${r.landmarks.length ? ' in ' + r.landmarks.join('>') : ''}: ${r.text.slice(0, 80).replace(/\n/g, ' ')}` : null;

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

function pad(s, n) { s = String(s ?? ''); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); }

// ---------------------------------------------------------------- one page
async function labelPage(client, url) {
  const tab = await client.call('tab_open', { url, profile: PROFILE, activate: true, wait: true });
  const tabId = tab.id || tab.tabId || (tab.tab && tab.tab.id);
  try {
    await client.call('wait_for', { tabId, load: true, timeoutMs: 15000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1500)); // let late hydration settle
    const { value: page } = await client.call('eval_js', { tabId, code: EXTRACT_SOURCE });
    if (!page || !Array.isArray(page.regions)) throw new Error(`extractor returned ${JSON.stringify(page).slice(0, 200)}`);
    const regions = page.regions;

    const pageState = {
      page: { url: page.url, title: page.title },
    };

    // One call per region: small state, one decision, neighbours for context only.
    const regionAnswers = await mapLimit(regions, CONCURRENCY, async (r, i) => {
      const { index, ...region } = r;
      const state = { ...pageState, region: { ...region, before: brief(regions[i - 1]), after: brief(regions[i + 1]) } };
      const res = await ask(state, { type: regionQuestion() });
      const a = res.answers.type;
      const ranked = Object.entries(a.probabilities).sort((x, y) => y[1] - x[1]);
      return { index: i, choice: a.choice, confidence: a.confidence, top2: ranked.slice(0, 2), ms: res.ms, usage: res.usage };
    });

    // One call per page: document or application.
    const summary = regions.map((r) => `${r.tag}${r.landmarks.length ? '(' + r.landmarks.join('>') + ')' : ''} ${r.textLength}ch ${r.counts.links}a ${r.counts.controls}ctl`).join('; ');
    const appRes = await ask({ page: { ...pageState.page, regionCount: regions.length, regions: summary } }, { app: applicationQuestion() });

    return { url, title: page.title, tabId, regions, answers: regionAnswers, application: appRes.answers.app.noul, model: appRes.model };
  } finally {
    await client.call('tab_close', { tabId }).catch(() => {});
  }
}

// ---------------------------------------------------------------- report
function report(result) {
  const { url, title, regions, answers, application } = result;
  console.log(`\n${'='.repeat(110)}\n${title}\n${url}\napplication: ${application.toFixed(2)}   regions: ${regions.length}`);
  console.log(`${'-'.repeat(110)}`);
  console.log(`${pad('#', 3)} ${pad('type', 18)} ${pad('conf', 5)} ${pad('runner-up', 20)} ${pad('tag', 12)} ${pad('where', 18)} text`);
  for (const a of answers) {
    const r = regions[a.index];
    const flag = a.confidence < REVIEW_BELOW ? '?' : ' ';
    const runnerUp = a.top2[1] ? `${a.top2[1][0]} ${a.top2[1][1].toFixed(2)}` : '';
    const where = r.landmarks.join('>') || (r.geometry.aboveFold ? 'above fold' : `${Math.round(r.geometry.pageFraction * 100)}% down`);
    console.log(`${pad(a.index, 3)} ${pad(a.choice + flag, 18)} ${pad(a.confidence.toFixed(2), 5)} ${pad(runnerUp, 20)} ${pad(r.tag, 12)} ${pad(where, 18)} ${r.text.slice(0, 40).replace(/\n/g, ' ')}`);
  }
}

function summarise(results) {
  const all = results.flatMap((r) => r.answers);
  const conf = all.map((a) => a.confidence).sort((a, b) => a - b);
  const q = (p) => conf[Math.min(conf.length - 1, Math.floor(p * conf.length))];
  const byType = {};
  for (const a of all) byType[a.choice] = (byType[a.choice] || 0) + 1;
  const flagged = all.filter((a) => a.confidence < REVIEW_BELOW).length;
  const ms = all.map((a) => a.ms).sort((a, b) => a - b);
  const tokens = all.reduce((n, a) => n + (a.usage ? a.usage.input_tokens : 0), 0);
  console.log(`\n${'='.repeat(110)}\nSUMMARY  model ${results[0] && results[0].model || MODEL}`);
  console.log(`regions ${all.length}   flagged for review (<${REVIEW_BELOW}) ${flagged} (${Math.round(100 * flagged / all.length)}%)`);
  console.log(`confidence  min ${q(0).toFixed(2)}  p25 ${q(0.25).toFixed(2)}  median ${q(0.5).toFixed(2)}  p75 ${q(0.75).toFixed(2)}  max ${conf[conf.length - 1].toFixed(2)}`);
  console.log(`latency ms  median ${ms[Math.floor(ms.length / 2)]}  p90 ${ms[Math.floor(ms.length * 0.9)]}   input tokens ${tokens}   est. cost $${(tokens * 0.042 / 1e6).toFixed(4)}`);
  console.log('by type  ' + Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join('  '));
  for (const r of results) console.log(`application  ${r.application.toFixed(2)}  ${r.title.slice(0, 60)}`);
}

// ---------------------------------------------------------------- run
(async () => {
  const pages = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_PAGES;
  if (!fs.existsSync(CONTROL)) {
    console.error('Browser is not running (no .runtime/control.json). Start it with `npm start` or the MCP `status` tool.');
    process.exit(1);
  }
  const client = await new Client(JSON.parse(fs.readFileSync(CONTROL, 'utf8'))).connect();
  await client.call('ui_note', { text: `Jev trial: labelling ${pages.length} pages in the ${PROFILE} profile.` }).catch(() => {});

  const results = [];
  for (const url of pages) {
    process.stdout.write(`\n${url} … `);
    try {
      const r = await labelPage(client, url);
      results.push(r);
      process.stdout.write(`${r.regions.length} regions`);
      report(r);
    } catch (e) {
      process.stdout.write(`FAILED: ${e.message}`);
      results.push({ url, error: e.message, answers: [], regions: [] });
    }
  }
  const ok = results.filter((r) => !r.error);
  if (ok.length) summarise(ok);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, new Date().toISOString().replace(/[:.]/g, '-') + '.json');
  fs.writeFileSync(out, JSON.stringify({ model: MODEL, reviewBelow: REVIEW_BELOW, results }, null, 2));
  console.log(`\nwritten ${path.relative(ROOT, out)}`);
  await client.call('ui_note', { text: `Jev trial done: ${ok.length}/${pages.length} pages, results in .runtime/label-trial/.`, level: 'success' }).catch(() => {});
  client.close();
})().catch((e) => { console.error(e); process.exit(1); });
