import { state } from './state.js';

let chainMode = false;
let selectedStart = null; // instanceId

export function isChainMode() { return chainMode; }

export function setChainMode(on) {
    chainMode = !!on;
    selectedStart = null;
    document.body.classList.toggle('chain-mode', chainMode);
    return chainMode;
}

function findPedal(instanceId) {
    for (const board of state.placedBoards) {
        const p = board.pedals.find(pp => pp.instanceId === instanceId);
        if (p) return { record: p, board };
    }
    const p = state.canvasPedals.find(pp => pp.instanceId === instanceId);
    return p ? { record: p, board: null } : null;
}

function pedalCenter(instanceId) {
    const found = findPedal(instanceId);
    if (!found) return null;
    const pd = state.pedals.find(pp => pp.id === found.record.pedalId);
    if (!pd) return null;
    const baseX = found.board ? found.board.x : 0;
    const baseY = found.board ? found.board.y : 0;
    return {
        x: baseX + found.record.x + pd.width / 2,
        y: baseY + found.record.y + pd.height / 2
    };
}

// Click handling: build a linear signal chain. Clicking pedal A then B sets A.chainNext = B,
// and B becomes the new start so the next click extends the chain. Click on the current start
// to deselect; shift-click to clear that pedal's outgoing connection.
export function handlePedalChainClick(instanceId, shiftKey) {
    if (shiftKey) {
        const found = findPedal(instanceId);
        if (found) { delete found.record.chainNext; return true; }
        return false;
    }
    if (selectedStart === instanceId) {
        selectedStart = null;
        return true;
    }
    if (selectedStart) {
        const found = findPedal(selectedStart);
        if (found) found.record.chainNext = instanceId;
    }
    selectedStart = instanceId;
    return true;
}

export function getSelectedChainStart() { return selectedStart; }

function listChainEdges() {
    const edges = [];
    const visit = (p) => {
        if (p && p.chainNext) edges.push([p.instanceId, p.chainNext]);
    };
    state.placedBoards.forEach(b => b.pedals.forEach(visit));
    state.canvasPedals.forEach(visit);
    return edges;
}

export function computeTotalCableLengthCm() {
    let total = 0;
    listChainEdges().forEach(([from, to]) => {
        const a = pedalCenter(from);
        const b = pedalCenter(to);
        if (!a || !b) return;
        total += Math.hypot(b.x - a.x, b.y - a.y);
    });
    return total / 10; // canvas units are mm
}

// Drop chainNext fields that point at pedals that no longer exist (post-delete).
export function pruneOrphanChainLinks() {
    const valid = new Set();
    state.placedBoards.forEach(b => b.pedals.forEach(p => valid.add(p.instanceId)));
    state.canvasPedals.forEach(p => valid.add(p.instanceId));
    let changed = false;
    const sweep = (p) => {
        if (p.chainNext && !valid.has(p.chainNext)) {
            delete p.chainNext;
            changed = true;
        }
    };
    state.placedBoards.forEach(b => b.pedals.forEach(sweep));
    state.canvasPedals.forEach(sweep);
    return changed;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function renderChainOverlay(wrapper) {
    pruneOrphanChainLinks();
    const edges = listChainEdges();
    if (edges.length === 0) return;

    // Cover the entire wrapper so absolute pedal coords map directly into SVG coords.
    // We need a size that comfortably encompasses all content. Use the bbox of all pedals
    // plus a margin so arrow heads don't get clipped.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    edges.forEach(([from, to]) => {
        [pedalCenter(from), pedalCenter(to)].forEach(c => {
            if (!c) return;
            minX = Math.min(minX, c.x); minY = Math.min(minY, c.y);
            maxX = Math.max(maxX, c.x); maxY = Math.max(maxY, c.y);
        });
    });
    if (!Number.isFinite(minX)) return;
    const pad = 80;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'chain-overlay');
    svg.setAttribute('width', String(maxX - minX));
    svg.setAttribute('height', String(maxY - minY));
    svg.style.position = 'absolute';
    svg.style.left = minX + 'px';
    svg.style.top = minY + 'px';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '500';
    svg.setAttribute('viewBox', `${minX} ${minY} ${maxX - minX} ${maxY - minY}`);

    // Arrow marker definition (gets re-defined per overlay but cheap).
    const defs = document.createElementNS(SVG_NS, 'defs');
    const marker = document.createElementNS(SVG_NS, 'marker');
    marker.setAttribute('id', 'chain-arrow');
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '8');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('orient', 'auto-start-reverse');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    path.setAttribute('fill', '#2a9fd6');
    marker.appendChild(path);
    defs.appendChild(marker);
    svg.appendChild(defs);

    edges.forEach(([from, to]) => {
        const a = pedalCenter(from);
        const b = pedalCenter(to);
        if (!a || !b) return;
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', String(a.x));
        line.setAttribute('y1', String(a.y));
        line.setAttribute('x2', String(b.x));
        line.setAttribute('y2', String(b.y));
        line.setAttribute('stroke', '#2a9fd6');
        line.setAttribute('stroke-width', '4');
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('marker-end', 'url(#chain-arrow)');
        svg.appendChild(line);
    });

    wrapper.appendChild(svg);
}
