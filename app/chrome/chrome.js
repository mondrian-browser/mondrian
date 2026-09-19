'use strict';
// The browser's own UI. It drives the browser through window.browser.cmd(...),
// which is the identical command set Claude uses over the control socket.

const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const cmd = (name, args) => window.browser.cmd(name, args);

const ui = {
  tabs: [],
  activeId: null,
  rules: [],
  panelOpen: false,
  panelView: 'notes',
  editingOmnibox: false,
};

// ---------------------------------------------------------------- tabs
function renderTabs() {
  const host = $('#tabs');
  host.textContent = '';
  for (const t of ui.tabs) {
    const b = el('button', 'tab' + (t.active ? ' is-active' : ''));
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(!!t.active));
    b.title = t.title || t.url || 'New tab';

    if (t.loading) b.appendChild(el('div', 'spinner'));
    else if (t.favicon) { const i = el('img', 'favicon'); i.src = t.favicon; i.onerror = () => i.remove(); b.appendChild(i); }
    else b.appendChild(el('div', 'favicon'));

    b.appendChild(el('span', 'label', t.title || hostOf(t.url) || 'New tab'));
    if (t.profile && t.profile !== ui.defaultProfile) b.appendChild(el('span', 'pill', t.profile));

    const x = el('button', 'close');
    x.setAttribute('aria-label', 'Close tab');
    x.innerHTML = '<svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
    x.onclick = (e) => { e.stopPropagation(); cmd('tab_close', { tabId: t.id }).catch(toastErr); };
    b.appendChild(x);

    b.onclick = () => cmd('tab_activate', { tabId: t.id }).catch(toastErr);
    b.onauxclick = (e) => { if (e.button === 1) cmd('tab_close', { tabId: t.id }).catch(toastErr); };
    host.appendChild(b);
  }
}

// For tab labels: the port is worth seeing on localhost.
function hostOf(url) {
  try { return new URL(url).host.replace(/^www\./, ''); } catch (_) { return ''; }
}

// For the allowlist: must be the bare hostname, because that is what the blocking
// engine matches on. Using .host here silently breaks any site on a non-default port.
function hostnameOf(url) {
  try { return new URL(url).hostname; } catch (_) { return ''; }
}

function renderActive() {
  const t = ui.tabs.find((x) => x.active);
  ui.activeId = t?.id ?? null;
  $('#back').disabled = !t?.canGoBack;
  $('#forward').disabled = !t?.canGoForward;
  const chip = $('#profile-chip');
  chip.textContent = t?.profile || '';
  chip.dataset.profile = t?.profile || '';
  const scheme = $('#scheme');
  if (!ui.editingOmnibox) {
    const url = t?.url && t.url !== 'about:blank' ? t.url : '';
    $('#omnibox').value = url;
    if (url.startsWith('https://')) { scheme.textContent = 'https'; scheme.className = 'secure'; }
    else if (url) { scheme.textContent = url.split(':')[0]; scheme.className = ''; }
    else { scheme.textContent = ''; scheme.className = ''; }
  }
  const active = ui.rules.filter((r) => r.enabled).length;
  $('#rules-dot').hidden = active === 0;
  renderShield(t);
}

function renderShield(t) {
  const ab = ui.adblock || {};
  const host = hostnameOf(t?.url || '');
  const allowed = !!host && (ab.allowlist || []).some((d) => host === d || host.endsWith('.' + d));
  const off = ab.enabled === false || allowed;
  const shield = $('#shield');
  shield.classList.toggle('is-off', off);
  $('#blocked-count').textContent = off || !t?.blockedCount ? '' : (t.blockedCount > 99 ? '99+' : String(t.blockedCount));
  shield.title = ab.enabled === false ? 'Ad blocking is off. Click to turn it on.'
    : allowed ? `Ad blocking is off for ${host}. Click to turn it back on.`
    : `${t?.blockedCount || 0} requests blocked on this page. Click to allow this site.`;
}

// ---------------------------------------------------------------- rules panel
function renderRules() {
  const host = $('#rules-list');
  host.textContent = '';
  if (!ui.rules.length) { host.appendChild(el('p', 'empty', 'No rule sets. Drop a JSON file in rules/ or ask Claude for one.')); return; }
  for (const r of ui.rules) {
    const li = el('li');
    const main = el('div');
    main.style.flex = '1';
    main.appendChild(el('div', 'rule-name', r.title || r.name));
    const bits = [`${r.match.length} match`, r.blockPatterns ? `${r.blockPatterns} block` : null, r.hasCss ? 'css' : null, r.hasJs ? 'js' : null,
      r.hits?.blocked ? `${r.hits.blocked} blocked` : null].filter(Boolean);
    main.appendChild(el('div', 'rule-meta', bits.join(' · ')));
    li.appendChild(main);
    const sw = el('button', 'switch' + (r.enabled ? ' is-on' : ''));
    sw.setAttribute('aria-label', `Toggle ${r.name}`);
    sw.onclick = () => cmd('rules_toggle', { name: r.name, enabled: !r.enabled }).catch(toastErr);
    li.appendChild(sw);
    host.appendChild(li);
  }
}

