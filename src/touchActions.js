import { state } from './state.js';
import {
    rotateFocusedPedal, removePedal, removeBoardFromCanvas, renderBoards,
} from './canvas.js';
import { saveToLocalStorage } from './storage.js';
import { pushSnapshot } from './history.js';

// On-screen action bar for the current selection — the touch replacement for
// the R / Delete keyboard shortcuts. Shown only on mobile (CSS) and only when
// something is selected. Driven by the `selection-changed` event that the
// canvas dispatches whenever the focused pedal or board changes.
export function setupTouchActions() {
    const bar = document.getElementById('touch-actions');
    if (!bar) return;

    function button(icon, label, cls, onClick) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `btn btn-sm ${cls}`;
        b.innerHTML = `<i class="bi ${icon}"></i> ${label}`;
        b.addEventListener('click', onClick);
        return b;
    }

    function deselectAll() {
        state.selectedBoardId = null;
        window.activeFocusedPedal = null;
        renderBoards();
        document.dispatchEvent(new CustomEvent('selection-changed'));
    }

    function render() {
        bar.innerHTML = '';

        if (window.activeFocusedPedal) {
            const { instanceId } = window.activeFocusedPedal;
            bar.appendChild(button('bi-arrow-clockwise', 'Rotate', 'btn-outline-light',
                () => rotateFocusedPedal()));
            bar.appendChild(button('bi-trash3', 'Delete', 'btn-outline-danger',
                () => removePedal(instanceId)));
            bar.appendChild(button('bi-check-lg', 'Done', 'btn-outline-secondary',
                deselectAll));
            bar.hidden = false;
            return;
        }

        const board = state.placedBoards.find(b => b.id === state.selectedBoardId);
        if (board) {
            bar.appendChild(button('bi-eraser', 'Clear', 'btn-outline-warning', () => {
                pushSnapshot();
                board.pedals = [];
                renderBoards();
                saveToLocalStorage();
            }));
            bar.appendChild(button('bi-trash3', 'Remove', 'btn-outline-danger',
                () => removeBoardFromCanvas(board.id)));
            bar.appendChild(button('bi-check-lg', 'Done', 'btn-outline-secondary',
                deselectAll));
            bar.hidden = false;
            return;
        }

        bar.hidden = true;
    }

    document.addEventListener('selection-changed', render);
    render();
}
