#!/usr/bin/env node
'use strict';
// Generates docs/project/02-COMMANDS.md from shared/commands.js, so the reference
// cannot drift from the commands the browser actually has. Run: npm run docs

const fs = require('fs');
const path = require('path');
const { commands } = require('../shared/commands.js');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'project', '03-COMMANDS.md');

// Walk a zod schema down to something printable.
function describe(schema) {
  let s = schema;
  let optional = false;
  let dflt;
  for (let i = 0; i < 8; i++) {
    const t = s?._def?.typeName;
    if (t === 'ZodOptional') { optional = true; s = s._def.innerType; continue; }
    if (t === 'ZodDefault') {
      optional = true;
      try { dflt = s._def.defaultValue(); } catch (_) {}
      s = s._def.innerType; continue;
    }
    break;
  }
  const t = s?._def?.typeName;
  let type = 'any';
  if (t === 'ZodString') type = 'string';
  else if (t === 'ZodNumber') type = 'number';
  else if (t === 'ZodBoolean') type = 'boolean';
  else if (t === 'ZodEnum') type = s._def.values.map((v) => `"${v}"`).join(' | ');
  else if (t === 'ZodArray') type = `${describe(s._def.type).type}[]`;
  else if (t === 'ZodRecord') type = 'object';
  else if (t === 'ZodObject') type = 'object';
  return { type, optional, dflt, description: schema?.description || s?.description || '' };
}

const GROUP_TITLES = {
  app: 'Browser itself',
  tabs: 'Tabs and navigation',
  read: 'Reading a page',
  act: 'Acting on a page',
  ui: 'The browser interface',
  rules: 'Site rules',
  adblock: 'Ad and tracker blocking',
  pages: 'Composed pages',
  profiles: 'Profiles',
};

const groups = new Map();
for (const c of commands) {
  if (!groups.has(c.group)) groups.set(c.group, []);
  groups.get(c.group).push(c);
}

let md = `# Command reference

Every command the browser understands. Each is exposed as an MCP tool named
\`mcp__remote-devices__mondrian__<name>\` once the server is registered, and the browser's
own interface calls the identical set.

**Generated from \`shared/commands.js\` by \`npm run docs\`. Do not edit by hand.**
${commands.length} commands, ${groups.size} groups.

`;

for (const [group, list] of groups) {
  md += `\n## ${GROUP_TITLES[group] || group}\n`;
  for (const c of list) {
    md += `\n### \`${c.name}\`\n\n${c.description}\n\n`;
    const keys = Object.keys(c.input || {});
    if (!keys.length) { md += `No arguments.\n`; continue; }
    md += `| argument | type | required | notes |\n|---|---|---|---|\n`;
    for (const k of keys) {
      const d = describe(c.input[k]);
      const req = d.optional ? '' : 'yes';
      const dflt = d.dflt !== undefined ? ` Default \`${JSON.stringify(d.dflt)}\`.` : '';
      const note = (d.description || '').replace(/\|/g, '\\|');
      md += `| \`${k}\` | ${d.type.replace(/\|/g, '\\|')} | ${req} | ${note}${dflt} |\n`;
    }
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, md);
console.log(`wrote ${path.relative(ROOT, OUT)} — ${commands.length} commands`);
