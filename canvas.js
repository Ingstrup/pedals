import { state } from './state.js';
import { saveToLocalStorage } from './storage.js';
import { updateBoardInfoPanel, updateOnCanvasSidebar } from './sidebar.js';

export let highestZ = 10;

export function fitToScreen() {
    const container = document.getElementById('canvas-container');
    let contentWidth = 400, contentHeight = 200;
    let minX = 0, minY = 0;

    if (state.placedBoards.length > 0 || state.canvasPedals.length > 0) {
        minX = Infinity; minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
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
        if (minX === Infinity) { minX = 0; minY = 0; maxX = 400; maxY = 200; }
        contentWidth = maxX - minX;
        contentHeight = maxY - minY;
    }

    const margin = 60;
    const scaleX = (container.clientWidth - margin * 2) / (contentWidth || 1);
    const scaleY = (container.clientHeight - margin * 2) / (contentHeight || 1);

    state.zoom = Math.max(0.2, Math.min(scaleX, scaleY, 4));
    state.panX = (container.clientWidth - contentWidth * state.zoom) / 2 - (minX * state.zoom);
    state.panY = (container.clientHeight - contentHeight * state.zoom) / 2 - (minY * state.zoom);

    updateTransform();
    saveToLocalStorage();
}

export function updateTransform() {
    document.getElementById('board-wrapper').style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
    const readout = document.getElementById('zoom-readout');
    if (readout) readout.innerText = Math.round(state.zoom * 100) + '%';
}

