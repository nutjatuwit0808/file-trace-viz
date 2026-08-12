// Data loading via File System Access API (Phase 4.2) — Chrome/Edge only, which the
// project already requires for CSS @property. Handles are kept so "reload" can re-read
// new session files without picking folders again.

import { parseVault, parseSessions } from '../../parser/src/index.ts';

let vaultHandle = null;
let logHandle = null;

export function isSupported() {
  return typeof window.showDirectoryPicker === 'function';
}

export function hasHandles() {
  return vaultHandle !== null && logHandle !== null;
}

async function walkMdFiles(dirHandle, prefix, out) {
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'directory') {
      // Obsidian's own metadata never belongs in the graph.
      if (entry.name === '.obsidian' || entry.name === '.git') continue;
      await walkMdFiles(entry, prefix + entry.name + '/', out);
    } else if (/\.md$/i.test(entry.name)) {
      const file = await entry.getFile();
      out.push({ path: prefix + entry.name, content: await file.text() });
    }
  }
}

async function readLogFiles(dirHandle) {
  const out = [];
  for await (const entry of dirHandle.values()) {
    // Any .jsonl counts, not just session-* — users rename files (plan 4.2).
    if (entry.kind === 'file' && /\.jsonl$/i.test(entry.name)) {
      const file = await entry.getFile();
      out.push({ name: entry.name, content: await file.text() });
    }
  }
  return out;
}

export async function pickVault() {
  vaultHandle = await window.showDirectoryPicker({ id: 'ftv-vault' });
  return vaultHandle.name;
}

export async function pickLogs() {
  logHandle = await window.showDirectoryPicker({ id: 'ftv-logs' });
  return logHandle.name;
}

/** Re-reads both folders from the stored handles and parses everything. */
export async function loadAll() {
  if (!hasHandles()) throw new Error('folders not picked yet');
  const vaultFiles = [];
  await walkMdFiles(vaultHandle, '', vaultFiles);
  const { graph, warnings: vaultWarnings } = parseVault(vaultFiles);
  const logFiles = await readLogFiles(logHandle);
  const { sessions, warnings: logWarnings } = parseSessions(logFiles, graph);
  return { graph, sessions, warnings: [...vaultWarnings, ...logWarnings] };
}
