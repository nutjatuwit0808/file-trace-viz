// Session panel (Phase 4.3) — floating right panel: session list → one selected
// session's conversation (prompt/response pairs per turn), two-way synced with the
// graph's session bar. All new code; the graph module stays the single source of
// truth for mode/current turn.

import { loadSession, clearSession, setTurn, onTurnChange, currentTurn, getMode } from './graph.js';

let panel, toggleBtn, listEl, convEl, headerEl;
let sessions = [];
let selected = null; // index into sessions

function fmtTs(ts) {
  const d = new Date(ts);
  return isNaN(d) ? ts : d.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
}

function esc(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

export function initPanel() {
  panel = document.getElementById('sessionPanel');
  toggleBtn = document.getElementById('panelToggle');
  listEl = document.getElementById('sessionList');
  convEl = document.getElementById('conversation');
  headerEl = document.getElementById('panelHeader');

  toggleBtn.addEventListener('click', () => {
    panel.classList.toggle('collapsed');
    toggleBtn.textContent = panel.classList.contains('collapsed') ? '◀' : '▶';
  });

  // Session button with nothing selected yet → jump into the most recent session
  // (prototype parity: the mode toggle must always work when session data exists).
  document.getElementById('modeSession').addEventListener('click', () => {
    if (selected === null && sessions.length > 0) {
      panel.classList.remove('collapsed');
      toggleBtn.textContent = '▶';
      selectSession(0);
    }
  });

  // Play/slider → panel: highlight the active turn and keep it in view (core value:
  // "this prompt → the agent read these files").
  onTurnChange((i) => {
    if (selected === null) return;
    convEl.querySelectorAll('.turn-card').forEach((el, j) => el.classList.toggle('active', j === i));
    const active = convEl.querySelector('.turn-card.active');
    if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

export function setSessions(list) {
  sessions = list;
  selected = null;
  clearSession();
  renderList();
}

function renderList() {
  headerEl.innerHTML = `<span>Sessions</span><span class="pill-mini">${sessions.length}</span>`;
  convEl.style.display = 'none';
  listEl.style.display = 'block';
  if (sessions.length === 0) {
    listEl.innerHTML = '<div class="empty-note">ไม่พบ session ใน log folder</div>';
    return;
  }
  listEl.innerHTML = sessions
    .map(
      (s, i) => `
    <button class="session-row" data-i="${i}">
      <div class="session-row-top">
        <span class="badge badge-${s.meta.tool}">${s.meta.tool}</span>
        <span class="session-ts">${esc(fmtTs(s.meta.startTs))}</span>
        <span class="session-turns">${s.meta.turnCount} turns</span>
      </div>
      <div class="session-preview">${esc(s.meta.firstPrompt || '(no prompt captured)')}</div>
    </button>`,
    )
    .join('');
  listEl.querySelectorAll('.session-row').forEach((el) =>
    el.addEventListener('click', () => selectSession(+el.dataset.i)),
  );
}

export function selectSession(i) {
  selected = i;
  const s = sessions[i];
  loadSession(s.turns);
  renderConversation(s);
}

function responseHtml(s, t) {
  if (t.response !== null) return esc(t.response);
  return `<span class="placeholder">${
    s.meta.tool === 'cursor' ? '(not available on Cursor)' : '(no response captured)'
  }</span>`;
}

function renderConversation(s) {
  headerEl.innerHTML = `<button id="backToList" class="back-btn">←</button>
    <span class="badge badge-${s.meta.tool}">${s.meta.tool}</span>
    <span class="session-ts">${esc(fmtTs(s.meta.startTs))}</span>`;
  headerEl.querySelector('#backToList').addEventListener('click', () => {
    selected = null;
    clearSession();
    renderList();
  });

  listEl.style.display = 'none';
  convEl.style.display = 'block';
  convEl.innerHTML = s.turns
    .map((t, i) => {
      const files = t.read.length + (t.unmatched.length ? ` (+${t.unmatched.length} นอก vault)` : '');
      return `
      <div class="turn-card" data-i="${i}">
        <div class="turn-head">Turn ${t.turnId} · อ่าน ${files} ไฟล์</div>
        <div class="msg user"><div class="msg-body clamped">${t.prompt !== null ? esc(t.prompt) : '<span class="placeholder">(no prompt captured)</span>'}</div></div>
        <div class="msg agent"><div class="msg-body clamped">${responseHtml(s, t)}</div></div>
      </div>`;
    })
    .join('');

  // Click a turn → jump the replay there (two-way sync with the session bar).
  convEl.querySelectorAll('.turn-card').forEach((el) =>
    el.addEventListener('click', (e) => {
      if (e.target.closest('.msg-body')) return; // clicking text toggles expand instead
      if (getMode() === 'session') setTurn(+el.dataset.i);
    }),
  );
  // Full text is stored; the panel only clamps at render time — click to expand.
  convEl.querySelectorAll('.msg-body').forEach((el) =>
    el.addEventListener('click', () => el.classList.toggle('clamped')),
  );

  const i = currentTurn();
  const active = convEl.querySelector(`.turn-card[data-i="${i}"]`);
  if (active) active.classList.add('active');
}
