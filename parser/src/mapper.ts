// Mapper: LogEntry[] (one session) + graph nodes → Session with per-turn
// prompt/response/read state. Deterministic — no LLM calls.

import type { GraphData, LogEntry, Session, SessionTurn } from './types';

/**
 * The one path normalizer for the whole project (plan 2.4): Windows `\` → `/`,
 * lowercase because Windows filesystems are case-insensitive — matching must not
 * depend on how the editor happened to case the drive letter or folders.
 */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase();
}

/**
 * Match an absolute (or relative) logged path to a vault node id by suffix:
 * the log has `C:\...\vault\po\file.md`, the node id is `po/file.md`.
 */
export function matchNodeId(
  filePath: string,
  nodeIds: string[],
): string | null {
  const norm = normalizePath(filePath);
  let best: string | null = null;
  for (const id of nodeIds) {
    const nid = normalizePath(id);
    if (norm === nid || norm.endsWith('/' + nid)) {
      // Longest id wins if several node ids are suffixes of the same path
      // (e.g. `notes.md` vs `po/notes.md`).
      if (best === null || nid.length > best.length) best = id;
    }
  }
  return best;
}

export function mapSession(
  entries: LogEntry[],
  graph: GraphData,
  fileName: string,
): Session | null {
  if (entries.length === 0) return null;

  const nodeIds = graph.nodes.map((n) => n.id);
  const byTurn = new Map<number, LogEntry[]>();
  for (const e of entries) {
    const list = byTurn.get(e.turnId) ?? [];
    list.push(e);
    byTurn.set(e.turnId, list);
  }

  const turns: SessionTurn[] = [...byTurn.keys()]
    .sort((a, b) => a - b)
    .map((turnId) => {
      // Stable sort by ts keeps intra-turn order even when timestamps tie (1s precision).
      const turnEntries = [...byTurn.get(turnId)!].sort((a, b) =>
        a.ts.localeCompare(b.ts),
      );
      let prompt: string | null = null;
      let response: string | null = null;
      const read: string[] = [];
      const unmatched: string[] = [];
      const seenReads = new Set<string>();
      for (const e of turnEntries) {
        if (e.event === 'user_prompt' && prompt === null) prompt = e.text;
        // Last response wins: Stop can fire more than once per turn in edge cases.
        if (e.event === 'agent_response') response = e.text;
        if (e.event === 'read') {
          const id = matchNodeId(e.filePath, nodeIds);
          const key = id ?? normalizePath(e.filePath);
          if (seenReads.has(key)) continue; // re-reads within one turn count once:
          // heat semantics = "number of turns that read the file" (changing this needs user sign-off)
          seenReads.add(key);
          if (id !== null) read.push(id);
          else unmatched.push(e.filePath);
        }
      }
      return { turnId, prompt, response, read, unmatched };
    });

  const first = [...entries].sort((a, b) => a.ts.localeCompare(b.ts))[0]!;
  const firstPrompt = turns.find((t) => t.prompt !== null)?.prompt ?? '';

  return {
    meta: {
      sessionId: first.sessionId,
      tool: first.tool,
      startTs: first.ts,
      firstPrompt,
      turnCount: turns.length,
      fileName,
    },
    turns,
  };
}
