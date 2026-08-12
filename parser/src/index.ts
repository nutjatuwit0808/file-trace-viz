// Public API (plan 2.5). Everything below is pure — Phase 4 bundles this straight
// into the browser with esbuild; Node-side I/O lives only in io-node.ts.

import { parseLog } from './log-parser';
import { mapSession } from './mapper';
import type {
  LogFile,
  GraphData,
  ParseSessionsResult,
  ParseVaultResult,
  Session,
} from './types';

export { parseVault } from './vault-parser';
export { parseLog } from './log-parser';
export { mapSession, matchNodeId, normalizePath } from './mapper';
export type * from './types';

export function parseSessions(
  logFiles: LogFile[],
  graph: GraphData,
): ParseSessionsResult {
  const sessions: Session[] = [];
  const warnings: string[] = [];

  for (const file of logFiles) {
    const { entries, warnings: logWarnings } = parseLog(
      file.content,
      file.name,
    );
    warnings.push(...logWarnings);
    const session = mapSession(entries, graph, file.name);
    if (session === null) {
      warnings.push(`${file.name}: no usable entries — session skipped`);
      continue;
    }
    sessions.push(session);
  }

  // Newest first, ready for the session panel list (plan 2.5).
  sessions.sort((a, b) => b.meta.startTs.localeCompare(a.meta.startTs));
  return { sessions, warnings };
}

export type { ParseVaultResult };
