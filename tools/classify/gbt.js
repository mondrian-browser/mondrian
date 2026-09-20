// Gradient boosted trees, multiclass, in plain JavaScript. NEXT.md B5, ADR 0010.
//
// Written here rather than pulled in because the corpus is small (a few thousand rows,
// a few hundred features) and a native dependency would be the only one in the project.
// Standard construction: softmax objective, one regression tree per class per round on
// first and second order gradients, histogram splits over quantile-binned features,
// Newton leaf values, column and row subsampling. Depth-limited trees, no pruning.
//
//   const model = train(X, y, K, { rounds, depth, learningRate, ... }, log)
//   predictProba(model, x) -> Float64Array of K probabilities
//   toJSON / fromJSON for saving. The model records feature names if given.

'use strict';

const DEFAULTS = {
  rounds: 60,
  depth: 4,
  learningRate: 0.15,
  minLeaf: 4,
  lambda: 1.0,        // L2 on leaf values
  gamma: 0.0,         // minimum gain
  bins: 32,
  colSample: 0.5,
  rowSample: 0.85,
  seed: 7,
};

function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; }

// Quantile thresholds per feature, then every value becomes a bin index (Uint8).
function binFeatures(X, n, d, bins) {
  const thresholds = new Array(d);
  const B = new Uint8Array(n * d);
  const col = new Float64Array(n);
  for (let j = 0; j < d; j++) {
    for (let i = 0; i < n; i++) col[i] = X[i * d + j];
    const sorted = Float64Array.from(col).sort();
    const th = [];
    for (let b = 1; b < bins; b++) {
      const v = sorted[Math.floor(b * n / bins)];
      if (th.length === 0 || v > th[th.length - 1]) th.push(v);
    }
    thresholds[j] = th;
    for (let i = 0; i < n; i++) {
      const x = col[i];
      let lo = 0, hi = th.length; // first threshold > x
      while (lo < hi) { const mid = (lo + hi) >> 1; if (th[mid] <= x) lo = mid + 1; else hi = mid; }
      B[i * d + j] = lo;
    }
  }
  return { thresholds, B };
}

function binValue(th, x) {
  let lo = 0, hi = th.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (th[mid] <= x) lo = mid + 1; else hi = mid; }
  return lo;
}

// One regression tree on (g, h) over the rows in `rows`, using binned features B.
function buildTree(B, d, rows, g, h, opts, feats, maxBins) {
  const { depth, minLeaf, lambda, gamma } = opts;
  const nodes = [];
  const G = new Float64Array(maxBins), H = new Float64Array(maxBins);
  function leafValue(sumG, sumH) { return -sumG / (sumH + lambda); }
  function grow(rowsHere, level) {
    let sumG = 0, sumH = 0;
    for (let k = 0; k < rowsHere.length; k++) { sumG += g[rowsHere[k]]; sumH += h[rowsHere[k]]; }
    const id = nodes.length;
    nodes.push(null);
    if (level >= depth || rowsHere.length < 2 * minLeaf) { nodes[id] = { leaf: leafValue(sumG, sumH) }; return id; }
    let best = { gain: gamma, feat: -1, bin: -1 };
    const parentScore = sumG * sumG / (sumH + lambda);
    for (let fi = 0; fi < feats.length; fi++) {
      const j = feats[fi];
      G.fill(0); H.fill(0);
      for (let k = 0; k < rowsHere.length; k++) { const r = rowsHere[k]; const b = B[r * d + j]; G[b] += g[r]; H[b] += h[r]; }
      let gl = 0, hl = 0, nl = 0;
      // count rows per bin for the minLeaf check, cheaply via H being ~proportional is not
      // safe; count explicitly.
      const C = countBins(B, d, j, rowsHere, maxBins);
      for (let b = 0; b < maxBins - 1; b++) {
        gl += G[b]; hl += H[b]; nl += C[b];
        if (nl < minLeaf) continue;
        if (rowsHere.length - nl < minLeaf) break;
        const gr = sumG - gl, hr = sumH - hl;
        const gain = gl * gl / (hl + lambda) + gr * gr / (hr + lambda) - parentScore;
        if (gain > best.gain) best = { gain, feat: j, bin: b };
      }
    }
    if (best.feat < 0) { nodes[id] = { leaf: leafValue(sumG, sumH) }; return id; }
    const left = [], right = [];
    for (let k = 0; k < rowsHere.length; k++) { const r = rowsHere[k]; (B[r * d + best.feat] <= best.bin ? left : right).push(r); }
    const l = grow(left, level + 1);
    const r = grow(right, level + 1);
    nodes[id] = { feat: best.feat, bin: best.bin, left: l, right: r };
    return id;
  }
  grow(rows, 0);
  return nodes;
}

