// Node-side I/O adapter — the ONLY module allowed to touch the filesystem (plan 2.2).
// Used by tests and any future CLI; the browser reads via File System Access API instead.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { LogFile, VaultFile } from './types';

export function readVaultDir(root: string): VaultFile[] {
  const files: VaultFile[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.md$/i.test(entry.name)) {
        files.push({
          path: relative(root, full),
          content: readFileSync(full, 'utf8'),
        });
      }
    }
  };
  walk(root);
  return files;
}

export function readLogDir(dir: string): LogFile[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.jsonl$/i.test(e.name))
    .map((e) => ({
      name: e.name,
      content: readFileSync(join(dir, e.name), 'utf8'),
    }));
}
