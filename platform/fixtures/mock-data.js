// Mock fixture — the prototype's original hardcoded data, kept for manual QA
// (CONVENTIONS.md §8). Load with ?demo=1. AGENTS.md / po-pipeline.md / qa-checklist.md
// are deliberately re-read across turns so the heat scale shows clearly.

const rawNodes = [
  ['po-pipeline.md', 'po'], ['jira-schema.md', 'po'], ['retro-template.md', 'po'],
  ['touchpoints.md', 'po'], ['epic-lead-notes.md', 'po'], ['po-glossary.md', 'po'],
  ['dev-grooming.md', 'dev'], ['dev-impl.md', 'dev'], ['dev-commit.md', 'dev'],
  ['cursor-rules.md', 'dev'], ['router-pattern.md', 'dev'], ['mcp-tools-schema.md', 'dev'],
  ['langgraph-poc.md', 'dev'], ['fraud-review-state.md', 'dev'],
  ['qa-checklist.md', 'qa'], ['e2e-evidence.md', 'qa'], ['qa-triage.md', 'qa'],
  ['evidence-review.md', 'qa'], ['ac-gate.md', 'qa'],
  ['gate-marker-spec.md', 'skill'], ['skill-creator.md', 'skill'],
  ['agentic-ops-tracker.md', 'skill'], ['otel-genai-conv.md', 'skill'],
  ['a2a-protocol.md', 'skill'], ['eval-methodology.md', 'skill'],
  ['AGENTS.md', 'root'], ['obsidian-conventions.md', 'root'],
  ['five-layers-framework.md', 'root'], ['sdlc-graph-flow.md', 'root'],
];

const rawLinks = [
  ['po-pipeline.md', 'jira-schema.md'], ['po-pipeline.md', 'dev-grooming.md'],
  ['po-pipeline.md', 'touchpoints.md'], ['po-pipeline.md', 'retro-template.md'],
  ['epic-lead-notes.md', 'po-pipeline.md'], ['po-glossary.md', 'jira-schema.md'],
  ['dev-grooming.md', 'dev-impl.md'], ['dev-impl.md', 'dev-commit.md'],
  ['dev-impl.md', 'gate-marker-spec.md'], ['dev-impl.md', 'qa-checklist.md'],
  ['cursor-rules.md', 'router-pattern.md'], ['router-pattern.md', 'AGENTS.md'],
  ['dev-impl.md', 'mcp-tools-schema.md'], ['langgraph-poc.md', 'fraud-review-state.md'],
  ['langgraph-poc.md', 'dev-impl.md'],
  ['qa-checklist.md', 'e2e-evidence.md'], ['qa-checklist.md', 'qa-triage.md'],
  ['qa-triage.md', 'evidence-review.md'], ['e2e-evidence.md', 'ac-gate.md'],
  ['ac-gate.md', 'touchpoints.md'],
  ['gate-marker-spec.md', 'skill-creator.md'], ['skill-creator.md', 'eval-methodology.md'],
  ['agentic-ops-tracker.md', 'otel-genai-conv.md'], ['agentic-ops-tracker.md', 'a2a-protocol.md'],
  ['agentic-ops-tracker.md', 'eval-methodology.md'], ['skill-creator.md', 'agentic-ops-tracker.md'],
  ['AGENTS.md', 'po-pipeline.md'], ['AGENTS.md', 'dev-grooming.md'], ['AGENTS.md', 'qa-checklist.md'],
  ['AGENTS.md', 'cursor-rules.md'], ['obsidian-conventions.md', 'AGENTS.md'],
  ['five-layers-framework.md', 'sdlc-graph-flow.md'], ['sdlc-graph-flow.md', 'ac-gate.md'],
  ['five-layers-framework.md', 'AGENTS.md'],
];

export const mockGraph = {
  nodes: rawNodes.map(([id, group]) => ({ id, label: id.replace('.md', ''), group })),
  links: rawLinks.map(([source, target]) => ({ source, target })),
};

const t = (turnId, prompt, response, read) => ({ turnId, prompt, response, read, unmatched: [] });

export const mockSession = {
  meta: {
    sessionId: 'demo-session',
    tool: 'claude-code',
    startTs: '2026-08-12T10:00:00Z',
    firstPrompt: 'อธิบาย pipeline PO',
    turnCount: 8,
    fileName: 'session-demo.jsonl',
  },
  turns: [
    t(1, 'อธิบาย pipeline PO', 'Pipeline เริ่มจาก grooming → jira → touchpoints ครับ', ['po-pipeline.md', 'jira-schema.md', 'AGENTS.md', 'touchpoints.md']),
    t(2, 'สร้าง dev grooming skill', 'สร้าง skill โดยอิง dev-impl และ cursor rules', ['dev-grooming.md', 'dev-impl.md', 'cursor-rules.md', 'AGENTS.md']),
    t(3, 'เช็ค GATE marker spec', 'GATE marker ใช้รูปแบบตาม spec ล่าสุด', ['gate-marker-spec.md', 'skill-creator.md', 'AGENTS.md']),
    t(4, 'ทำ QA checklist', 'เพิ่ม checklist พร้อม ac-gate แล้ว', ['qa-checklist.md', 'ac-gate.md', 'AGENTS.md']),
    t(5, 'เพิ่ม e2e evidence gate', 'ผูก evidence gate เข้ากับ qa-triage แล้ว', ['e2e-evidence.md', 'qa-triage.md', 'evidence-review.md', 'qa-checklist.md']),
    t(6, 'LangGraph fraud POC', 'POC ใช้ fraud-review-state เป็น state หลัก', ['langgraph-poc.md', 'fraud-review-state.md', 'mcp-tools-schema.md', 'AGENTS.md']),
    t(7, 'audit agentic ops tracker', 'Tracker ครอบ a2a + eval methodology แล้ว', ['agentic-ops-tracker.md', 'eval-methodology.md', 'a2a-protocol.md', 'po-pipeline.md']),
    t(8, 'สรุป retro', null, ['retro-template.md', 'po-pipeline.md', 'five-layers-framework.md', 'AGENTS.md']),
  ],
};
