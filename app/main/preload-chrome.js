'use strict';
// Bridge for the browser's own UI. The chrome runs the same command set Claude does,
// so anything the UI can do, Claude can do, and vice versa.
const { contextBridge, ipcRenderer } = require('electron');

const listeners = new Map();
for (const channel of ['ui:css', 'ui:panel', 'ui:note', 'ui:theme', 'ui:event', 'ui:focus-omnibox']) {
  ipcRenderer.on(channel, (_e, payload) => {
    for (const fn of listeners.get(channel) || []) { try { fn(payload); } catch (e) { console.error(channel, e); } }
  });
}

contextBridge.exposeInMainWorld('browser', {
  async cmd(name, args) {
    const r = await ipcRenderer.invoke('chrome:cmd', { cmd: name, args });
    if (!r.ok) throw new Error(r.error);
    return r.result;
  },
  ready: () => ipcRenderer.invoke('chrome:ready'),
  on(channel, fn) {
    if (!listeners.has(channel)) listeners.set(channel, new Set());
    listeners.get(channel).add(fn);
    return () => listeners.get(channel).delete(fn);
  },
});