export function addBoardToCanvas(board) {
    const isFirstItem = state.placedBoards.length === 0 && state.canvasPedals.length === 0;

    if (!state.placedBoards.find(b => b.id === board.id)) {
        let initialX = 100 + state.placedBoards.length * 40;
        let initialY = 100 + state.placedBoards.length * 40;

        if (document.getElementById('snap-grid').checked) {
            initialX = Math.round(initialX / 10) * 10;
            initialY = Math.round(initialY / 10) * 10;
        }

        state.placedBoards.push({
            ...board,
            x: initialX,
            y: initialY,
            pedals: []
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
        state.selectedBoardId = state.placedBoards.length ? state.placedBoards[0].id : null;
    }
    renderBoards();
    saveToLocalStorage();
}

export function setupBoardPanning() {
    const container = document.getElementById('canvas-container');
    container.addEventListener('mousedown', (e) => {
        if (e.target === container || (e.target.closest('#board-wrapper') && !e.target.closest('.pedal') && !e.target.closest('.placed-board'))) {
            
            // Update help bar first to prevent canvas lifecycle cutoff errors
            const helpBar = document.getElementById('help-status-bar');
            if (helpBar) {
                helpBar.textContent = "Scroll to zoom workspace. Click objects to select.";
            }

            state.selectedBoardId = null;
            updateBoardInfoPanel();

            // Clear active node selections completely
            Array.from(document.querySelectorAll('.pedal')).forEach(p => p.classList.remove('focused'));
            window.activeFocusedPedal = null;

            renderBoards();
        }
    });
}

export function renderBoards() {
    const wrapper = document.getElementById('board-wrapper');
    wrapper.innerHTML = '';

    state.placedBoards.forEach(board => {
        const boardDiv = document.createElement('div');
        boardDiv.className = 'placed-board';
        
        if (state.selectedBoardId === board.id) {
            boardDiv.classList.add('focused');
        }

        // Give a specific class if it's a custom layout with no background asset image
        if (!board.image) {
            boardDiv.classList.add('custom-frame');
        }

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

        const label = document.createElement('div');
        label.className = 'board-label';
        label.textContent = board.name;
        label.style.position = 'absolute';
        label.style.bottom = '-25px';
        label.style.left = '0';
        label.style.right = '0';
        label.style.background = 'transparent';
        label.style.color = '#aaa';
        label.style.fontSize = '0.9rem';
        label.style.textAlign = 'center';
        label.style.pointerEvents = 'none';
        boardDiv.appendChild(label);

        boardDiv.onmousedown = (e) => {
            if (e.target !== boardDiv && !e.target.classList.contains('board-label')) return;
            state.selectedBoardId = board.id;
            updateBoardInfoPanel();
            updateOnCanvasSidebar();
            Array.from(document.querySelectorAll('.placed-board')).forEach(el => el.classList.remove('focused'));
            boardDiv.classList.add('focused');

            // Set dynamic board selection feedback text
            const helpBar = document.getElementById('help-status-bar');
            if (helpBar) {
                helpBar.textContent = "Selected Board. Drag to position. Use sidebar items to manage.";
            }
        };

        let isDragging = false;
        let dragStartMouseX = 0, dragStartMouseY = 0;
        let dragStartBoardX = 0, dragStartBoardY = 0;

        const onMouseMove = (e) => {
            if (!isDragging) return;
            let dx = (e.clientX - dragStartMouseX) / state.zoom;
            let dy = (e.clientY - dragStartMouseY) / state.zoom;

            let targetX = dragStartBoardX + dx;
            let targetY = dragStartBoardY + dy;

            if (document.getElementById('snap-grid').checked) {
                targetX = Math.round(targetX / 10) * 10;
                targetY = Math.round(targetY / 10) * 10;
            }

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
            saveToLocalStorage();
            document.body.style.userSelect = '';
        };
        boardDiv.addEventListener('mousedown', (e) => {
            if (e.target !== boardDiv && !e.target.classList.contains('board-label')) return;
            isDragging = true;
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
    const id = instanceId || `pedal_${Date.now()}_${Math.floor(Math.random()*1000)}`;
    const board = state.placedBoards.find(b => b.id === state.selectedBoardId);
    const snapEnabled = document.getElementById('snap-grid').checked;

    if (board) {
        let x = savedX !== null ? savedX : (board.width / 2) - (pedalData.width / 2);
        let y = savedY !== null ? savedY : (board.height / 2) - (pedalData.height / 2);

        if (snapEnabled) {
            x = Math.round(x / 10) * 10;
            y = Math.round(y / 10) * 10;
        }
        board.pedals.push({ instanceId: id, pedalId: pedalData.id, x, y, rotation: 0 });
    } else {
        const container = document.getElementById('canvas-container');
        let x = savedX !== null ? savedX : (container.clientWidth / 2 - state.panX) / state.zoom - (pedalData.width / 2);
        let y = savedY !== null ? savedY : (container.clientHeight / 2 - state.panY) / state.zoom - (pedalData.height / 2);

        if (snapEnabled) {
            x = Math.round(x / 10) * 10;
            y = Math.round(y / 10) * 10;
        }
        state.canvasPedals.push({ instanceId: id, pedalId: pedalData.id, x, y, rotation: 0 });
    }
    saveToLocalStorage();
    renderBoards();
}

export function renderPedalDOM(pedalData, x, y, instanceId, parentEl, boardId) {
    const el = document.createElement('div');
    el.className = 'pedal';
    el.dataset.instanceId = instanceId;
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
    el.innerHTML = `<img src="${pedalData.image}" draggable="false" onerror="this.src='https://placehold.co/${pedalData.width}x${pedalData.height}/444/fff?text=${shortName}'">`;

    el.addEventListener('mousedown', (e) => {
        el.style.zIndex = ++highestZ;
        
        Array.from(document.querySelectorAll('.pedal')).forEach(p => p.classList.remove('focused'));
        el.classList.add('focused');
        
        // Expose data pointers globally so app.js can catch 'R' keys safely
        window.activeFocusedPedal = { instanceId, boardId, element: el };

        // Set pedal active context prompt message
        const helpBar = document.getElementById('help-status-bar');
        if (helpBar) {
            helpBar.textContent = "Selected Pedal. Drag to reposition. Press R to rotate. Double-click to delete.";
        }
    });

    el.addEventListener('dblclick', () => removePedal(instanceId));
    parentEl.appendChild(el);
}

export function removePedal(instanceId) {
    let removed = false;
    for (const board of state.placedBoards) {
        const idx = board.pedals.findIndex(p => p.instanceId === instanceId);
        if (idx !== -1) { board.pedals.splice(idx, 1); removed = true; break; }
    }
    if (!removed) {
        const idx = state.canvasPedals.findIndex(p => p.instanceId === instanceId);
        if (idx !== -1) state.canvasPedals.splice(idx, 1);
    }
    renderBoards();
    saveToLocalStorage();
}