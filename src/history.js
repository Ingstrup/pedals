import { state } from './state.js';

const MAX = 50;
const stack = [];

export function pushSnapshot() {
    stack.push({
        placedBoards: JSON.parse(JSON.stringify(state.placedBoards)),
        canvasPedals: JSON.parse(JSON.stringify(state.canvasPedals)),
    });
    if (stack.length > MAX) stack.shift();
    notifyChange();
}

export function canUndo() {
    return stack.length > 0;
}

export function popSnapshot() {
    const snap = stack.pop();
    notifyChange();
    return snap || null;
}

let changeCallback = null;
export function onUndoChange(fn) { changeCallback = fn; }
function notifyChange() { if (changeCallback) changeCallback(canUndo()); }
