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
import { pushSnapshot, popSnapshot, canUndo, onUndoChange } from './history.js';
import { setupGestures } from './gestures.js';

async function init() {
    await loadData();
    setupCustomLists();
    setupBgShadeSelector();
    setupBoardPanning();
    setupDragAndDrop();
    setupGestures();
    setupEventListeners();
    setupSheet();
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
        } else if (e.key.toLowerCase() === 'u') {
            e.preventDefault();
            performUndo();
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
        if (b) { pushSnapshot(); b.pedals = []; renderBoards(); saveToLocalStorage(); }
    });

    document.getElementById('clear-board-btn').addEventListener('click', () => {
        if (confirm('Are you sure you want to clear the entire canvas? This removes all boards and pedals.')) {
            pushSnapshot();
            state.placedBoards = [];
            state.canvasPedals = [];
            state.selectedBoardId = null;
            renderBoards();
            saveToLocalStorage();
        }
    });

    // -------- undo --------
    const undoBtn = document.getElementById('undo-btn');
    undoBtn.addEventListener('click', performUndo);
    onUndoChange(enabled => { undoBtn.disabled = !enabled; });
    undoBtn.disabled = true;

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

function performUndo() {
    const snap = popSnapshot();
    if (!snap) return;
    state.placedBoards = snap.placedBoards;
    state.canvasPedals = snap.canvasPedals;
    window.activeFocusedPedal = null;
    renderBoards();
    saveToLocalStorage();
}

/* ---------- mobile sheet / drawer controller ---------- */
function setupSheet() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    const handle = document.getElementById('sheet-handle');
    const menuBtn = document.getElementById('menu-btn');

    const openSheet = () => { sidebar.classList.add('open'); backdrop.classList.add('open'); };
    const closeSheet = () => { sidebar.classList.remove('open'); backdrop.classList.remove('open'); };
    const toggleSheet = () => (sidebar.classList.contains('open') ? closeSheet() : openSheet());

    menuBtn.addEventListener('click', openSheet);
    backdrop.addEventListener('click', closeSheet);

    // Landscape drawer: auto-close once an item is added (search list selection)
    document.addEventListener('catalog-select', closeSheet);

    // --- portrait bottom-sheet handle: tap toggles, drag follows + snaps ---
    let dragging = false;
    let startY = 0;
    let startOpen = false;
    let moved = false;

    handle.addEventListener('pointerdown', (e) => {
        dragging = true;
        moved = false;
        startY = e.clientY;
        startOpen = sidebar.classList.contains('open');
        sidebar.style.transition = 'none';
        handle.setPointerCapture(e.pointerId);
    });

    handle.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const dy = e.clientY - startY;
        if (Math.abs(dy) > 4) moved = true;
        const peek = 96;
        const sheetH = sidebar.offsetHeight;
        const collapsedY = sheetH - peek;
        const base = startOpen ? 0 : collapsedY;
        const y = Math.max(0, Math.min(base + dy, collapsedY));
        sidebar.style.transform = `translateY(${y}px)`;
    });

    const endDrag = (e) => {
        if (!dragging) return;
        dragging = false;
        sidebar.style.transition = '';
        sidebar.style.transform = '';
        if (!moved) { toggleSheet(); return; }
        // Snap: decide by where we ended relative to the midpoint
        const peek = 96;
        const sheetH = sidebar.offsetHeight;
        const collapsedY = sheetH - peek;
        const dy = e.clientY - startY;
        const base = startOpen ? 0 : collapsedY;
        const endedY = Math.max(0, Math.min(base + dy, collapsedY));
        if (endedY < collapsedY / 2) openSheet(); else closeSheet();
    };

    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
}

window.addEventListener('DOMContentLoaded', init);
