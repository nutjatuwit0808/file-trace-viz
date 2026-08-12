// Graph render layer — ported from obsidian-style-graph-view-v3.html with the data
// layer extracted (Phase 4.1). Physics values, the single heat-scale color system and
// the 3-layer node structure are frozen decisions (CLAUDE.md §5) — do not tune them
// here without asking the user first.

import * as d3 from 'd3';

export const HEAT_GRAY = '#454b58'; // never read / Normal mode
export const HEAT_RED = '#ff2d40'; // read most often (deep red)
export const HEAT_CAP = 4; // reads to reach full red — never darker beyond this
const heatScale = d3.interpolateRgb(HEAT_GRAY, HEAT_RED);

const state = {
  nodes: [],
  links: [],
  turns: [],
  degree: {},
  mode: 'vault',
  sim: null,
  focusedId: null,
  playing: false,
  playTimer: null,
  entranceDone: true,
  onTurnChange: [],
  W: window.innerWidth,
  H: window.innerHeight,
};

let svg, defs, g, zoom, linkSel, nodeSel, tooltip;
let slider, turnLabel, sessionbar, playBtn, btnVault, btnSession, legendBox, settingsTitle, countPill;

function shade(hex, amt) {
  return d3.color(hex).darker(amt).formatHex();
}
function midEdge(hex) {
  return { mid: hex, edge: shade(hex, 1.0) };
}

// Cumulative read count for a node up to and including turn index i.
function readCountUpTo(id, i) {
  let c = 0;
  for (let t = 0; t <= i; t++) if (state.turns[t].read.includes(id)) c++;
  return c;
}
function heatColorFor(count) {
  const t = Math.min(1, count / HEAT_CAP) ** 0.6; // easing: first read is already clearly visible
  return heatScale(t);
}

// Radius grows with sqrt(degree), not degree itself (changed 2026-08-12, user-approved
// after dogfooding a real dense vault — 23 files/97 links, avg degree 8.4 — where the
// original linear formula produced ~35px hub nodes that packed edge-to-edge with fixed
// charge(-260)/link-distance(78), reading as overlap even though collide fully resolved
// it; more warm-start ticks did not help, confirmed by benchmark up to 20k ticks).
// RADIUS_SCALE is calibrated so a node at the *average* degree of the original demo
// vault (~2.34) renders at roughly its old size — typical files look about the same,
// only high-degree hub nodes shrink (a 7-degree demo hub: 20.7px → 14.5px; a 14-degree
// real hub: 35.4px → 18px).
const RADIUS_BASE = 6;
const RADIUS_SCALE = 3.21;
function rOf(d) {
  return RADIUS_BASE + RADIUS_SCALE * Math.sqrt(state.degree[d.id]);
}

function renderVaultLegend() {
  settingsTitle.textContent = 'Normal mode';
  legendBox.innerHTML = `<div class="group-row"><span class="swatch" style="background:${HEAT_GRAY}"></span><span>ไฟล์ทั้งหมด (เทา)</span></div>`;
}
function renderSessionLegend() {
  settingsTitle.textContent = 'ความถี่การอ่าน';
  legendBox.innerHTML = `
   <div class="heat-bar" style="background:linear-gradient(to right, ${HEAT_GRAY}, ${HEAT_RED})"></div>
   <div class="heat-labels"><span>ไม่เคยอ่าน</span><span>อ่านบ่อย</span></div>`;
}

/**
 * Cluster centers for arbitrary folder groups: `root` stays at canvas center like
 * the prototype; other groups spread on an ellipse around it (the prototype's four
 * hardcoded corners, generalized to any group count).
 */
function clusterCentersFor(groups) {
  const { W, H } = state;
  const centers = { root: { x: W * 0.5, y: H * 0.5 } };
  const others = groups.filter((gr) => gr !== 'root');
  others.forEach((gr, i) => {
    const a = (i / others.length) * 2 * Math.PI - Math.PI * 0.75; // start top-left like the prototype
    centers[gr] = { x: W * (0.5 + 0.24 * Math.cos(a)), y: H * (0.5 + 0.22 * Math.sin(a)) };
  });
  return centers;
}