function countBins(B, d, j, rows, maxBins) {
  const C = new Int32Array(maxBins);
  for (let k = 0; k < rows.length; k++) C[B[rows[k] * d + j]]++;
  return C;
}

function treePredictBinned(nodes, B, d, r) {
  let id = 0;
  for (;;) { const nd = nodes[id]; if (nd.leaf !== undefined) return nd.leaf; id = B[r * d + nd.feat] <= nd.bin ? nd.left : nd.right; }
}

function treePredictRaw(nodes, thresholds, x) {
  let id = 0;
  for (;;) { const nd = nodes[id]; if (nd.leaf !== undefined) return nd.leaf; id = binValue(thresholds[nd.feat], x[nd.feat]) <= nd.bin ? nd.left : nd.right; }
}

// X: Float32Array n*d row-major. y: Int32Array of class ids in [0, K). Returns the model.
function train(X, y, K, options = {}, log = () => {}) {
  const opts = { ...DEFAULTS, ...options };
  const n = y.length, d = X.length / n;
  const rand = rng(opts.seed);
  const { thresholds, B } = binFeatures(X, n, d, opts.bins);
  const maxBins = opts.bins;
  // Class priors as the starting score.
  const counts = new Float64Array(K);
  for (let i = 0; i < n; i++) counts[y[i]]++;
  const base = new Float64Array(K);
  for (let k = 0; k < K; k++) base[k] = Math.log((counts[k] + 1) / (n + K));
  const present = [];
  for (let k = 0; k < K; k++) if (counts[k] > 0) present.push(k);
  const F = new Float64Array(n * K);
  for (let i = 0; i < n; i++) for (let k = 0; k < K; k++) F[i * K + k] = base[k];
  const P = new Float64Array(n * K);
  const g = new Float64Array(n), h = new Float64Array(n);
  const trees = []; // per round: { [k]: nodes }
  const allFeats = Array.from({ length: d }, (_, j) => j);
  const t0 = Date.now();
  for (let round = 0; round < opts.rounds; round++) {
    // softmax
    for (let i = 0; i < n; i++) {
      let m = -Infinity;
      for (let k = 0; k < K; k++) if (F[i * K + k] > m) m = F[i * K + k];
      let s = 0;
      for (let k = 0; k < K; k++) { const e = Math.exp(F[i * K + k] - m); P[i * K + k] = e; s += e; }
      for (let k = 0; k < K; k++) P[i * K + k] /= s;
    }
    const rows = [];
    for (let i = 0; i < n; i++) if (rand() < opts.rowSample) rows.push(i);
    const roundTrees = {};
    for (const k of present) {
      for (let i = 0; i < n; i++) { const p = P[i * K + k]; g[i] = p - (y[i] === k ? 1 : 0); h[i] = Math.max(p * (1 - p), 1e-6); }
      const feats = allFeats.filter(() => rand() < opts.colSample);
      const nodes = buildTree(B, d, rows, g, h, opts, feats, maxBins);
      roundTrees[k] = nodes;
      for (let i = 0; i < n; i++) F[i * K + k] += opts.learningRate * treePredictBinned(nodes, B, d, i);
    }
    trees.push(roundTrees);
    if (round % 10 === 9 || round === opts.rounds - 1) {
      let right = 0, loss = 0;
      for (let i = 0; i < n; i++) {
        let bk = 0;
        for (let k = 1; k < K; k++) if (F[i * K + k] > F[i * K + bk]) bk = k;
        if (bk === y[i]) right++;
        loss -= Math.log(Math.max(P[i * K + y[i]], 1e-12));
      }
      log(`round ${round + 1}/${opts.rounds}  train acc ${(100 * right / n).toFixed(1)}%  logloss ${(loss / n).toFixed(3)}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  }
  return { K, d, opts, thresholds, base: Array.from(base), trees, classes: present };
}

function predictProba(model, x) {
  const { K, thresholds, base, trees, opts } = model;
  const F = Float64Array.from(base);
  for (const round of trees) for (const k in round) F[k] += opts.learningRate * treePredictRaw(round[k], thresholds, x);
  let m = -Infinity;
  for (let k = 0; k < K; k++) if (F[k] > m) m = F[k];
  let s = 0;
  for (let k = 0; k < K; k++) { F[k] = Math.exp(F[k] - m); s += F[k]; }
  for (let k = 0; k < K; k++) F[k] /= s;
  return F;
}

function toJSON(model, extra = {}) { return { ...extra, ...model }; }
function fromJSON(obj) { return obj; }

module.exports = { train, predictProba, toJSON, fromJSON, DEFAULTS };
