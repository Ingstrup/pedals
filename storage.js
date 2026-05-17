import { state } from './state.js';
import { updateTransform, renderBoards } from './canvas.js';

function serializeState() {
    return {
        selectedBoardId: state.selectedBoardId,
        placedBoards: state.placedBoards,
        canvasPedals: state.canvasPedals,
        panX: state.panX,
        panY: state.panY,
        zoom: state.zoom
    };
}

function applyState(parsed) {
    if (parsed.zoom !== undefined) state.zoom = parsed.zoom;
    if (parsed.panX !== undefined) state.panX = parsed.panX;
    if (parsed.panY !== undefined) state.panY = parsed.panY;
    if (parsed.placedBoards) state.placedBoards = parsed.placedBoards;
    if (parsed.canvasPedals) state.canvasPedals = parsed.canvasPedals;
    if (parsed.selectedBoardId) state.selectedBoardId = parsed.selectedBoardId;
    updateTransform();
    renderBoards();
}

export function saveToLocalStorage() {
    localStorage.setItem('pedalboard_v4_state', JSON.stringify(serializeState()));
}

export function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem('pedalboard_v4_state');
        if (saved) applyState(JSON.parse(saved));
    } catch (e) {
        console.error("Save data corrupted. Resetting.");
        localStorage.removeItem('pedalboard_v4_state');
    }
}

// --- Shareable URL encoding ---
// JSON → UTF-8 → URI-safe base64. Reverses cleanly via `decodeShareString`.
function encodeShareString(obj) {
    const json = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeShareString(str) {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
    const bin = atob(padded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
}

export function getShareableUrl() {
    const encoded = encodeShareString(serializeState());
    const base = window.location.origin + window.location.pathname;
    return `${base}#s=${encoded}`;
}

export function loadFromShareableUrl() {
    const hash = window.location.hash;
    if (!hash.startsWith('#s=')) return false;
    try {
        applyState(decodeShareString(hash.slice(3)));
        return true;
    } catch (e) {
        console.error("Shareable URL is malformed:", e);
        return false;
    }
}