import { state } from './state.js';
import { saveToLocalStorage } from './storage.js';
import { renderBoards } from './canvas.js';

export function setupDragAndDrop() {
    let draggingEl = null;
    let startMouseX, startMouseY, startElLeft, startElTop;
    let dragSource = null;
    let hasDraggedPedal = false;

    document.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; 
        const pedalEl = e.target.closest('.pedal');
        if (pedalEl) {
            draggingEl = pedalEl;
            hasDraggedPedal = false; 
            startMouseX = e.clientX;
            startMouseY = e.clientY;
            startElLeft = parseFloat(draggingEl.style.left || 0);
            startElTop = parseFloat(draggingEl.style.top || 0);
            
            dragSource = { 
                type: pedalEl.dataset.boardId ? 'board' : 'canvas', 
                boardId: pedalEl.dataset.boardId, 
                instanceId: pedalEl.dataset.instanceId 
            };
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (!draggingEl) return; 
        hasDraggedPedal = true; 
        let dx = (e.clientX - startMouseX) / state.zoom;
        let dy = (e.clientY - startMouseY) / state.zoom;
        draggingEl.style.left = (startElLeft + dx) + 'px';
        draggingEl.style.top = (startElTop + dy) + 'px';
    });

    document.addEventListener('mouseup', (e) => {
        if (draggingEl && dragSource) {
            if (!hasDraggedPedal) {
                draggingEl = null;
                dragSource = null;
                return;
            }

            const rect = draggingEl.getBoundingClientRect();
            const containerRect = document.getElementById('canvas-container').getBoundingClientRect();
            
            const absoluteCanvasX = ((rect.left + rect.width/2 - containerRect.left) - state.panX) / state.zoom;
            const absoluteCanvasY = ((rect.top + rect.height/2 - containerRect.top) - state.panY) / state.zoom;

            let targetBoard = null;
            for (let i = state.placedBoards.length - 1; i >= 0; i--) {
                const b = state.placedBoards[i];
                if (absoluteCanvasX >= b.x && absoluteCanvasX <= b.x + b.width && 
                    absoluteCanvasY >= b.y && absoluteCanvasY <= b.y + b.height) {
                    targetBoard = b;
                    break;
                }
            }

            let pedalDataState;
            if (dragSource.type === 'board') {
                const b = state.placedBoards.find(b => b.id === dragSource.boardId);
                const idx = b.pedals.findIndex(p => p.instanceId === dragSource.instanceId);
                pedalDataState = b.pedals.splice(idx, 1)[0];
            } else {
                const idx = state.canvasPedals.findIndex(p => p.instanceId === dragSource.instanceId);
                pedalDataState = state.canvasPedals.splice(idx, 1)[0];
            }

            const pedalWidth = parseFloat(draggingEl.style.width);
            const pedalHeight = parseFloat(draggingEl.style.height);

            if (targetBoard) {
                pedalDataState.x = (absoluteCanvasX - targetBoard.x) - pedalWidth/2;
                pedalDataState.y = (absoluteCanvasY - targetBoard.y) - pedalHeight/2;
                
                if (document.getElementById('snap-grid').checked) {
                    pedalDataState.x = Math.round(pedalDataState.x / 10) * 10;
                    pedalDataState.y = Math.round(pedalDataState.y / 10) * 10;
                }
                targetBoard.pedals.push(pedalDataState);
            } else {
                pedalDataState.x = absoluteCanvasX - pedalWidth/2;
                pedalDataState.y = absoluteCanvasY - pedalHeight/2;
                
                if (document.getElementById('snap-grid').checked) {
                    pedalDataState.x = Math.round(pedalDataState.x / 10) * 10;
                    pedalDataState.y = Math.round(pedalDataState.y / 10) * 10;
                }
                state.canvasPedals.push(pedalDataState);
            }

            saveToLocalStorage(); 
            renderBoards(); 
            draggingEl = null; 
            dragSource = null;
        }
    });
}