import { state } from './state.js';
import { updateTransform, renderBoards } from './canvas.js';

const HISTORY_LIMIT = 50;
const undoStack = [];
const redoStack = [];

function snapshot() {
    return JSON.stringify({
        selectedBoardId: state.selectedBoardId,
        placedBoards: state.placedBoards,
        canvasPedals: state.canvasPedals,
        panX: state.panX,
        panY: state.panY,
        zoom: state.zoom
    });
}

function apply(serialized) {
    const parsed = JSON.parse(serialized);
    if (parsed.zoom !== undefined) state.zoom = parsed.zoom;
    if (parsed.panX !== undefined) state.panX = parsed.panX;
    if (parsed.panY !== undefined) state.panY = parsed.panY;
    state.placedBoards = parsed.placedBoards || [];
    state.canvasPedals = parsed.canvasPedals || [];
    state.selectedBoardId = parsed.selectedBoardId || null;
    updateTransform();
    renderBoards();
}

export function saveToLocalStorage() {
    const serialized = snapshot();
    localStorage.setItem('pedalboard_v4_state', serialized);
    // Don't push duplicates (e.g. re-renders without state changes).
    if (undoStack[undoStack.length - 1] !== serialized) {
        undoStack.push(serialized);
        if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
        // A new action invalidates the redo branch.
        redoStack.length = 0;
    }
}

export function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem('pedalboard_v4_state');
        if (saved) {
            apply(saved);
            undoStack.length = 0;
            undoStack.push(saved);
        }
    } catch (e) {
        console.error("Save data corrupted. Resetting.");
        localStorage.removeItem('pedalboard_v4_state');
    }
}

export function undo() {
    // Top of undoStack is the current state. Pop it, restore the new top.
    if (undoStack.length < 2) return false;
    const current = undoStack.pop();
    redoStack.push(current);
    const previous = undoStack[undoStack.length - 1];
    apply(previous);
    localStorage.setItem('pedalboard_v4_state', previous);
    return true;
}

export function redo() {
    if (redoStack.length === 0) return false;
    const next = redoStack.pop();
    undoStack.push(next);
    apply(next);
    localStorage.setItem('pedalboard_v4_state', next);
    return true;
}