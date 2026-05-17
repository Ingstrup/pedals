import { state } from './state.js';
import { loadData, buildCustomPedal, loadCustomPedals, saveCustomPedals } from './data.js';
import { loadFromLocalStorage, saveToLocalStorage } from './storage.js';
import { setupCustomLists, setupBgShadeSelector, boardListManager, pedalListManager } from './sidebar.js';
import { setupBoardPanning, fitToScreen, renderBoards, addBoardToCanvas, updateTransform, removeBoardFromCanvas, removePedal } from './canvas.js';
import { setupDragAndDrop } from './dragDrop.js';

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

    setupCustomPedalModal();

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

async function fileToResizedDataUrl(file, maxDim = 400) {
    const url = URL.createObjectURL(file);
    try {
        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = url;
        });
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        return canvas.toDataURL('image/png');
    } finally {
        URL.revokeObjectURL(url);
    }
}

function setupCustomPedalModal() {
    const modal = document.getElementById('custom-pedal-modal');
    const openBtn = document.getElementById('open-custom-pedal-btn');
    const cancelBtn = document.getElementById('cp-cancel');
    const saveBtn = document.getElementById('cp-save');
    if (!modal || !openBtn) return;

    const open = () => {
        document.getElementById('cp-brand').value = '';
        document.getElementById('cp-name').value = '';
        document.getElementById('cp-width').value = '';
        document.getElementById('cp-height').value = '';
        document.getElementById('cp-image').value = '';
        modal.classList.remove('hidden');
    };
    const close = () => modal.classList.add('hidden');

    openBtn.addEventListener('click', open);
    cancelBtn.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    saveBtn.addEventListener('click', async () => {
        const name = document.getElementById('cp-name').value.trim();
        const brand = document.getElementById('cp-brand').value.trim() || 'Custom';
        const widthCm = Number.parseFloat(document.getElementById('cp-width').value);
        const heightCm = Number.parseFloat(document.getElementById('cp-height').value);
        const file = document.getElementById('cp-image').files[0];

        if (!name) { alert('Please enter a name.'); return; }
        if (!(widthCm > 0 && heightCm > 0)) { alert('Please enter valid dimensions in cm.'); return; }

        let image = '';
        if (file) {
            try { image = await fileToResizedDataUrl(file); }
            catch { alert('Could not read the image file.'); return; }
        }

        const pedal = buildCustomPedal({ name, brand, widthCm, heightCm, image });
        const all = loadCustomPedals();
        all.push(pedal);
        if (!saveCustomPedals(all)) {
            alert('Could not save the custom pedal (browser storage is full).');
            return;
        }
        state.pedals.push(pedal);
        if (pedalListManager) pedalListManager.addNode(pedal);
        close();
    });
}

window.addEventListener('DOMContentLoaded', init);
