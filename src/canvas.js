import { state } from './state.js';
import { saveToLocalStorage } from './storage.js';
import { updateBoardInfoPanel, updateOnCanvasSidebar } from './sidebar.js';

export let highestZ = 10;

export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 4;

/* ---------- helpers ---------- */

export function snapEnabled() {
    const el = document.getElementById('snap-grid');
    return !!(el && el.checked);
}

export function maybeSnap(value) {
    return snapEnabled() ? Math.round(value / 10) * 10 : value;
}

function setHelp(html) {
    const helpBar = document.getElementById('help-status-bar');
    if (helpBar) helpBar.innerHTML = html;
}

const DEFAULT_HELP =
    '<i class="bi bi-info-circle"></i> Scroll to zoom · drag canvas to pan · ' +
    'click to select · <span class="key">R</span> rotate · ' +
    '<span class="key">Del</span> delete · <span class="key">F</span> fit';

export function resetHelp() {
    setHelp(DEFAULT_HELP);
}

/* ---------- viewport ---------- */

export function fitToScreen() {
    const container = document.getElementById('canvas-container');
    let contentWidth = 400;
    let contentHeight = 200;
    let minX = 0;
    let minY = 0;

    if (state.placedBoards.length > 0 || state.canvasPedals.length > 0) {
        minX = Infinity;
        minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        state.placedBoards.forEach(b => {
            minX = Math.min(minX, b.x);
            minY = Math.min(minY, b.y);
            maxX = Math.max(maxX, b.x + b.width);
            maxY = Math.max(maxY, b.y + b.height);
        });
        state.canvasPedals.forEach(p => {
            const pData = state.pedals.find(pd => pd.id === p.pedalId);
            const pW = pData ? pData.width : 50;
            const pH = pData ? pData.height : 100;
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x + pW);
            maxY = Math.max(maxY, p.y + pH);
        });

        if (minX === Infinity) {
            minX = 0; minY = 0; maxX = 400; maxY = 200;
        }
        contentWidth = maxX - minX;
        contentHeight = maxY - minY;
    }

    const margin = 60;
    const scaleX = (container.clientWidth - margin * 2) / (contentWidth || 1);
    const scaleY = (container.clientHeight - margin * 2) / (contentHeight || 1);

    state.zoom = Math.max(ZOOM_MIN, Math.min(scaleX, scaleY, ZOOM_MAX));
    state.panX = (container.clientWidth - contentWidth * state.zoom) / 2 - (minX * state.zoom);
    state.panY = (container.clientHeight - contentHeight * state.zoom) / 2 - (minY * state.zoom);

    updateTransform();
    saveToLocalStorage();
}

