// Log parser: raw .jsonl content → validated LogEntry[].
// Line-by-line and forgiving (plan 2.3): a broken line, unknown schema_version or
// unknown event becomes a warning, never a failed file. Deterministic — no LLM calls.

import type { LogEntry, Tool } from './types';

export interface ParseLogResult {
  entries: LogEntry[];
  warnings: string[];
}

const KNOWN_EVENTS = new Set(['read', 'user_prompt', 'agent_response']);
const KNOWN_TOOLS = new Set<string>(['cursor', 'claude-code']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function optionalString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/** Validate one parsed JSON line against schema v1; returns null + reason on mismatch. */
function toEntry(raw: Record<string, unknown>): {
  entry: LogEntry | null;
  reason?: string;
} {
  if (raw.schema_version !== 1) {
    return {
      entry: null,
      reason: `unknown schema_version ${JSON.stringify(raw.schema_version)}`,
    };
  }
  const event = raw.event;
  if (typeof event !== 'string' || !KNOWN_EVENTS.has(event)) {
    // Forward-compatible: new event types (e.g. instructions_loaded) are skipped, not errors.
    return { entry: null, reason: `unknown event ${JSON.stringify(event)}` };
  }
  if (typeof raw.ts !== 'string' || typeof raw.session_id !== 'string') {
    return { entry: null, reason: 'missing ts/session_id' };
  }
  if (
    typeof raw.turn_id !== 'number' ||
    !Number.isInteger(raw.turn_id) ||
    raw.turn_id < 1
  ) {
    return {
      entry: null,
      reason: `invalid turn_id ${JSON.stringify(raw.turn_id)}`,
    };
  }
  if (typeof raw.tool !== 'string' || !KNOWN_TOOLS.has(raw.tool)) {
    return { entry: null, reason: `unknown tool ${JSON.stringify(raw.tool)}` };
  }
  const base = {
    schemaVersion: 1 as const,
    ts: raw.ts,
    sessionId: raw.session_id,
    turnId: raw.turn_id,
    tool: raw.tool as Tool,
  };
  if (event === 'read') {
    if (typeof raw.file_path !== 'string' || raw.file_path.length === 0) {
      return { entry: null, reason: 'read entry without file_path' };
    }
    return {
      entry: {
        ...base,
        event: 'read',
        filePath: raw.file_path,
        agentId: optionalString(raw.agent_id),
        agentType: optionalString(raw.agent_type),
        generationId: optionalString(raw.generation_id),
      },
    };
  }
  if (typeof raw.text !== 'string') {
    return { entry: null, reason: `${event} entry without text` };
  }
  return {
    entry: {
      ...base,
      event: event as 'user_prompt' | 'agent_response',
      text: raw.text,
    },
  };
}

export function parseLog(
  content: string,
  fileName = '(unknown)',
): ParseLogResult {
  const entries: LogEntry[] = [];
  const warnings: string[] = [];

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.replace(/\r$/, '').trim();
    if (line.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      warnings.push(`${fileName}:${i + 1}: broken JSON line skipped`);
      continue;
    }
    if (!isRecord(parsed)) {
      warnings.push(`${fileName}:${i + 1}: not a JSON object — skipped`);
      continue;
    }
    const { entry, reason } = toEntry(parsed);
    if (entry === null) {
      warnings.push(`${fileName}:${i + 1}: ${reason} — skipped`);
      continue;
    }
    entries.push(entry);
  }

  return { entries, warnings };
}