export function onTurnChange(fn) {
  state.onTurnChange.push(fn);
}

export function initGraph(graphData) {
  // Deep-copy: d3-force mutates node objects and rewrites link endpoints to object refs.
  state.nodes = graphData.nodes.map((n) => ({ ...n }));
  state.links = graphData.links.map((l) => ({ ...l }));

  if (!svg) bindDom();
  stopPlay();
  state.focusedId = null;

  // Rebuild = new node set: old per-node gradients must go, or defs leaks a gradient
  // per node per reload (Phase 4.1 warning).
  defs.selectAll('radialGradient.nodeGrad').remove();
  if (state.sim) state.sim.stop();
  g.selectAll('*').remove();

  const { nodes, links } = state;
  countPill.textContent = nodes.length + ' files · ' + links.length + ' links';

  state.degree = {};
  nodes.forEach((n) => (state.degree[n.id] = 0));
  links.forEach((l) => {
    state.degree[l.source]++;
    state.degree[l.target]++;
  });

  state.W = window.innerWidth;
  state.H = window.innerHeight;
  const groups = [...new Set(nodes.map((n) => n.group))];
  const centers = clusterCentersFor(groups);

  // Repulsion and link-distance scale with graph density (changed 2026-08-12,
  // user-approved after dogfooding a hub-heavy real vault — 23 files/97 links,
  // avg degree 8.4 — where a fixed charge/distance left the tightest linked pairs
  // only ~6px apart: raising charge alone barely helped because those pairs are
  // pulled together by the link force's OWN distance target, not just crowded by
  // neighbors. Both must scale together. Calibrated at avgDegree=1 (isolated/tree-
  // like files) to equal the original constants exactly, so sparse vaults are
  // barely affected (demo vault avg degree 2.34: charge -260→-312, distance 78→84).
  const avgDegree = nodes.length > 0 ? (2 * links.length) / nodes.length : 1;
  const chargeStrength = -260 * (1 + 0.15 * (avgDegree - 1));
  const linkDistance = 78 * (1 + 0.06 * (avgDegree - 1));

  const sim = d3
    .forceSimulation(nodes)
    .force('link', d3.forceLink(links).id((d) => d.id).distance(linkDistance).strength(0.5))
    .force('charge', d3.forceManyBody().strength(chargeStrength))
    .force('collide', d3.forceCollide((d) => rOf(d) + 3))
    .force('x', d3.forceX((d) => (centers[d.group] ?? centers.root).x).strength(0.06))
    .force('y', d3.forceY((d) => (centers[d.group] ?? centers.root).y).strength(0.06))
    .alphaDecay(0.02)
    .velocityDecay(0.45);
  state.sim = sim;

  // Warm-start: settle layout silently so the first paint doesn't "explode".
  sim.stop();
  for (let i = 0; i < 180; i++) sim.tick();

  // Per-node gradient, one each — sharing one gradient recolors every node at once
  // (bug found the hard way, CLAUDE.md §5). Ids are index-based: node ids may contain
  // Thai characters that would all collapse to `_` in a sanitized string.
  const nodeGrad = defs
    .selectAll('radialGradient.nodeGrad')
    .data(nodes)
    .join('radialGradient')
    .attr('class', 'nodeGrad')
    .attr('id', (d, i) => 'grad-' + i)
    .attr('cx', '35%')
    .attr('cy', '28%')
    .attr('r', '75%');
  nodeGrad.append('stop').attr('offset', '0%').attr('stop-color', '#ffffff').attr('stop-opacity', 0.95);
  nodeGrad
    .append('stop')
    .attr('class', 'glass-mid')
    .attr('offset', '55%')
    .attr('style', 'stop-color:var(--nc-mid); transition: stop-color .6s ease;');
  nodeGrad
    .append('stop')
    .attr('class', 'glass-edge')
    .attr('offset', '100%')
    .attr('style', 'stop-color:var(--nc-edge); transition: stop-color .6s ease;');

  linkSel = g
    .append('g')
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('class', 'link')
    .attr('stroke-width', 1)
    .attr('x1', (d) => d.source.x)
    .attr('y1', (d) => d.source.y)
    .attr('x2', (d) => d.target.x)
    .attr('y2', (d) => d.target.y)
    .attr('opacity', 0);

  nodeSel = g
    .append('g')
    .selectAll('g.node')
    .data(nodes)
    .join('g')
    .attr('class', 'node')
    .attr('transform', (d) => `translate(${d.x},${d.y})`)
    .call(
      d3
        .drag()
        .on('start', (e, d) => {
          if (!e.active) sim.alphaTarget(0.25).restart();
          d.fx = d.x;
          d.fy = d.y;
          // Entrance animation may still be running — a stale dasharray breaks the
          // line when its length changes mid-drag (known bug, CLAUDE.md §5).
          linkSel.attr('stroke-dasharray', null).attr('stroke-dashoffset', null);
        })
        .on('drag', (e, d) => {
          d.fx = e.x;
          d.fy = e.y;
        })
        .on('end', (e, d) => {
          if (!e.active) sim.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }),
    );

  nodeSel
    .append('circle')
    .attr('class', 'rim')
    .attr('r', (d) => rOf(d))
    .attr('fill', (d, i) => 'url(#grad-' + i + ')')
    .attr('filter', 'url(#glassShadow)')
    .attr('stroke', 'rgba(255,255,255,0.25)')
    .attr('stroke-width', 0.8)
    .attr('opacity', 0);

  nodeSel
    .append('ellipse')
    .attr('cx', (d) => -rOf(d) * 0.32)
    .attr('cy', (d) => -rOf(d) * 0.35)
    .attr('rx', (d) => rOf(d) * 0.32)
    .attr('ry', (d) => rOf(d) * 0.2)
    .attr('fill', 'white')
    .attr('opacity', 0)
    .style('pointer-events', 'none');

  nodeSel
    .append('text')
    .attr('dy', (d) => rOf(d) + 11)
    .text((d) => d.label ?? d.id.replace('.md', ''));
  nodeSel.classed('show-label', (d) => state.degree[d.id] >= 3);

  // Entrance draw-in owns the links until it finishes: any other link transition
  // started meanwhile would interrupt it, `end` would never fire and the dasharray
  // would stay — the exact "broken lines on drag" bug from the prototype days.
  // applyLinkColors() is therefore gated on entranceDone (see below).
  state.entranceDone = false;
  linkSel
    .style('--lk-color', 'rgba(255,255,255,0.13)')
    .each(function (d) {
      const len = Math.hypot(d.target.x - d.source.x, d.target.y - d.source.y);
      d3.select(this).attr('stroke-dasharray', len).attr('stroke-dashoffset', len);
    })
    .transition()
    .delay((d, i) => i * 22)
    .duration(650)
    .ease(d3.easeCubicOut)
    .attr('stroke-dashoffset', 0)
    .attr('opacity', 1)
    .style('--lk-color', '#8f7dff')
    .end()
    // finished or interrupted (drag during entrance): either way, clear the
    // draw-in dasharray and hand link colors back to the mode logic.
    .catch(() => {})
    .then(() => {
      state.entranceDone = true;
      linkSel.attr('stroke-dasharray', null).attr('stroke-dashoffset', null).attr('opacity', 1);
      applyLinkColors();
    });

  nodeSel
    .select('circle.rim')
    .attr('r', 0)
    .transition()
    .delay((d, i) => 250 + i * 18)
    .duration(500)
    .ease(d3.easeBackOut.overshoot(1.4))
    .attr('opacity', 1)
    .attr('r', (d) => rOf(d));
  nodeSel
    .select('ellipse')
    .transition()
    .delay((d, i) => 400 + i * 18)
    .duration(500)
    .attr('opacity', 0.55);

  refreshColors();

  nodeSel
    .on('mouseenter', (e, d) => {
      highlightNeighborhood(d.id);
      tooltip
        .style('display', 'block')
        .text(d.id + '  ·  ' + state.degree[d.id] + ' links  ·  ' + (d.group === 'root' ? 'root' : d.group + '/'));
    })
    .on('mousemove', (e) => {
      tooltip.style('left', e.pageX + 14 + 'px').style('top', e.pageY + 10 + 'px');
    })
    .on('mouseleave', () => {
      if (!state.focusedId) clearHighlight();
      tooltip.style('display', 'none');
    })
    .on('dblclick', (e, d) => {
      state.focusedId = state.focusedId === d.id ? null : d.id;
      if (state.focusedId) {
        highlightNeighborhood(state.focusedId);
        panTo(d);
      } else clearHighlight();
    });

  sim.on('tick', () => {
    linkSel
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x)
      .attr('y2', (d) => d.target.y);
    nodeSel.attr('transform', (d) => `translate(${d.x},${d.y})`);
  });

  setMode('vault');
}

