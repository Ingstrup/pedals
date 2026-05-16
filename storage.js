import { state } from './state.js';
import { updateTransform, renderBoards } from './canvas.js';

export function saveToLocalStorage() {
    localStorage.setItem('pedalboard_v4_state', JSON.stringify({
        selectedBoardId: state.selectedBoardId, 
        placedBoards: state.placedBoards,
        canvasPedals: state.canvasPedals,
        panX: state.panX,
        panY: state.panY,
        zoom: state.zoom
    }));
}

export function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem('pedalboard_v4_state');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.zoom !== undefined) state.zoom = parsed.zoom;
            if (parsed.panX !== undefined) state.panX = parsed.panX;
            if (parsed.panY !== undefined) state.panY = parsed.panY;
            
            if (parsed.placedBoards) { state.placedBoards = parsed.placedBoards; }
            if (parsed.canvasPedals) { state.canvasPedals = parsed.canvasPedals; }
            if (parsed.selectedBoardId) { state.selectedBoardId = parsed.selectedBoardId; }
            
            updateTransform();
            renderBoards();
        }
    } catch (e) {
        console.error("Save data corrupted. Resetting.");
        localStorage.removeItem('pedalboard_v4_state');
    }
}