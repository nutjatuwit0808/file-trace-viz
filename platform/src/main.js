// Entry point: wires empty state → data loading → graph + session panel.

import { initGraph, clearSearchAndFocus } from './graph.js';
import { initPanel, setSessions } from './session-panel.js';
import * as loader from './data-loader.js';

const emptyState = document.getElementById('emptyState');
const pickVaultBtn = document.getElementById('pickVault');
const pickLogsBtn = document.getElementById('pickLogs');
const startBtn = document.getElementById('startBtn');
const reloadBtn = document.getElementById('reloadBtn');
const warningsPill = document.getElementById('warningsPill');
const warningsList = document.getElementById('warningsList');

let picked = { vault: false, logs: false };

function showWarnings(warnings) {
  if (warnings.length === 0) {
    warningsPill.style.display = 'none';
    return;
  }
  warningsPill.style.display = 'inline-block';
  warningsPill.textContent = `⚠ ${warnings.length}`;
  warningsList.innerHTML =
    `<div class="warnings-title">Parser warnings (${warnings.length})</div>` +
    warnings.map((w) => `<div class="warning-row"></div>`).join('');
  // textContent per row — warnings contain user file names, never inject as HTML
  warningsList.querySelectorAll('.warning-row').forEach((el, i) => (el.textContent = warnings[i]));
}

async function loadAndRender() {
  const { graph, sessions, warnings } = await loader.loadAll();
  if (graph.nodes.length === 0) warnings.unshift('vault ว่าง — ไม่พบไฟล์ .md ใน folder ที่เลือก');
  clearSearchAndFocus();
  initGraph(graph);
  setSessions(sessions);
  showWarnings(warnings);
  emptyState.style.display = 'none';
  reloadBtn.style.display = 'inline-block';
}

async function startDemo() {
  const { mockGraph, mockSession } = await import('../fixtures/mock-data.js');
  clearSearchAndFocus();
  initGraph(mockGraph);
  setSessions([mockSession]);
  showWarnings([]);
  emptyState.style.display = 'none';
}

function updateStartButton() {
  startBtn.disabled = !(picked.vault && picked.logs);
}

function init() {
  initPanel();

  warningsPill.addEventListener('click', () => {
    warningsList.style.display = warningsList.style.display === 'block' ? 'none' : 'block';
  });

  if (new URLSearchParams(location.search).get('demo') === '1') {
    startDemo();
    return;
  }

  if (!loader.isSupported()) {
    document.getElementById('unsupported').style.display = 'block';
    document.getElementById('pickers').style.display = 'none';
    return;
  }

  pickVaultBtn.addEventListener('click', async () => {
    try {
      const name = await loader.pickVault();
      picked.vault = true;
      pickVaultBtn.textContent = `✓ vault: ${name}`;
      updateStartButton();
    } catch { /* user cancelled the picker — nothing to do */ }
  });
  pickLogsBtn.addEventListener('click', async () => {
    try {
      const name = await loader.pickLogs();
      picked.logs = true;
      pickLogsBtn.textContent = `✓ logs: ${name}`;
      updateStartButton();
    } catch { /* user cancelled the picker — nothing to do */ }
  });
  startBtn.addEventListener('click', () => loadAndRender().catch(showError));
  reloadBtn.addEventListener('click', () => loadAndRender().catch(showError));
}

function showError(err) {
  const el = document.getElementById('loadError');
  el.style.display = 'block';
  el.textContent = 'โหลดข้อมูลไม่สำเร็จ: ' + (err && err.message ? err.message : err);
}

init();