function bindDom() {
  svg = d3.select('svg');
  defs = svg.append('defs');
  const filt = defs
    .append('filter')
    .attr('id', 'glassShadow')
    .attr('x', '-60%')
    .attr('y', '-60%')
    .attr('width', '220%')
    .attr('height', '220%');
  filt
    .append('feDropShadow')
    .attr('dx', 0)
    .attr('dy', 1.5)
    .attr('stdDeviation', 1.8)
    .attr('flood-color', '#000')
    .attr('flood-opacity', 0.55);

  g = svg.append('g');
  zoom = d3.zoom().scaleExtent([0.2, 5]).on('zoom', (e) => g.attr('transform', e.transform));
  svg.call(zoom);

  tooltip = d3.select('#tooltip');
  slider = document.getElementById('turnSlider');
  turnLabel = document.getElementById('turnLabel');
  sessionbar = document.getElementById('sessionbar');
  playBtn = document.getElementById('playBtn');
  btnVault = document.getElementById('modeVault');
  btnSession = document.getElementById('modeSession');
  legendBox = document.getElementById('legendBox');
  settingsTitle = document.getElementById('settingsTitle');
  countPill = document.getElementById('countPill');

  slider.addEventListener('input', () => setTurn(+slider.value));
  playBtn.addEventListener('click', togglePlay);
  btnVault.addEventListener('click', () => setMode('vault'));
  btnSession.addEventListener('click', () => {
    if (state.turns.length > 0) setMode('session');
  });
  document.getElementById('resetZoom').addEventListener('click', () => {
    svg.transition().duration(500).ease(d3.easeCubicInOut).call(zoom.transform, d3.zoomIdentity);
  });
  document.getElementById('search').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    if (!q) {
      clearHighlight();
      return;
    }
    const matched = new Set(
      state.nodes.filter((n) => n.id.toLowerCase().includes(q) || n.label.toLowerCase().includes(q)).map((n) => n.id),
    );
    nodeSel.classed('dim', (n) => !matched.has(n.id)).classed('show-label', (n) => matched.has(n.id));
    linkSel.style('opacity', 0.15);
  });
}

