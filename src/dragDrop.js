import { state } from './state.js';
import { saveToLocalStorage } from './storage.js';
import { renderBoards, maybeSnap } from './canvas.js';

const CLICK_THRESHOLD_PX = 3;

export function setupDragAndDrop() {
    let draggingEl = null;
    let startMouseX = 0;
    let startMouseY = 0;
    let startElLeft = 0;
    let startElTop = 0;
    let dragSource = null;
    let hasDragged = false;

    document.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const pedalEl = e.target.closest('.pedal');
        if (!pedalEl) return;
        draggingEl = pedalEl;
        hasDragged = false;
        startMouseX = e.clientX;
        startMouseY = e.clientY;
        startElLeft = parseFloat(draggingEl.style.left || 0);
        startElTop = parseFloat(draggingEl.style.top || 0);
        dragSource = {
            type: pedalEl.dataset.boardId ? 'board' : 'canvas',
            boardId: pedalEl.dataset.boardId,
            instanceId: pedalEl.dataset.instanceId,
        };
    });

    document.addEventListener('mousemove', (e) => {
        if (!draggingEl) return;
        const dx = (e.clientX - startMouseX) / state.zoom;
        const dy = (e.clientY - startMouseY) / state.zoom;
        if (!hasDragged
            && (Math.abs(e.clientX - startMouseX) > CLICK_THRESHOLD_PX
                || Math.abs(e.clientY - startMouseY) > CLICK_THRESHOLD_PX)) {
            hasDragged = true;
        }
        if (hasDragged) {
            draggingEl.style.left = (startElLeft + dx) + 'px';
            draggingEl.style.top = (startElTop + dy) + 'px';
        }
    });

    document.addEventListener('mouseup', () => {
        if (!draggingEl || !dragSource) return;

        if (!hasDragged) {
            draggingEl = null;
            dragSource = null;
            return;
        }

        const rect = draggingEl.getBoundingClientRect();
        const containerRect = document.getElementById('canvas-container').getBoundingClientRect();

        const absoluteCanvasX = ((rect.left + rect.width / 2 - containerRect.left) - state.panX) / state.zoom;
        const absoluteCanvasY = ((rect.top + rect.height / 2 - containerRect.top) - state.panY) / state.zoom;

        // Find topmost board containing the drop point (iterate reverse for z-order).
        let targetBoard = null;
        for (let i = state.placedBoards.length - 1; i >= 0; i--) {
            const b = state.placedBoards[i];
            if (absoluteCanvasX >= b.x && absoluteCanvasX <= b.x + b.width
                && absoluteCanvasY >= b.y && absoluteCanvasY <= b.y + b.height) {
                targetBoard = b;
                break;
            }
        }

        // Splice pedal out of its source array.
        let pedalDataState;
        if (dragSource.type === 'board') {
            const b = state.placedBoards.find(b => b.id === dragSource.boardId);
            if (!b) { draggingEl = null; dragSource = null; return; }
            const idx = b.pedals.findIndex(p => p.instanceId === dragSource.instanceId);
            pedalDataState = b.pedals.splice(idx, 1)[0];
        } else {
            const idx = state.canvasPedals.findIndex(p => p.instanceId === dragSource.instanceId);
            pedalDataState = state.canvasPedals.splice(idx, 1)[0];
        }

        // Orientation: width/height swap for 90°/270° rotations so the
        // anchor point stays at the visual center.
        const wRaw = parseFloat(draggingEl.style.width);
        const hRaw = parseFloat(draggingEl.style.height);
        const rotated = ((pedalDataState.rotation || 0) % 180) === 90;
        const pedalWidth = rotated ? hRaw : wRaw;
        const pedalHeight = rotated ? wRaw : hRaw;

        if (targetBoard) {
            pedalDataState.x = maybeSnap((absoluteCanvasX - targetBoard.x) - pedalWidth / 2);
            pedalDataState.y = maybeSnap((absoluteCanvasY - targetBoard.y) - pedalHeight / 2);
            targetBoard.pedals.push(pedalDataState);
        } else {
            pedalDataState.x = maybeSnap(absoluteCanvasX - pedalWidth / 2);
            pedalDataState.y = maybeSnap(absoluteCanvasY - pedalHeight / 2);
            state.canvasPedals.push(pedalDataState);
        }

        saveToLocalStorage();
        renderBoards();
        draggingEl = null;
        dragSource = null;
    });
}
