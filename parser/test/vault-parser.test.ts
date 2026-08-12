import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseVault } from '../src/index';
import { readVaultDir } from '../src/io-node';

const here = dirname(fileURLToPath(import.meta.url));
const vaultDir = join(here, 'fixtures', 'sample-vault');

function load() {
  return parseVault(readVaultDir(vaultDir));
}

function hasLink(
  links: { source: string; target: string }[],
  source: string,
  target: string,
) {
  return links.some((l) => l.source === source && l.target === target);
}

describe('parseVault', () => {
  it('creates one node per md file with id/label/group', () => {
    const { graph } = load();
    expect(graph.nodes).toHaveLength(7);
    const agents = graph.nodes.find((n) => n.id === 'AGENTS.md')!;
    expect(agents.label).toBe('AGENTS');
    expect(agents.group).toBe('root');
    const pipeline = graph.nodes.find((n) => n.id === 'po/po-pipeline.md')!;
    expect(pipeline.label).toBe('po-pipeline');
    expect(pipeline.group).toBe('po');
  });

  it('resolves plain, alias, heading and full-path wikilinks', () => {
    const { graph } = load();
    expect(hasLink(graph.links, 'AGENTS.md', 'po/po-pipeline.md')).toBe(true); // plain
    expect(hasLink(graph.links, 'po/po-pipeline.md', 'dev/dev-impl.md')).toBe(
      true,
    ); // alias
    expect(hasLink(graph.links, 'AGENTS.md', 'qa/qa-checklist.md')).toBe(true); // heading
    expect(hasLink(graph.links, 'dev/dev-impl.md', 'po/po-pipeline.md')).toBe(
      true,
    ); // full path
  });

  it('picks up frontmatter references (scalar and list)', () => {
    const { graph } = load();
    expect(hasLink(graph.links, 'po/po-pipeline.md', 'po/jira-schema.md')).toBe(
      true,
    );
    expect(
      hasLink(graph.links, 'po/po-pipeline.md', 'qa/qa-checklist.md'),
    ).toBe(true);
    expect(hasLink(graph.links, 'po/po-pipeline.md', 'AGENTS.md')).toBe(true);
  });

  it('ignores wikilinks inside code blocks and inline code', () => {
    const { graph } = load();
    expect(hasLink(graph.links, 'AGENTS.md', 'po/jira-schema.md')).toBe(false);
  });

  it('skips broken links with a warning, no ghost nodes', () => {
    const { graph, warnings } = load();
    expect(graph.nodes.some((n) => n.id.includes('does-not-exist'))).toBe(
      false,
    );
    expect(warnings.some((w) => w.includes('does-not-exist'))).toBe(true);
  });

  it('resolves duplicate basenames to shortest path with a warning', () => {
    const { graph, warnings } = load();
    expect(hasLink(graph.links, 'AGENTS.md', 'notes.md')).toBe(true);
    expect(hasLink(graph.links, 'AGENTS.md', 'dev/notes.md')).toBe(false);
    expect(warnings.some((w) => w.includes('ambiguous'))).toBe(true);
  });

  it('never creates self-links or duplicate edges', () => {
    const { graph } = load();
    expect(graph.links.some((l) => l.source === l.target)).toBe(false);
    const keys = graph.links.map((l) => `${l.source}->${l.target}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('normalizes Windows backslash paths in input', () => {
    const { graph } = parseVault([
      { path: 'po\\deep\\file.md', content: 'x' },
      { path: 'top.md', content: '[[file]]' },
    ]);
    expect(graph.nodes.map((n) => n.id)).toContain('po/deep/file.md');
    expect(hasLink(graph.links, 'top.md', 'po/deep/file.md')).toBe(true);
  });
});