function highlightNeighborhood(id) {
  const neigh = new Set([id]);
  state.links.forEach((l) => {
    if (l.source.id === id) neigh.add(l.target.id);
    if (l.target.id === id) neigh.add(l.source.id);
  });
  nodeSel
    .classed('dim', (n) => !neigh.has(n.id))
    .classed('show-label', (n) => neigh.has(n.id) || state.degree[n.id] >= 3)
    .classed('focus', (n) => n.id === id);
  linkSel
    .style('--lk-color', (l) => (l.source.id === id || l.target.id === id ? '#a89bff' : 'rgba(255,255,255,0.13)'))
    .style('opacity', (l) => (l.source.id === id || l.target.id === id ? 1 : 0.25));
}

function clearHighlight() {
  nodeSel.classed('dim', false).classed('focus', false).classed('show-label', (d) => state.degree[d.id] >= 3);
  linkSel.style('--lk-color', (l) => linkColorFor(l)).style('opacity', 1);
}

export function clearSearchAndFocus() {
  state.focusedId = null;
  const search = document.getElementById('search');
  if (search) search.value = '';
  if (nodeSel) clearHighlight();
}

function panTo(d) {
  const t = d3.zoomTransform(svg.node());
  const scale = Math.max(t.k, 1.6);
  svg
    .transition()
    .duration(600)
    .ease(d3.easeCubicInOut)
    .call(zoom.transform, d3.zoomIdentity.translate(state.W / 2 - d.x * scale, state.H / 2 - d.y * scale).scale(scale));
}

