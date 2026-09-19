// Single source of truth for every command the browser understands.
// The app (app/main/handlers.js) implements them; the MCP bridge (tools/mcp/server.js)
// exposes each one as a tool, using these same names, descriptions and schemas.
// Add a command here + a handler there and it is instantly available to Claude.

const { z } = require('zod');

const tabId = z.string().optional().describe('Tab id. Omit for the active tab.');
const target = {
  ref: z.string().optional().describe('Element ref from page_read or find, e.g. "e12".'),
  selector: z.string().optional().describe('CSS selector. Used when ref is not given.'),
};

const commands = [
  // ---------------------------------------------------------------- status
  {
    name: 'status',
    group: 'app',
    description: 'Browser status: version, window, profiles, tab count, active tab, connected clients, loaded rule sets.',
    input: {},
  },
  {
    name: 'window',
    group: 'app',
    description: 'Control the browser window: focus, minimize, maximize, restore, fullscreen, setBounds.',
    input: {
      action: z.enum(['focus', 'minimize', 'maximize', 'restore', 'fullscreen', 'unfullscreen', 'setBounds', 'get']),
      bounds: z.object({ x: z.number().optional(), y: z.number().optional(), width: z.number().optional(), height: z.number().optional() }).optional(),
    },
  },

  // ---------------------------------------------------------------- tabs
  {
    name: 'tabs_list',
    group: 'tabs',
    description: 'List open tabs with id, url, title, profile, loading state and which one is active.',
    input: {},
  },
  {
    name: 'tab_open',
    group: 'tabs',
    description: 'Open a new tab. Returns the tab. Waits for the page to finish loading unless wait is false.',
    input: {
      url: z.string().optional().describe('URL to load. Defaults to the home page.'),
      profile: z.string().optional().describe('Profile (isolated cookie jar) to open it in. Created on first use. Defaults to the settings default profile.'),
      activate: z.boolean().optional().default(true).describe('Bring the tab to the front.'),
      wait: z.boolean().optional().default(true).describe('Wait for load to finish (up to 20 s).'),
    },
  },
  {
    name: 'tab_close',
    group: 'tabs',
    description: 'Close a tab.',
    input: { tabId: z.string().describe('Tab id to close.') },
  },
  {
    name: 'tab_activate',
    group: 'tabs',
    description: 'Bring a tab to the front.',
    input: { tabId: z.string() },
  },
  {
    name: 'navigate',
    group: 'tabs',
    description: 'Load a URL in a tab and wait for it to finish loading. A bare search phrase is sent to the search engine.',
    input: {
      tabId,
      url: z.string().describe('URL, or a search phrase.'),
      wait: z.boolean().optional().default(true),
    },
  },
  {
    name: 'history',
    group: 'tabs',
    description: 'Back, forward, reload or stop in a tab.',
    input: { tabId, action: z.enum(['back', 'forward', 'reload', 'stop']) },
  },
  {
    name: 'wait_for',
    group: 'tabs',
    description: 'Wait until a condition holds: page load finished, a selector exists, text appears, or the URL contains a string. Returns when met or times out.',
    input: {
      tabId,
      load: z.boolean().optional().describe('Wait for the current load to finish.'),
      selector: z.string().optional(),
      text: z.string().optional().describe('Case-insensitive text somewhere in the page.'),
      urlIncludes: z.string().optional(),
      timeoutMs: z.number().optional().default(15000),
    },
  },

  // ---------------------------------------------------------------- reading
  {
    name: 'page_text',
    group: 'read',
    description: 'Readable text of the page (title, url, main text with whitespace collapsed). Cheapest way to read a page.',
    input: {
      tabId,
      selector: z.string().optional().describe('Limit to this element.'),
      maxChars: z.number().optional().default(20000),
    },
  },
  {
    name: 'page_read',
    group: 'read',
    description: 'Structured view of the page: one line per element with a ref you can pass to click, type, hover, scroll. Default filter is interactive elements plus headings; use "all" for text too.',
    input: {
      tabId,
      filter: z.enum(['interactive', 'all']).optional().default('interactive'),
      selector: z.string().optional().describe('Only elements inside this container.'),
      maxItems: z.number().optional().default(300),
    },
  },
  {
    name: 'find',
    group: 'read',
    description: 'Find elements by visible text, label, placeholder, title, alt or aria-label (case-insensitive substring). Returns refs.',
    input: { tabId, query: z.string(), maxItems: z.number().optional().default(20) },
  },
  {
    name: 'screenshot',
    group: 'read',
    description: 'Screenshot of the tab viewport (or a single element). Returns an image scaled to at most maxWidth px wide.',
    input: {
      tabId,
      ...target,
      maxWidth: z.number().optional().default(1280),
      format: z.enum(['png', 'jpeg']).optional().default('jpeg'),
    },
  },
  {
    name: 'eval_js',
    group: 'read',
    description: 'Run JavaScript in the page (main world) and return its JSON-serialisable result. Promises are awaited.',
    input: { tabId, code: z.string() },
  },
  {
    name: 'console_read',
    group: 'read',
    description: 'Recent console messages from a tab.',
    input: {
      tabId,
      level: z.enum(['all', 'error', 'warning', 'info', 'debug']).optional().default('all'),
      pattern: z.string().optional().describe('Regex filter.'),
      limit: z.number().optional().default(100),
      clear: z.boolean().optional().default(false),
    },
  },
  {
    name: 'network_read',
    group: 'read',
    description: 'Recent network requests made by a tab (method, url, status, type). Blocked-by-rules requests are marked.',
    input: {
      tabId,
      pattern: z.string().optional().describe('Regex filter on the URL.'),
      limit: z.number().optional().default(100),
      clear: z.boolean().optional().default(false),
    },
  },

  // ---------------------------------------------------------------- acting
  {
    name: 'click',
    group: 'act',
    description: 'Click an element (by ref or selector) or a viewport coordinate. Scrolls it into view first and sends real mouse events.',
    input: {
      tabId,
      ...target,
      x: z.number().optional(),
      y: z.number().optional(),
      button: z.enum(['left', 'middle', 'right']).optional().default('left'),
      clickCount: z.number().optional().default(1),
      modifiers: z.array(z.enum(['shift', 'control', 'alt', 'meta'])).optional(),
    },
  },
  {
    name: 'hover',
    group: 'act',
    description: 'Move the mouse over an element or coordinate.',
    input: { tabId, ...target, x: z.number().optional(), y: z.number().optional() },
  },
  {
    name: 'type',
    group: 'act',
    description: 'Type text. Focuses the target first if given. clear replaces existing content; submit presses Enter afterwards.',
    input: {
      tabId,
      ...target,
      text: z.string(),
      clear: z.boolean().optional().default(false),
      submit: z.boolean().optional().default(false),
      mode: z.enum(['insert', 'keys']).optional().default('insert').describe('insert = fast paste-like input; keys = one key event per character for sites that need it.'),
    },
  },
  {
    name: 'press_key',
    group: 'act',
    description: 'Press a key, e.g. Enter, Tab, Escape, ArrowDown, a, with optional modifiers.',
    input: {
      tabId,
      key: z.string(),
      modifiers: z.array(z.enum(['shift', 'control', 'alt', 'meta'])).optional(),
      repeat: z.number().optional().default(1),
    },
  },
  {
    name: 'scroll',
    group: 'act',
    description: 'Scroll the page or an element. Use to: top|bottom, or dy/dx in pixels, or scroll a ref into view.',
    input: {
      tabId,
      ...target,
      to: z.enum(['top', 'bottom', 'element']).optional(),
      dx: z.number().optional(),
      dy: z.number().optional(),
    },
  },
  {
    name: 'select_option',
    group: 'act',
    description: 'Choose an option in a <select> by value or visible label.',
    input: { tabId, ...target, value: z.string().optional(), label: z.string().optional() },
  },

  // ---------------------------------------------------------------- browser UI
  {
    name: 'ui_css',
    group: 'ui',
    description: 'Inject or replace a CSS block in the browser chrome (toolbar, tabs, panel). Same id replaces; empty css removes. persist writes it into themes/custom.css so it survives restarts.',
    input: {
      id: z.string().optional().default('claude'),
      css: z.string(),
      persist: z.boolean().optional().default(false),
    },
  },
  {
    name: 'ui_eval',
    group: 'ui',
    description: 'Run JavaScript inside the browser chrome UI (not the page). Full access to the chrome DOM and the window.browser bridge.',
    input: { code: z.string() },
  },
  {
    name: 'ui_reload',
    group: 'ui',
    description: 'Reload the browser chrome UI from disk (after editing app/chrome/*). Tabs are untouched.',
    input: {},
  },
  {
    name: 'ui_panel',
    group: 'ui',
    description: 'Open or close the activity side panel.',
    input: { open: z.boolean() },
  },
  {
    name: 'ui_note',
    group: 'ui',
    description: 'Post a note to Lloyd in the browser activity panel (and as a toast). Use it to explain what you are doing or ask him to take over.',
    input: { text: z.string(), level: z.enum(['info', 'success', 'warning']).optional().default('info') },
  },
  {
    name: 'theme_list',
    group: 'ui',
    description: 'List theme files in themes/ and the active one.',
    input: {},
  },
  {
    name: 'theme_set',
    group: 'ui',
    description: 'Switch the active chrome theme (a file in themes/, without .css).',
    input: { name: z.string() },
  },

  // ---------------------------------------------------------------- rules
  {
    name: 'rules_list',
    group: 'rules',
    description: 'List site rule sets from rules/*.json with match patterns, enabled state and hit counts.',
    input: {},
  },
  {
    name: 'rules_get',
    group: 'rules',
    description: 'Return the full JSON of one rule set.',
    input: { name: z.string() },
  },
  {
    name: 'rules_set',
    group: 'rules',
    description: 'Create or replace a rule set (rules/<name>.json) and apply it immediately. Schema: {enabled, match[], block[], redirect[{from,to}], css, js, options{}}.',
    input: { name: z.string(), rule: z.record(z.any()) },
  },
  {
    name: 'rules_toggle',
    group: 'rules',
    description: 'Enable or disable a rule set.',
    input: { name: z.string(), enabled: z.boolean() },
  },
  {
    name: 'rules_reload',
    group: 'rules',
    description: 'Re-read rules/ from disk and re-apply to open tabs.',
    input: {},
  },

  // ---------------------------------------------------------------- composed pages
  {
    name: 'page_create',
    group: 'pages',
    description: 'Write a composed page to pages/<name>.html and return its URL. Use it to build a page out of other pages (a tutorial beside a manual), a results grid you assembled from several sites, or any tool Lloyd asked for. Composed pages may frame sites that normally refuse to be framed.',
    input: {
      name: z.string().describe('File name without extension, e.g. "print-quote".'),
      html: z.string().describe('Complete HTML document.'),
      open: z.boolean().optional().default(true).describe('Open it in a tab straight away.'),
      profile: z.string().optional(),
    },
  },
  {
    name: 'page_list',
    group: 'pages',
    description: 'List composed pages in pages/ with size and last modified.',
    input: {},
  },
  {
    name: 'page_read_source',
    group: 'pages',
    description: 'Return the HTML source of a composed page, so you can revise it rather than rewrite it.',
    input: { name: z.string() },
  },
  {
    name: 'page_delete',
    group: 'pages',
    description: 'Delete a composed page.',
    input: { name: z.string() },
  },

  // ---------------------------------------------------------------- profiles
  {
    name: 'profiles_list',
    group: 'profiles',
    description: 'List profiles (isolated cookie jars) with open tab counts.',
    input: {},
  },
  {
    name: 'profile_clear',
    group: 'profiles',
    description: 'Wipe cookies, storage and cache for a profile. Irreversible.',
    input: { name: z.string() },
  },
];

module.exports = { commands, byName: Object.fromEntries(commands.map((c) => [c.name, c])) };
