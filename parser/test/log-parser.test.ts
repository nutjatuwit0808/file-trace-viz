import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLog } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const logsDir = join(here, 'fixtures', 'logs');

describe('parseLog', () => {
  it('parses a real hook-produced session file completely', () => {
    const content = readFileSync(
      join(logsDir, 'session-a1b2c3d4-e5f6-7890-abcd-ef1234567890.jsonl'),
      'utf8',
    );
    const { entries, warnings } = parseLog(content, 'dogfood');
    expect(warnings).toEqual([]);
    expect(entries).toHaveLength(14);
    expect(entries[0]).toMatchObject({
      event: 'user_prompt',
      tool: 'claude-code',
      turnId: 1,
      text: 'อธิบาย pipeline ของ PO ให้หน่อย',
    });
    const read = entries.find((e) => e.event === 'read')!;
    expect(read.filePath).toBe(
      'C:\\Users\\User\\OneDrive\\เอกสาร\\vault\\AGENTS.md',
    );
    expect(read.agentId).toBeNull();
  });

  it('survives dirty input: broken lines, unknown schema_version/event, missing fields', () => {
    const content = readFileSync(join(logsDir, 'session-dirty.jsonl'), 'utf8');
    const { entries, warnings } = parseLog(content, 'dirty');
    // 3 valid entries survive: prompt, one good read, response
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.event)).toEqual([
      'user_prompt',
      'read',
      'agent_response',
    ]);
    expect(warnings).toHaveLength(4);
    expect(warnings.some((w) => w.includes('broken JSON'))).toBe(true);
    expect(warnings.some((w) => w.includes('schema_version 99'))).toBe(true);
    expect(warnings.some((w) => w.includes('instructions_loaded'))).toBe(true);
    expect(warnings.some((w) => w.includes('file_path'))).toBe(true);
  });

  it('keeps multiline/Thai/emoji text intact through JSON round-trip', () => {
    const content = readFileSync(join(logsDir, 'session-dirty.jsonl'), 'utf8');
    const { entries } = parseLog(content);
    const prompt = entries.find((e) => e.event === 'user_prompt')!;
    expect(prompt.text).toBe('multiline\nprompt with "quotes" and 🐛');
  });

  it('handles empty content and CRLF line endings', () => {
    expect(parseLog('').entries).toEqual([]);
    const crlf =
      '{"schema_version":1,"ts":"t","session_id":"s","turn_id":1,"tool":"cursor","event":"user_prompt","text":"x"}\r\n';
    const { entries, warnings } = parseLog(crlf);
    expect(entries).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it('rejects invalid turn_id and unknown tool', () => {
    const bad =
      '{"schema_version":1,"ts":"t","session_id":"s","turn_id":0,"tool":"cursor","event":"user_prompt","text":"x"}\n' +
      '{"schema_version":1,"ts":"t","session_id":"s","turn_id":1,"tool":"vscode","event":"user_prompt","text":"x"}';
    const { entries, warnings } = parseLog(bad);
    expect(entries).toEqual([]);
    expect(warnings).toHaveLength(2);
  });
});
