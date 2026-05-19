import { state, STORAGE_KEY } from './state.js';
import { updateTransform, renderBoards } from './canvas.js';

let indicatorTimer = null;

function flashAutosaveIndicator() {
    const el = document.getElementById('autosave-indicator');
    if (!el) return;
    el.classList.add('flash');
    clearTimeout(indicatorTimer);
    indicatorTimer = setTimeout(() => el.classList.remove('flash'), 600);
}

function writeNow() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            selectedBoardId: state.selectedBoardId,
            placedBoards: state.placedBoards,
            canvasPedals: state.canvasPedals,
            panX: state.panX,
            panY: state.panY,
            zoom: state.zoom,
        }));
        flashAutosaveIndicator();
    } catch (e) {
        console.error('localStorage write failed:', e);
    }
}

// localStorage.setItem is fast enough that synchronous writes are fine even
// during wheel/drag bursts — and they remove all reload-race ambiguity.
export function saveToLocalStorage() {
    writeNow();
}

// Belt-and-suspenders: also flush on tab close.
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', writeNow);
}

export function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return false;

        const parsed = JSON.parse(saved);

        if (typeof parsed.zoom === 'number') state.zoom = parsed.zoom;
        if (typeof parsed.panX === 'number') state.panX = parsed.panX;
        if (typeof parsed.panY === 'number') state.panY = parsed.panY;

        if (Array.isArray(parsed.placedBoards)) {
            state.placedBoards = parsed.placedBoards.map(board => ({
                ...board,
                pedals: (board.pedals || []).map(p => ({
                    ...p,
                    rotation: p.rotation || 0,
                })),
            }));
        }

        if (Array.isArray(parsed.canvasPedals)) {
            state.canvasPedals = parsed.canvasPedals.map(p => ({
                ...p,
                rotation: p.rotation || 0,
            }));
        }

        if (parsed.selectedBoardId) state.selectedBoardId = parsed.selectedBoardId;

        updateTransform();
        renderBoards();
        return true;
    } catch (e) {
        console.error('Save data corrupted. Resetting.', e);
        localStorage.removeItem(STORAGE_KEY);
        return false;
    }
}
