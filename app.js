import { state } from './state.js';
import { loadData } from './data.js';
import { loadFromLocalStorage, saveToLocalStorage } from './storage.js';
import { setupCustomLists, setupBgShadeSelector, boardListManager } from './sidebar.js';
import { setupBoardPanning, fitToScreen, renderBoards, addBoardToCanvas, updateTransform, removeBoardFromCanvas, removePedal } from './canvas.js';
import { setupDragAndDrop } from './dragDrop.js';
import { setChainMode, isChainMode } from './chain.js';

// Expose these two functions to the global window so the inline HTML onclicks in sidebar.js still work
window.removeBoardFromCanvasGlobal = removeBoardFromCanvas;
window.removePedalGlobal = removePedal;

async function init() {
    await loadData();
    setupCustomLists(); 
    setupEventListeners();
    setupBoardPanning();
    setupDragAndDrop();
    fitToScreen(); 
    loadFromLocalStorage();
    setupBgShadeSelector();
}

function setupEventListeners() {
    document.getElementById('custom-board-btn').addEventListener('click', () => {
        const w = Number.parseFloat(document.getElementById('custom-w').value);
        const h = Number.parseFloat(document.getElementById('custom-h').value);
        if (w > 0 && h > 0) {
            const customBoard = { id: 'custom_' + Date.now(), name: `Custom (${w}x${h} cm)`, brand: 'Custom', width: w * 10, height: h * 10 };
            state.boards.push(customBoard);
            boardListManager.addNode(customBoard); 
            addBoardToCanvas(customBoard); 
            document.getElementById('board-list').classList.remove('active');
        } else {
            alert("Please enter valid dimensions in cm.");
        }
    });

    document.getElementById('clear-selected-board-btn').addEventListener('click', () => {
        const b = state.placedBoards.find(x => x.id === state.selectedBoardId);
        if (b) { b.pedals = []; renderBoards(); saveToLocalStorage(); }
    });

    document.getElementById('clear-board-btn').addEventListener('click', () => {
        if(confirm("Are you sure you want to clear the entire canvas? This removes all boards and pedals.")) {
            state.placedBoards = [];
            state.canvasPedals = [];
            state.selectedBoardId = null;
            renderBoards();
            saveToLocalStorage();
        }
    });

    document.getElementById('canvas-container').addEventListener('wheel', (e) => {
        e.preventDefault();
        // Reduced to 2% jumps for much smoother zooming
        const zoomDelta = e.deltaY > 0 ? 0.98 : 1.02;

        // Capped between 20% (0.2) and 400% (4)
        state.zoom = Math.max(0.2, Math.min(state.zoom * zoomDelta, 4));

        updateTransform();
        saveToLocalStorage();
    }, {passive: false});
    
    document.getElementById('fit-to-screen-btn').addEventListener('click', fitToScreen);

    const chainBtn = document.getElementById('chain-mode-btn');
    chainBtn.addEventListener('click', () => {
        const next = !isChainMode();
        setChainMode(next);
        chainBtn.classList.toggle('active', next);
        chainBtn.textContent = next ? 'Exit chain mode' : 'Chain mode';
        renderBoards();
    });

    // Export JSON
    document.getElementById('export-json-btn').addEventListener('click', () => {
        const exportData = {
            placedBoards: state.placedBoards,
            canvasPedals: state.canvasPedals,
            zoom: state.zoom,
            panX: state.panX,
            panY: state.panY
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'pedalboard-export.json';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    });

    // Import JSON
    document.getElementById('import-json-btn').addEventListener('click', () => {
        document.getElementById('import-json-input').click();
    });
    document.getElementById('import-json-input').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            
            if (data.placedBoards) { state.placedBoards = data.placedBoards; } 
            else if (data.board) { state.placedBoards = [{...data.board, x: 100, y: 100}]; } 
            else { state.placedBoards = []; }
            
            state.canvasPedals = data.canvasPedals || [];
            if (typeof data.zoom === 'number') state.zoom = data.zoom;
            if (typeof data.panX === 'number') state.panX = data.panX;
            if (typeof data.panY === 'number') state.panY = data.panY;
            
            updateTransform();
            renderBoards();
            saveToLocalStorage();
        } catch (err) {
            alert('Failed to import JSON: ' + err);
        }
        e.target.value = '';
    });
}

window.addEventListener('DOMContentLoaded', init);