export function updateTransform() {
    const wrapper = document.getElementById('board-wrapper');
    if (wrapper) {
        wrapper.style.transform =
            `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
    }
    const readout = document.getElementById('zoom-readout');
    if (readout) readout.textContent = Math.round(state.zoom * 100) + '%';
}

/* ---------- cross-browser zoom normalization ----------
   Chrome/Brave emit deltaY ≈ 100 per wheel notch (deltaMode=0).
   Firefox can emit deltaMode=1 (lines) with much smaller deltaY.
   We normalize to "ticks" so the feel is consistent everywhere. */
export function normalizedWheelTicks(e) {
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16;      // lines → px-ish
    else if (e.deltaMode === 2) dy *= 100; // pages
    dy = Math.max(-200, Math.min(200, dy)); // clamp pinch-bursts
    return dy / 120; // 1 tick ≈ classic mouse wheel notch
}

/* ---------- boards ---------- */

export function addBoardToCanvas(board) {
    const isFirstItem =
        state.placedBoards.length === 0 && state.canvasPedals.length === 0;

    if (!state.placedBoards.find(b => b.id === board.id)) {
        const initialX = maybeSnap(100 + state.placedBoards.length * 40);
        const initialY = maybeSnap(100 + state.placedBoards.length * 40);

        state.placedBoards.push({
            ...board,
            x: initialX,
            y: initialY,
            pedals: [],
        });
    }
    state.selectedBoardId = board.id;
    renderBoards();
    saveToLocalStorage();

    if (isFirstItem) fitToScreen();
}

export function removeBoardFromCanvas(boardId) {
    state.placedBoards = state.placedBoards.filter(b => b.id !== boardId);
    if (state.selectedBoardId === boardId) {
        state.selectedBoardId =
            state.placedBoards.length ? state.placedBoards[0].id : null;
    }
    renderBoards();
    saveToLocalStorage();
}

/* ---------- empty-canvas click clears selection ---------- */

export function setupBoardPanning() {
    const container = document.getElementById('canvas-container');
    container.addEventListener('mousedown', (e) => {
        const inWrapperBg = e.target.closest('#board-wrapper')
            && !e.target.closest('.pedal')
            && !e.target.closest('.placed-board');

        if (e.target === container || inWrapperBg) {
            resetHelp();
            state.selectedBoardId = null;
            updateBoardInfoPanel();

            Array.from(document.querySelectorAll('.pedal'))
                .forEach(p => p.classList.remove('focused'));
            window.activeFocusedPedal = null;

            renderBoards();
        }
    });
}

/* ---------- DOM rendering ---------- */

export function renderBoards() {
    const wrapper = document.getElementById('board-wrapper');
    wrapper.innerHTML = '';

    state.placedBoards.forEach(board => {
        const boardDiv = document.createElement('div');
        boardDiv.className = 'placed-board';
        if (state.selectedBoardId === board.id) boardDiv.classList.add('focused');
        if (!board.image) boardDiv.classList.add('custom-frame');

        boardDiv.style.position = 'absolute';
        boardDiv.style.left = board.x + 'px';
        boardDiv.style.top = board.y + 'px';
        boardDiv.style.width = board.width + 'px';
        boardDiv.style.height = board.height + 'px';
        boardDiv.style.backgroundImage = board.image ? `url('${board.image}')` : '';
        boardDiv.style.backgroundSize = 'contain';
        boardDiv.style.backgroundRepeat = 'no-repeat';
        boardDiv.style.backgroundPosition = 'center';
        boardDiv.style.backgroundColor = board.image ? 'transparent' : '';
        boardDiv.style.zIndex = 1;
        boardDiv.dataset.boardId = board.id;

        // Drag state, scoped per board.
        let isDragging = false;
        let didMove = false;
        let dragStartMouseX = 0, dragStartMouseY = 0;
        let dragStartBoardX = 0, dragStartBoardY = 0;

        const onMouseMove = (e) => {
            if (!isDragging) return;
            const dx = (e.clientX - dragStartMouseX) / state.zoom;
            const dy = (e.clientY - dragStartMouseY) / state.zoom;
            if (!didMove && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) didMove = true;

            let targetX = dragStartBoardX + dx;
            let targetY = dragStartBoardY + dy;
            targetX = maybeSnap(targetX);
            targetY = maybeSnap(targetY);

            board.x = targetX;
            board.y = targetY;
            boardDiv.style.left = board.x + 'px';
            boardDiv.style.top = board.y + 'px';
        };

        const onMouseUp = () => {
            if (!isDragging) return;
            isDragging = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.userSelect = '';
            if (didMove) saveToLocalStorage();
        };

        boardDiv.addEventListener('mousedown', (e) => {
            if (e.target !== boardDiv) return;

            state.selectedBoardId = board.id;
            updateBoardInfoPanel();
            updateOnCanvasSidebar();
            Array.from(document.querySelectorAll('.placed-board'))
                .forEach(el => el.classList.remove('focused'));
            boardDiv.classList.add('focused');

            setHelp(
                '<i class="bi bi-grid"></i> Selected board · drag to move · ' +
                'click "Clear" to wipe its pedals · double-click to remove'
            );

            isDragging = true;
            didMove = false;
            dragStartMouseX = e.clientX;
            dragStartMouseY = e.clientY;
            dragStartBoardX = board.x;
            dragStartBoardY = board.y;
            boardDiv.style.zIndex = ++highestZ;
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            e.preventDefault();
        });

        board.pedals.forEach(p => {
            const pedalData = state.pedals.find(pd => pd.id === p.pedalId);
            if (pedalData) renderPedalDOM(pedalData, p.x, p.y, p.instanceId, boardDiv, board.id);
        });

        wrapper.appendChild(boardDiv);
    });

    state.canvasPedals.forEach(p => {
        const pedalData = state.pedals.find(pd => pd.id === p.pedalId);
        if (pedalData) renderPedalDOM(pedalData, p.x, p.y, p.instanceId, wrapper, null);
    });

    updateBoardInfoPanel();
    updateOnCanvasSidebar();
}

export function addPedalToBoard(pedalData, savedX = null, savedY = null, instanceId = null) {
    const id = instanceId || `pedal_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const board = state.placedBoards.find(b => b.id === state.selectedBoardId);

    // Smart spawn offset so consecutive spawns don't stack invisibly (REQ-6.4)
    const stackBump = (state.placedBoards.reduce((n, b) => n + b.pedals.length, 0)
                       + state.canvasPedals.length) % 6;
    const offset = stackBump * 30;

    if (board) {
        let x = savedX !== null
            ? savedX
            : (board.width / 2) - (pedalData.width / 2) + offset;
        let y = savedY !== null
            ? savedY
            : (board.height / 2) - (pedalData.height / 2) + offset;

        // Only snap newly-computed positions; preserve exact savedX/Y on import.
        if (savedX === null) x = maybeSnap(x);
        if (savedY === null) y = maybeSnap(y);

        board.pedals.push({ instanceId: id, pedalId: pedalData.id, x, y, rotation: 0 });
    } else {
        const container = document.getElementById('canvas-container');
        let x = savedX !== null
            ? savedX
            : (container.clientWidth / 2 - state.panX) / state.zoom
              - (pedalData.width / 2) + offset;
        let y = savedY !== null
            ? savedY
            : (container.clientHeight / 2 - state.panY) / state.zoom
              - (pedalData.height / 2) + offset;

        if (savedX === null) x = maybeSnap(x);
        if (savedY === null) y = maybeSnap(y);

        state.canvasPedals.push({ instanceId: id, pedalId: pedalData.id, x, y, rotation: 0 });
    }
    saveToLocalStorage();
    renderBoards();
}

export function renderPedalDOM(pedalData, x, y, instanceId, parentEl, boardId) {
    const el = document.createElement('div');
    el.className = 'pedal';
    el.dataset.instanceId = instanceId;
    el.dataset.pedalId = pedalData.id;
    if (boardId) el.dataset.boardId = boardId;

    let currentRotation = 0;
    if (boardId) {
        const b = state.placedBoards.find(board => board.id === boardId);
        const p = b ? b.pedals.find(ped => ped.instanceId === instanceId) : null;
        if (p && p.rotation) currentRotation = p.rotation;
    } else {
        const p = state.canvasPedals.find(ped => ped.instanceId === instanceId);
        if (p && p.rotation) currentRotation = p.rotation;
    }

    el.style.width = pedalData.width + 'px';
    el.style.height = pedalData.height + 'px';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.zIndex = ++highestZ;
    el.style.transform = `rotate(${currentRotation}deg)`;

    const shortName = pedalData.name ? pedalData.name.split(' ')[0] : 'Pedal';
    const img = document.createElement('img');
    img.src = pedalData.image;
    img.draggable = false;
    img.alt = `${pedalData.brand} ${pedalData.name}`;
    img.onerror = () => {
        img.onerror = null;
        img.src = `https://placehold.co/${pedalData.width}x${pedalData.height}/444/fff?text=${encodeURIComponent(shortName)}`;
    };
    el.appendChild(img);

    el.addEventListener('mousedown', () => {
        el.style.zIndex = ++highestZ;
        Array.from(document.querySelectorAll('.pedal'))
            .forEach(p => p.classList.remove('focused'));
        el.classList.add('focused');
        window.activeFocusedPedal = { instanceId, boardId, element: el };

        setHelp(
            '<i class="bi bi-plug"></i> Selected pedal · drag to move · ' +
            '<span class="key">R</span> rotate · <span class="key">Del</span> to remove'
        );
    });

    parentEl.appendChild(el);
}

export function removePedal(instanceId) {
    let removed = false;
    for (const board of state.placedBoards) {
        const idx = board.pedals.findIndex(p => p.instanceId === instanceId);
        if (idx !== -1) {
            board.pedals.splice(idx, 1);
            removed = true;
            break;
        }
    }
    if (!removed) {
        const idx = state.canvasPedals.findIndex(p => p.instanceId === instanceId);
        if (idx !== -1) state.canvasPedals.splice(idx, 1);
    }
    if (window.activeFocusedPedal &&
        window.activeFocusedPedal.instanceId === instanceId) {
        window.activeFocusedPedal = null;
    }
    renderBoards();
    saveToLocalStorage();
}

export function rotateFocusedPedal() {
    if (!window.activeFocusedPedal) return false;
    const { instanceId, boardId, element } = window.activeFocusedPedal;
    let targetPedal;
    if (boardId) {
        const b = state.placedBoards.find(board => board.id === boardId);
        targetPedal = b ? b.pedals.find(ped => ped.instanceId === instanceId) : null;
    } else {
        targetPedal = state.canvasPedals.find(ped => ped.instanceId === instanceId);
    }
    if (!targetPedal) return false;

    targetPedal.rotation = ((targetPedal.rotation || 0) + 90) % 360;
    element.style.transform = `rotate(${targetPedal.rotation}deg)`;
    saveToLocalStorage();
    return true;
}
