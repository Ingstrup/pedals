import { state } from './state.js';
import { saveToLocalStorage } from './storage.js';
import { renderBoards, maybeSnap } from './canvas.js';
import { pushSnapshot } from './history.js';
import { setElementDragging } from './dragState.js';

const CLICK_THRESHOLD_PX = 8;

export function setupDragAndDrop() {
    let draggingEl = null;
    let activePointerId = null;
    let startX = 0;
    let startY = 0;
    let startElLeft = 0;
    let startElTop = 0;
    let dragSource = null;
    let hasDragged = false;

    function reset() {
        draggingEl = null;
        activePointerId = null;
        dragSource = null;
        setElementDragging(false);
    }

    document.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;            // primary button / touch contact only
        if (draggingEl) return;                // ignore extra pointers mid-drag
        const pedalEl = e.target.closest('.pedal');
        if (!pedalEl) return;
        draggingEl = pedalEl;
        activePointerId = e.pointerId;
        hasDragged = false;
        setElementDragging(true);
        pushSnapshot();
        startX = e.clientX;
        startY = e.clientY;
        startElLeft = parseFloat(draggingEl.style.left || 0);
        startElTop = parseFloat(draggingEl.style.top || 0);
        dragSource = {
            type: pedalEl.dataset.boardId ? 'board' : 'canvas',
            boardId: pedalEl.dataset.boardId,
            instanceId: pedalEl.dataset.instanceId,
        };
    });

    document.addEventListener('pointermove', (e) => {
        if (!draggingEl || e.pointerId !== activePointerId) return;
        const dx = (e.clientX - startX) / state.zoom;
        const dy = (e.clientY - startY) / state.zoom;
        if (!hasDragged
            && (Math.abs(e.clientX - startX) > CLICK_THRESHOLD_PX
                || Math.abs(e.clientY - startY) > CLICK_THRESHOLD_PX)) {
            hasDragged = true;
        }
        if (hasDragged) {
            draggingEl.style.left = (startElLeft + dx) + 'px';
            draggingEl.style.top = (startElTop + dy) + 'px';
        }
    });

    function onPointerUp(e) {
        if (!draggingEl || e.pointerId !== activePointerId || !dragSource) return;

        if (!hasDragged) {
            reset();
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
            if (!b) { reset(); return; }
            const idx = b.pedals.findIndex(p => p.instanceId === dragSource.instanceId);
            pedalDataState = b.pedals.splice(idx, 1)[0];
        } else {
            const idx = state.canvasPedals.findIndex(p => p.instanceId === dragSource.instanceId);
            pedalDataState = state.canvasPedals.splice(idx, 1)[0];
        }

        // style.left/top always reference unrotated dimensions — CSS transform handles
        // the visual rotation around the element center (transform-origin: 50% 50%).
        // No width/height swap needed here regardless of rotation angle.
        const wRaw = parseFloat(draggingEl.style.width);
        const hRaw = parseFloat(draggingEl.style.height);

        if (targetBoard) {
            pedalDataState.x = maybeSnap((absoluteCanvasX - targetBoard.x) - wRaw / 2);
            pedalDataState.y = maybeSnap((absoluteCanvasY - targetBoard.y) - hRaw / 2);
            targetBoard.pedals.push(pedalDataState);
        } else {
            pedalDataState.x = maybeSnap(absoluteCanvasX - wRaw / 2);
            pedalDataState.y = maybeSnap(absoluteCanvasY - hRaw / 2);
            state.canvasPedals.push(pedalDataState);
        }

        saveToLocalStorage();
        renderBoards();
        reset();
    }

    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', () => { if (draggingEl) reset(); });
}
