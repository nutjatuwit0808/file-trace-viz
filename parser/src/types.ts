// Data shapes shared across the parser core and Phase 4 UI.
// JSON on disk is snake_case (schema/log-entry.schema.json); TS is camelCase —
// the conversion happens once, inside log-parser.ts.

export interface VaultFile {
  /** Path relative to the vault root; separators may still be `\` (normalized by the parser). */
  path: string;
  content: string;
}

export interface VaultNode {
  /** Relative path from vault root, forward slashes — the stable identity everywhere. */
  id: string;
  /** File name without `.md`, what the graph renders. */
  label: string;
  /** First-level folder, `root` for top-level files — layout clustering ONLY, never color. */
  group: string;
}

export interface VaultLink {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: VaultNode[];
  links: VaultLink[];
}

export type Tool = 'cursor' | 'claude-code';

interface LogEntryBase {
  schemaVersion: 1;
  ts: string;
  sessionId: string;
  turnId: number;
  tool: Tool;
}

export interface ReadEntry extends LogEntryBase {
  event: 'read';
  /** Raw as the editor reported it — normalization is the mapper's job. */
  filePath: string;
  /** null = main agent (Claude Code subagents carry an id). */
  agentId: string | null;
  agentType?: string | null;
  /** Cursor's raw generation id, kept for debugging. */
  generationId?: string | null;
}

export interface UserPromptEntry extends LogEntryBase {
  event: 'user_prompt';
  text: string;
}

export interface AgentResponseEntry extends LogEntryBase {
  event: 'agent_response';
  text: string;
}

export type LogEntry = ReadEntry | UserPromptEntry | AgentResponseEntry;

export interface LogFile {
  /** Source file name, e.g. `session-abc.jsonl`. */
  name: string;
  content: string;
}

export interface SessionMeta {
  sessionId: string;
  tool: Tool;
  startTs: string;
  /** Full text of the first prompt — the UI truncates at render time, never in data. */
  firstPrompt: string;
  turnCount: number;
  fileName: string;
}

export interface SessionTurn {
  turnId: number;
  /** null = not captured (interrupt, Cursor limitation, pre-hook session). */
  prompt: string | null;
  response: string | null;
  /** Node ids read this turn — unique within the turn (heat counts "turns that read it"). */
  read: string[];
  /** Raw file paths that could not be mapped into the vault. */
  unmatched: string[];
}

export interface Session {
  meta: SessionMeta;
  turns: SessionTurn[];
}

export interface ParseVaultResult {
  graph: GraphData;
  warnings: string[];
}

export interface ParseSessionsResult {
  sessions: Session[];
  warnings: string[];
}
