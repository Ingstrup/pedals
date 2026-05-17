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
    
    state.zoom = Math.max(0.4, Math.min(scaleX, scaleY, 2));
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
        state.placedBoards.push({
            ...board,
            x: 100 + state.placedBoards.length * 40,
            y: 100 + state.placedBoards.length * 40,
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
        if (e.target === container || e.target.classList.contains('empty-board') || (e.target.closest('#board-wrapper') && !e.target.closest('.pedal') && !e.target.closest('.placed-board'))) {
            state.selectedBoardId = null;
            updateBoardInfoPanel();
            renderBoards();
        }
    });
}

export function renderBoards() {
    const wrapper = document.getElementById('board-wrapper');
    wrapper.innerHTML = '';
    
    if (state.placedBoards.length === 0 && state.canvasPedals.length === 0) {
        const placeholder = document.createElement('div');
        placeholder.className = 'empty-board';
        placeholder.innerHTML = '<span class="board-placeholder">Select or create a board</span>';
        wrapper.appendChild(placeholder);
    }
    
    state.placedBoards.forEach(board => {
        const boardDiv = document.createElement('div');
        boardDiv.className = 'placed-board';
        boardDiv.style.position = 'absolute';
        boardDiv.style.left = board.x + 'px';
        boardDiv.style.top = board.y + 'px';
        boardDiv.style.width = board.width + 'px';
        boardDiv.style.height = board.height + 'px';
        boardDiv.style.backgroundImage = board.image ? `url('${board.image}')` : '';
        boardDiv.style.backgroundSize = 'contain';
        boardDiv.style.backgroundRepeat = 'no-repeat';
        boardDiv.style.backgroundPosition = 'center';
        boardDiv.style.backgroundColor = 'transparent';
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

        let isDragging = false;
        let dragStartMouseX = 0, dragStartMouseY = 0;
        let dragStartBoardX = 0, dragStartBoardY = 0;

        const onMouseMove = (e) => {
            if (!isDragging) return;
            const dx = (e.clientX - dragStartMouseX) / state.zoom;
            const dy = (e.clientY - dragStartMouseY) / state.zoom;
            board.x = dragStartBoardX + dx;
            board.y = dragStartBoardY + dy;
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

            state.selectedBoardId = board.id;
            updateBoardInfoPanel();
            updateOnCanvasSidebar();
            Array.from(document.querySelectorAll('.placed-board')).forEach(el => el.style.boxShadow = 'none');
            boardDiv.style.boxShadow = '0 0 0 4px #2a9fd6';

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

        if (state.selectedBoardId === board.id) { 
            boardDiv.style.boxShadow = '0 0 0 4px #2a9fd6'; 
        } else { 
            boardDiv.style.boxShadow = 'none'; 
        }
        
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
    
    if (board) {
        const x = savedX !== null ? savedX : (board.width / 2) - (pedalData.width / 2);
        const y = savedY !== null ? savedY : (board.height / 2) - (pedalData.height / 2);
        board.pedals.push({ instanceId: id, pedalId: pedalData.id, x, y });
    } else {
        const container = document.getElementById('canvas-container');
        const x = savedX !== null ? savedX : (container.clientWidth / 2 - state.panX) / state.zoom - (pedalData.width / 2);
        const y = savedY !== null ? savedY : (container.clientHeight / 2 - state.panY) / state.zoom - (pedalData.height / 2);
        state.canvasPedals.push({ instanceId: id, pedalId: pedalData.id, x, y });
    }
    saveToLocalStorage();
    renderBoards();
}

export function renderPedalDOM(pedalData, x, y, instanceId, parentEl, boardId) {
    const el = document.createElement('div');
    el.className = 'pedal';
    el.dataset.instanceId = instanceId;
    if (boardId) el.dataset.boardId = boardId; 
    
    el.style.width = pedalData.width + 'px';
    el.style.height = pedalData.height + 'px';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.zIndex = ++highestZ;
    
    const shortName = pedalData.name ? pedalData.name.split(' ')[0] : 'Pedal';
    el.innerHTML = `<img src="${pedalData.image}" draggable="false" onerror="this.src='https://placehold.co/${pedalData.width}x${pedalData.height}/444/fff?text=${shortName}'">`;
    
    el.addEventListener('dblclick', () => removePedal(instanceId));
    el.addEventListener('mousedown', () => el.style.zIndex = ++highestZ);
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