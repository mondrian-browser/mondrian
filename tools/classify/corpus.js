// Load the labelled corpus for classification and scoring, and split it by site.
//
// The split is a hash of the site name, so it is the same in every tool and every run:
// three quarters of sites are dev, one quarter holdout. `fold(site, k)` gives a k-fold
// assignment from the same hash for cross-validation.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const PAGES_DIR = path.join(ROOT, 'corpus', 'pages');
const HOLDOUT_FRACTION = 0.25;

const hash01 = (site) => parseInt(crypto.createHash('md5').update(site).digest('hex').slice(0, 8), 16) / 0xffffffff;
const isHoldout = (site) => hash01(site) < HOLDOUT_FRACTION;
const fold = (site, k) => Math.floor(hash01(site) * k) % k;

function loadPages() {
  const pages = [];
  for (const id of fs.readdirSync(PAGES_DIR)) {
    const dir = path.join(PAGES_DIR, id);
    if (!fs.existsSync(path.join(dir, 'labels.json'))) continue;
    const regions = JSON.parse(fs.readFileSync(path.join(dir, 'regions.json'), 'utf8'));
    const labels = JSON.parse(fs.readFileSync(path.join(dir, 'labels.json'), 'utf8'));
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
    pages.push({ id, site: meta.site, url: regions.url, title: regions.title, viewport: regions.viewport, pageHeight: regions.pageHeight, regions: regions.regions, labels: labels.regions, tier: meta.tier, split: isHoldout(meta.site) ? 'holdout' : 'dev' });
  }
  return pages;
}

module.exports = { ROOT, PAGES_DIR, loadPages, isHoldout, fold, HOLDOUT_FRACTION };