// ---------------------------------------------------------------- notes
function addNote({ text, level = 'info', t = Date.now() }) {
  $('#notes-empty').hidden = true;
  const li = el('li', level);
  li.appendChild(document.createTextNode(text));
  const time = el('time', null, new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  li.appendChild(time);
  $('#notes').prepend(li);
  while ($('#notes').children.length > 200) $('#notes').lastElementChild.remove();
  toast(text, level);
}

let toastTimer;
function toast(text, level = 'info') {
  const n = el('div', 'toast ' + level, text.length > 220 ? text.slice(0, 217) + '…' : text);
  $('#toasts').appendChild(n);
  setTimeout(() => n.remove(), 4200);
}
const toastErr = (e) => toast(String(e.message || e), 'warning');

// ---------------------------------------------------------------- panel
function setPanel(open, view) {
  ui.panelOpen = open;
  $('#panel').hidden = !open;
  $('#panel-btn').classList.toggle('is-on', open);
  if (view) {
    ui.panelView = view;
    for (const b of document.querySelectorAll('.panel-tab')) b.classList.toggle('is-on', b.dataset.view === view);
    $('#view-notes').hidden = view !== 'notes';
    $('#view-rules').hidden = view !== 'rules';
  }
}

// ---------------------------------------------------------------- wiring
$('#newtab').onclick = () => cmd('tab_open', { activate: true, wait: false }).then(focusOmnibox).catch(toastErr);
$('#back').onclick = () => cmd('history', { action: 'back' }).catch(toastErr);
$('#forward').onclick = () => cmd('history', { action: 'forward' }).catch(toastErr);
$('#reload').onclick = () => cmd('history', { action: 'reload' }).catch(toastErr);

$('#shield').onclick = async () => {
  const t = ui.tabs.find((x) => x.active);
  const host = hostnameOf(t?.url || '');
  const ab = ui.adblock || {};
  try {
    if (ab.enabled === false) { ui.adblock = await cmd('adblock_set', { enabled: true }); toast('Ad blocking on', 'success'); }
    else if (!host) { toast('No site to allow here', 'warning'); }
    else {
      const list = ab.allowlist || [];
      const on = list.some((d) => host === d || host.endsWith('.' + d));
      const next = on ? list.filter((d) => !(host === d || host.endsWith('.' + d))) : [...list, host];
      ui.adblock = await cmd('adblock_set', { allowlist: next });
      toast(on ? `Blocking back on for ${host}` : `Blocking off for ${host}`, on ? 'success' : 'info');
      cmd('history', { action: 'reload' }).catch(() => {});
    }
    renderActive();
  } catch (e) { toastErr(e); }
};

$('#panel-btn').onclick = () => { setPanel(!ui.panelOpen, ui.panelView); cmd('ui_panel', { open: ui.panelOpen }).catch(() => {}); };
$('#panel-close').onclick = () => { setPanel(false); cmd('ui_panel', { open: false }).catch(() => {}); };
$('#rules-btn').onclick = () => { setPanel(true, 'rules'); cmd('ui_panel', { open: true }).catch(() => {}); };
for (const b of document.querySelectorAll('.panel-tab')) b.onclick = () => setPanel(true, b.dataset.view);

for (const b of document.querySelectorAll('.win-btn')) {
  b.onclick = () => {
    // window.close() is a no-op inside a WebContentsView: the chrome is a view, not a
    // window. Every button goes through the same command Claude uses.
    cmd('window', { action: b.dataset.win }).catch(toastErr);
  };
}
$('[data-win="maximize"]').ondblclick = null;

const omni = $('#omnibox');
omni.onfocus = () => { ui.editingOmnibox = true; omni.select(); };
omni.onblur = () => { ui.editingOmnibox = false; renderActive(); };
$('#omniform').onsubmit = (e) => {
  e.preventDefault();
  const value = omni.value.trim();
  if (!value) return;
  omni.blur();
  cmd('navigate', { url: value, wait: false }).catch(toastErr);
};
function focusOmnibox() { omni.focus(); omni.select(); }

// ---------------------------------------------------------------- events from main
window.browser.on('ui:event', (e) => {
  if (!e) return;
  if (e.type === 'tabs-changed') { ui.tabs = e.tabs; renderTabs(); renderActive(); }
  else if (e.type === 'tab-updated') {
    const i = ui.tabs.findIndex((t) => t.id === e.tabId);
    if (i >= 0) { ui.tabs[i] = { ...ui.tabs[i], ...e, active: ui.tabs[i].active }; renderTabs(); renderActive(); }
  } else if (e.type === 'rules-changed') { ui.rules = e.rules; renderRules(); renderActive(); }
  else if (e.type === 'adblock-changed') { ui.adblock = e.adblock; renderActive(); }
});

window.browser.on('ui:note', addNote);
window.browser.on('ui:panel', ({ open }) => setPanel(open, ui.panelView));
window.browser.on('ui:focus-omnibox', focusOmnibox);
window.browser.on('ui:css', ({ id, css }) => {
  const host = $('#injected-css');
  const marker = `/* >>> ${id} */`, end = `/* <<< ${id} */`;
  const re = new RegExp(`${esc(marker)}[\\s\\S]*?${esc(end)}`, 'm');
  const block = css ? `${marker}\n${css}\n${end}` : '';
  host.textContent = re.test(host.textContent) ? host.textContent.replace(re, block) : host.textContent + '\n' + block;
});
window.browser.on('ui:theme', ({ css }) => { $('#theme-css').textContent = css || ''; });
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.activeElement === omni) { omni.blur(); }
});

// ---------------------------------------------------------------- boot
(async () => {
  const init = await window.browser.ready();
  ui.defaultProfile = init.settings.defaultProfile;
  ui.tabs = init.tabs;
  ui.rules = init.rules;
  ui.adblock = init.adblock;
  $('#theme-css').textContent = init.theme.css || '';
  $('#custom-css').textContent = init.theme.custom || '';
  document.documentElement.style.setProperty('--topbar', init.topbar + 'px');
  document.documentElement.style.setProperty('--panel-w', init.panel + 'px');
  renderTabs(); renderActive(); renderRules();
})();
