import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  matchNodeId,
  normalizePath,
  parseSessions,
  parseVault,
} from '../src/index';
import { readLogDir, readVaultDir } from '../src/io-node';

const here = dirname(fileURLToPath(import.meta.url));
const vault = () =>
  parseVault(readVaultDir(join(here, 'fixtures', 'sample-vault'))).graph;
const logs = () => readLogDir(join(here, 'fixtures', 'logs'));

describe('normalizePath / matchNodeId', () => {
  it('normalizes Windows separators and case', () => {
    expect(normalizePath('C:\\Vault\\PO\\File.md')).toBe('c:/vault/po/file.md');
  });

  it('matches absolute OneDrive Thai paths to vault-relative node ids', () => {
    const ids = ['po/po-pipeline.md', 'AGENTS.md'];
    expect(
      matchNodeId(
        'C:\\Users\\User\\OneDrive\\เอกสาร\\vault\\po\\po-pipeline.md',
        ids,
      ),
    ).toBe('po/po-pipeline.md');
    expect(matchNodeId('/mnt/c/vault/AGENTS.md', ids)).toBe('AGENTS.md');
  });

  it('prefers the longest (most specific) suffix on collision', () => {
    const ids = ['notes.md', 'dev/notes.md'];
    expect(matchNodeId('C:\\vault\\dev\\notes.md', ids)).toBe('dev/notes.md');
    expect(matchNodeId('C:\\vault\\notes.md', ids)).toBe('notes.md');
  });

  it('returns null for paths outside the vault', () => {
    expect(matchNodeId('C:\\elsewhere\\other.md', ['AGENTS.md'])).toBeNull();
  });
});

describe('parseSessions (integration with dogfood fixture)', () => {
  it('builds sessions newest-first with metadata', () => {
    const { sessions } = parseSessions(logs(), vault());
    expect(sessions).toHaveLength(3);
    const ts = sessions.map((s) => s.meta.startTs);
    expect([...ts].sort().reverse()).toEqual(ts);
    const dogfood = sessions.find(
      (s) => s.meta.tool === 'claude-code' && s.meta.turnCount === 3,
    )!;
    expect(dogfood.meta.sessionId).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(dogfood.meta.firstPrompt).toBe('อธิบาย pipeline ของ PO ให้หน่อย');
    expect(dogfood.meta.fileName).toMatch(/^session-.*\.jsonl$/);
  });

  it('maps reads to node ids per turn, repeated across turns (heat semantics)', () => {
    const { sessions } = parseSessions(logs(), vault());
    const dogfood = sessions.find((s) => s.meta.turnCount === 3)!;
    const [t1, t2, t3] = dogfood.turns;
    expect(t1!.read).toEqual([
      'AGENTS.md',
      'po/po-pipeline.md',
      'po/jira-schema.md',
    ]);
    // AGENTS.md read in turns 1, 2 and 3 → appears once per turn, three turns total
    expect(t2!.read).toContain('AGENTS.md');
    expect(t3!.read).toContain('AGENTS.md');
    const turnsReadingAgents = dogfood.turns.filter((t) =>
      t.read.includes('AGENTS.md'),
    ).length;
    expect(turnsReadingAgents).toBe(3);
  });

  it('collects out-of-vault paths into unmatched without failing', () => {
    const { sessions } = parseSessions(logs(), vault());
    const dogfood = sessions.find((s) => s.meta.turnCount === 3)!;
    expect(dogfood.turns[1]!.unmatched).toEqual([
      'C:\\Users\\User\\somewhere-else\\outside-vault.md',
    ]);
  });

  it('turn without response stays null (interrupt case)', () => {
    const { sessions } = parseSessions(logs(), vault());
    const dogfood = sessions.find((s) => s.meta.turnCount === 3)!;
    expect(dogfood.turns[0]!.response).toContain('PO pipeline');
    expect(dogfood.turns[2]!.prompt).toBe('สรุปทั้งหมดเป็น checklist');
    expect(dogfood.turns[2]!.response).toBeNull();
  });

  it('cursor session has prompts and reads but no responses', () => {
    const { sessions } = parseSessions(logs(), vault());
    const cursor = sessions.find((s) => s.meta.tool === 'cursor')!;
    expect(cursor.turns).toHaveLength(2);
    expect(cursor.turns.every((t) => t.response === null)).toBe(true);
    expect(cursor.turns[0]!.read).toEqual(['po/po-pipeline.md', 'AGENTS.md']);
  });

  it('propagates log warnings and skips empty files without crashing', () => {
    const { sessions, warnings } = parseSessions(
      [...logs(), { name: 'session-empty.jsonl', content: '' }],
      vault(),
    );
    expect(sessions).toHaveLength(3);
    expect(warnings.some((w) => w.includes('session-empty.jsonl'))).toBe(true);
    expect(warnings.some((w) => w.includes('session-dirty.jsonl'))).toBe(true);
  });

  it('dedupes re-reads within a single turn', () => {
    const graph = vault();
    const entry = (turnId: number, filePath: string, ts: string) =>
      `{"schema_version":1,"ts":"${ts}","session_id":"s","turn_id":${turnId},"tool":"claude-code","event":"read","file_path":"${filePath}","agent_id":null}`;
    const content = [
      entry(1, 'C:/vault/AGENTS.md', '2026-01-01T00:00:00Z'),
      entry(1, 'C:/vault/AGENTS.md', '2026-01-01T00:00:01Z'),
    ].join('\n');
    const { sessions } = parseSessions(
      [{ name: 'session-x.jsonl', content }],
      graph,
    );
    expect(sessions[0]!.turns[0]!.read).toEqual(['AGENTS.md']);
  });
});
