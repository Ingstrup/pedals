import { state } from './state.js';
import { loadData } from './data.js';
import { loadFromLocalStorage, saveToLocalStorage } from './storage.js';
import { setupCustomLists, setupBgShadeSelector, boardListManager } from './sidebar.js';
import {
    setupBoardPanning, fitToScreen, renderBoards, addBoardToCanvas,
    updateTransform, rotateFocusedPedal, normalizedWheelTicks,
    resetHelp, ZOOM_MIN, ZOOM_MAX,
} from './canvas.js';
import { setupDragAndDrop } from './dragDrop.js';

async function init() {
    await loadData();
    setupCustomLists();
    setupBgShadeSelector();
    setupBoardPanning();
    setupDragAndDrop();
    setupEventListeners();
    resetHelp();

    // Load state BEFORE deciding whether to fit-to-screen, so we don't override
    // the user's restored zoom/pan with a fresh fit on every load.
    const restored = loadFromLocalStorage();
    if (!restored) fitToScreen();
}

function setupEventListeners() {
    // -------- global keyboard --------
    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.key.toLowerCase() === 'r') {
            if (rotateFocusedPedal()) e.preventDefault();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
            if (window.activeFocusedPedal) {
                e.preventDefault();
                const { instanceId } = window.activeFocusedPedal;
                import('./canvas.js').then(m => m.removePedal(instanceId));
            }
        } else if (e.key.toLowerCase() === 'f') {
            e.preventDefault();
            fitToScreen();
        }
    });

    // -------- custom board creation + Enter UX --------
    const customW = document.getElementById('custom-w');
    const customH = document.getElementById('custom-h');
    const customBtn = document.getElementById('custom-board-btn');

    function createCustomBoard() {
        const w = Number.parseFloat(customW.value);
        const h = Number.parseFloat(customH.value);
        if (!(w > 0) || !(h > 0)) {
            alert('Please enter valid dimensions in cm.');
            return;
        }
        const customBoard = {
            id: 'custom_' + Date.now(),
            name: `Custom (${w}×${h} cm)`,
            brand: 'Custom',
            width: w * 10,
            height: h * 10,
        };
        state.boards.push(customBoard);
        if (boardListManager) boardListManager.addNode(customBoard);
        addBoardToCanvas(customBoard);
        document.getElementById('board-list').classList.remove('active');
        customW.value = '';
        customH.value = '';
    }

    customBtn.addEventListener('click', createCustomBoard);

    customW.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            customH.focus();
        }
    });
    customH.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            createCustomBoard();
        }
    });

    // -------- clear / nuke --------
    document.getElementById('clear-selected-board-btn').addEventListener('click', () => {
        const b = state.placedBoards.find(x => x.id === state.selectedBoardId);
        if (b) { b.pedals = []; renderBoards(); saveToLocalStorage(); }
    });

    document.getElementById('clear-board-btn').addEventListener('click', () => {
        if (confirm('Are you sure you want to clear the entire canvas? This removes all boards and pedals.')) {
            state.placedBoards = [];
            state.canvasPedals = [];
            state.selectedBoardId = null;
            renderBoards();
            saveToLocalStorage();
        }
    });

    // -------- zoom (cross-browser normalized) --------
    document.getElementById('canvas-container').addEventListener('wheel', (e) => {
        e.preventDefault();
        const ticks = normalizedWheelTicks(e);
        const zoomFactor = Math.pow(0.92, ticks);
        state.zoom = Math.max(ZOOM_MIN, Math.min(state.zoom * zoomFactor, ZOOM_MAX));
        updateTransform();
        saveToLocalStorage();
    }, { passive: false });

    document.getElementById('fit-to-screen-btn').addEventListener('click', fitToScreen);

    // -------- export / import JSON --------
    document.getElementById('export-json-btn').addEventListener('click', () => {
        const exportData = {
            schemaVersion: 2,
            placedBoards: state.placedBoards,
            canvasPedals: state.canvasPedals,
            zoom: state.zoom,
            panX: state.panX,
            panY: state.panY,
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pedalboard-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    });

    document.getElementById('import-json-btn').addEventListener('click', () => {
        document.getElementById('import-json-input').click();
    });

    document.getElementById('import-json-input').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);

            if (Array.isArray(data.placedBoards)) {
                state.placedBoards = data.placedBoards;
            } else if (data.board) {
                // legacy single-board export
                state.placedBoards = [{ ...data.board, x: 100, y: 100 }];
            } else {
                state.placedBoards = [];
            }
            state.canvasPedals = Array.isArray(data.canvasPedals) ? data.canvasPedals : [];
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