function gradVars(d) {
  if (state.mode !== 'session') return midEdge(HEAT_GRAY); // Normal mode: gray only, no exceptions
  const count = readCountUpTo(d.id, +slider.value);
  return midEdge(heatColorFor(count)); // more reads → deeper red
}

function linkColorFor(l) {
  if (state.mode !== 'session') return 'rgba(255,255,255,0.13)';
  const cs = readCountUpTo(l.source.id, +slider.value);
  const ct = readCountUpTo(l.target.id, +slider.value);
  const count = Math.max(cs, ct);
  if (count === 0) return 'rgba(255,255,255,0.13)';
  return heatColorFor(count);
}

function applyLinkColors() {
  // While the entrance animation runs, links belong to it — recolors are applied
  // once from its end handler with the then-current mode state.
  if (!state.entranceDone) return;
  linkSel.transition().duration(550).style('--lk-color', (l) => linkColorFor(l));
}

function refreshColors() {
  state.nodes.forEach((d, i) => {
    const { mid, edge } = gradVars(d);
    // MUST select from defs: the gradients are siblings of the zoom/pan <g>, not
    // descendants — selecting via g returns silently empty (bug found the hard way).
    defs
      .selectAll('radialGradient.nodeGrad')
      .filter((n, j) => j === i)
      .style('--nc-mid', mid)
      .style('--nc-edge', edge);
  });
  applyLinkColors();
}

function turnLabelFor(turn, index) {
  const preview = turn.prompt ? ` — "${turn.prompt.length > 42 ? turn.prompt.slice(0, 42) + '…' : turn.prompt}"` : '';
  return `Turn ${turn.turnId ?? index + 1}${preview}`;
}

export function setTurn(i) {
  if (state.turns.length === 0) return;
  i = Math.max(0, Math.min(state.turns.length - 1, i));
  slider.value = i;
  turnLabel.textContent = state.turns[i].label ?? turnLabelFor(state.turns[i], i);
  refreshColors();
  state.onTurnChange.forEach((fn) => fn(i));
}

export function loadSession(turns) {
  // Fresh session = fresh replay state: slider back to 0, colors recomputed from
  // scratch (no heat left over from the previous session).
  stopPlay();
  state.turns = turns;
  slider.max = Math.max(0, turns.length - 1);
  setMode('session');
}

export function clearSession() {
  stopPlay();
  state.turns = [];
  setMode('vault');
}

export function setMode(m) {
  if (m === 'session' && state.turns.length === 0) m = 'vault';
  state.mode = m;
  stopPlay();
  if (m === 'session') {
    btnSession.classList.add('active');
    btnVault.classList.remove('active');
    sessionbar.classList.remove('hidden');
    renderSessionLegend();
    setTurn(0);
  } else {
    btnVault.classList.add('active');
    btnSession.classList.remove('active');
    sessionbar.classList.add('hidden');
    renderVaultLegend();
    if (nodeSel) refreshColors();
  }
}

export function getMode() {
  return state.mode;
}
export function currentTurn() {
  return +slider.value;
}

export function togglePlay() {
  if (state.turns.length === 0) return;
  state.playing = !state.playing;
  playBtn.textContent = state.playing ? '⏸' : '▶';
  if (state.playing) {
    state.playTimer = setInterval(() => setTurn((+slider.value + 1) % state.turns.length), 1600);
  } else {
    clearInterval(state.playTimer);
  }
}

function stopPlay() {
  if (state.playing) {
    state.playing = false;
    clearInterval(state.playTimer);
    if (playBtn) playBtn.textContent = '▶';
  }
}
