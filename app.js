// --- APP STATE ---
const state = {
    placedBoards: [],
    canvasPedals: [],
    pedals: [],
    boards: [],
    zoom: 1,
    panX: 0,
    panY: 0,
    selectedBoardId: null
};

function normalizePedals(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(p => {
        const brand = (p.Brand || 'unk').toLowerCase().replace(/[^a-z0-9]/g, '');
        const name = (p.Name || 'unk').toLowerCase().replace(/[^a-z0-9]/g, '');
        return {
            id: brand + '_' + name,
            name: p.Name || "Unknown",
            brand: p.Brand || "Unknown",
            width: Math.round((p.Width || 2) * 25.4),
            height: Math.round((p.Height || 4) * 25.4),
            image: './data/images/pedals/' + (p.Image || '')
        };
    });
}

function normalizeBoards(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(b => {
        const name = b.name || b.Name || 'Unnamed Board';
        let widthRaw = b.width !== undefined ? b.width : (b.Width !== undefined ? b.Width : 600);
        let heightRaw = b.height !== undefined ? b.height : (b.Height !== undefined ? b.Height : 300);
        const width = widthRaw < 100 ? Math.round(widthRaw * 25.4) : Math.round(widthRaw);
        const height = heightRaw < 100 ? Math.round(heightRaw * 25.4) : Math.round(heightRaw);
        const id = b.id || b.ID || (name + '_' + width + 'x' + height).toLowerCase().replace(/[^a-z0-9]/g, '_');
        let image = b.image || b.Image || undefined;
        if (image) {
            const filename = image.split(/[\\/]/).pop();
            image = './data/images/boards/' + filename;
        }
        return { id, name, width, height, image };
    });
}

// --- INITIALIZATION ---
async function init() {
    await loadData();
    setupCustomLists();
    setupEventListeners();
    setupBoardPanning();
    fitToScreen();
    loadFromLocalStorage();
}

function fitToScreen() {
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

function centerBoardWrapper() { fitToScreen(); }

async function loadData() {
    try {
        const [boardsRes, pedalsRes] = await Promise.all([
            fetch('./data/boards.json').catch(err => null),
            fetch('./data/pedals.json').catch(err => null)
        ]);
        if (boardsRes && boardsRes.ok) state.boards = normalizeBoards(await boardsRes.json());
        if (pedalsRes && pedalsRes.ok) state.pedals = normalizePedals(await pedalsRes.json());
    } catch (e) {
        console.error("Fatal network error during loadData:", e);
    }
}

// --- HIGH PERFORMANCE LIST MANAGER WITH KEYBOARD NAV ---
let boardListManager = null;

function setupCustomLists() {
    const previewOverlay = document.getElementById('preview-overlay');
    const previewImg = document.getElementById('preview-image');
    const previewName = document.getElementById('preview-name');

    let boardPreviewDimensions = document.getElementById('board-preview-dimensions');
    if (!boardPreviewDimensions) {
        boardPreviewDimensions = document.createElement('div');
        boardPreviewDimensions.id = 'board-preview-dimensions';
        boardPreviewDimensions.style.color = '#bbb';
        boardPreviewDimensions.style.fontSize = '1.05rem';
        boardPreviewDimensions.style.textAlign = 'center';
        boardPreviewDimensions.style.marginTop = '8px';
        previewOverlay.appendChild(boardPreviewDimensions);
    }

    function createListManager(inputId, listId, data, formatText, onSelect, onHighlight) {
        const input = document.getElementById(inputId);
        const list = document.getElementById(listId);
        const nodes = [];
        let filteredNodes = [];
        let renderedCount = 0;
        let activeIndex = -1;
        const CHUNK_SIZE = 50;
        let observer = null;
        let sentinel = null;

        data.forEach(item => {
            let text = formatText(item);
            nodes.push({ item, searchString: text.toLowerCase().replace(/-/g, ''), text, el: null });
        });

        function createNodeEl(nodeObj) {
            if (nodeObj.el) return nodeObj.el;
            const div = document.createElement('div');
            div.className = 'list-item';
            div.innerText = nodeObj.text;
            div.onmousedown = (e) => {
                e.preventDefault();
                onSelect(nodeObj.item);
                list.classList.remove('active');
                input.blur();
                if (onHighlight) onHighlight(null);
            };
            div.addEventListener('mouseenter', () => setHighlight(filteredNodes.indexOf(nodeObj), false));
            nodeObj.el = div;
            return div;
        }

        function clearList() {
            list.innerHTML = '';
            renderedCount = 0;
            activeIndex = -1;
            if (observer && sentinel) observer.unobserve(sentinel);
            sentinel = document.createElement('div');
            sentinel.className = 'list-sentinel';
            list.appendChild(sentinel);
        }

        function setupObserver() {
            if (observer) observer.disconnect();
            observer = new IntersectionObserver(entries => {
                if (entries[0].isIntersecting && renderedCount < filteredNodes.length) {
                    renderNextChunk();
                }
            }, { root: list, threshold: 0.1 });
            if (sentinel) observer.observe(sentinel);
        }

        function renderNextChunk() {
            const end = Math.min(renderedCount + CHUNK_SIZE, filteredNodes.length);
            for (let i = renderedCount; i < end; ++i) {
                list.insertBefore(createNodeEl(filteredNodes[i]), sentinel);
            }
            renderedCount = end;
            setupObserver();
        }

        function filterList(text) {
            const searchTerms = text.toLowerCase().replace(/-/g, '').split(' ').filter(t => t.trim() !== '');
            filteredNodes = nodes.filter(node =>
                searchTerms.every(term => node.searchString.includes(term))
            );
            clearList();
            renderNextChunk();
            if (filteredNodes.length > 0 && text.trim() !== '') {
                setHighlight(0, true);
            } else {
                activeIndex = -1;
                if (onHighlight) onHighlight(null);
            }
        }

        function setHighlight(index, scroll = true) {
            if (filteredNodes.length === 0) return;
            if (activeIndex >= 0 && activeIndex < renderedCount && filteredNodes[activeIndex].el) {
                filteredNodes[activeIndex].el.classList.remove('highlighted');
            }
            activeIndex = index;
            if (activeIndex < 0) activeIndex = renderedCount - 1;
            if (activeIndex >= renderedCount) activeIndex = 0;
            const activeNode = filteredNodes[activeIndex];
            if (activeNode && activeNode.el) {
                activeNode.el.classList.add('highlighted');
                if (scroll) activeNode.el.scrollIntoView({ block: 'nearest' });
                if (onHighlight) onHighlight(activeNode.item);
            }
        }

        input.addEventListener('focus', () => { list.classList.add('active'); input.value = ''; filterList(''); });
        input.addEventListener('input', (e) => filterList(e.target.value));

        input.addEventListener('keydown', (e) => {
            if (!list.classList.contains('active')) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(activeIndex + 1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(activeIndex - 1); }
            else if (e.key === 'Enter') { e.preventDefault(); if (activeIndex >= 0 && activeIndex < renderedCount && filteredNodes[activeIndex].el) filteredNodes[activeIndex].el.onmousedown(e); }
            else if (e.key === 'Escape') { list.classList.remove('active'); input.blur(); if (onHighlight) onHighlight(null); }
        });

        list.addEventListener('mouseleave', () => {
            if (activeIndex >= 0 && activeIndex < renderedCount && filteredNodes[activeIndex].el) {
                filteredNodes[activeIndex].el.classList.remove('highlighted');
            }
            activeIndex = -1;
            if (onHighlight) onHighlight(null);
        });

        filterList('');
        return { addNode: (item) => {
                let text = formatText(item);
                nodes.push({ item, searchString: text.toLowerCase().replace(/-/g, ''), text, el: null });
                filterList(input.value || '');
            }};
    }

    boardListManager = createListManager(
        'board-search', 'board-list', state.boards,
        b => b.name || 'Unnamed Board',
        b => {
            addBoardToCanvas(b);
            document.getElementById('board-search').value = b.name || 'Unnamed Board';
        },
        b => {
            clearTimeout(previewOverlay._timeout);
            if (b) {
                previewOverlay._timeout = setTimeout(() => {
                    if (b.image) { previewImg.src = b.image; previewImg.classList.remove('hidden'); }
                    else { previewImg.src = ''; previewImg.classList.add('hidden'); }
                    previewName.innerText = b.name || 'Unnamed Board';
                    boardPreviewDimensions.innerText = `${(b.width / 10).toFixed(1)} × ${(b.height / 10).toFixed(1)} cm`;
                    boardPreviewDimensions.style.display = '';
                    previewOverlay.classList.remove('hidden');
                }, 100);
            } else {
                previewOverlay.classList.add('hidden');
                boardPreviewDimensions.style.display = 'none';
            }
        }
    );

    let previewTimeout;
    createListManager(
        'pedal-search', 'pedal-list', state.pedals,
        p => `${p.brand} - ${p.name}`,
        p => { addPedalToBoard(p); document.getElementById('pedal-search').value = ''; },
        p => {
            clearTimeout(previewTimeout);
            if (p) {
                previewTimeout = setTimeout(() => {
                    previewImg.src = p.image;
                    previewName.innerText = p.name;
                    previewOverlay.classList.remove('hidden');
                    boardPreviewDimensions.style.display = 'none';
                }, 100);
            } else {
                previewOverlay.classList.add('hidden');
                boardPreviewDimensions.style.display = 'none';
            }
        }
    );

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#board-search') && !e.target.closest('#board-list')) { document.getElementById('board-list').classList.remove('active'); previewOverlay.classList.add('hidden'); boardPreviewDimensions.style.display = 'none'; }
        if (!e.target.closest('#pedal-search') && !e.target.closest('#pedal-list')) { document.getElementById('pedal-list').classList.remove('active'); previewOverlay.classList.add('hidden'); boardPreviewDimensions.style.display = 'none'; }
    });
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    document.getElementById('custom-board-btn').addEventListener('click', () => {
        const w = Number.parseFloat(document.getElementById('custom-w').value);
        const h = Number.parseFloat(document.getElementById('custom-h').value);
        if (w > 0 && h > 0) {
            const customBoard = { id: 'custom_' + Date.now(), name: `Custom (${w}x${h} cm)`, width: w * 10, height: h * 10 };
            state.boards.push(customBoard);
            boardListManager.addNode(customBoard);
            addBoardToCanvas(customBoard);
            document.getElementById('board-search').value = customBoard.name;
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
        const zoomDelta = e.deltaY > 0 ? 0.95 : 1.05;
        state.zoom = Math.max(0.4, Math.min(state.zoom * zoomDelta, 3));
        updateTransform();
        saveToLocalStorage();
    }, {passive: false});

    document.getElementById('fit-to-screen-btn').addEventListener('click', fitToScreen);

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

            if (data.placedBoards) {
                state.placedBoards = data.placedBoards;
            } else if (data.board) {
                state.placedBoards = [{...data.board, x: 100, y: 100}];
            } else {
                state.placedBoards = [];
            }
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

// --- BOARD LOGIC ---
function addBoardToCanvas(board) {
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
}

function removeBoardFromCanvas(boardId) {
    state.placedBoards = state.placedBoards.filter(b => b.id !== boardId);
    if (state.selectedBoardId === boardId) {
        state.selectedBoardId = state.placedBoards.length ? state.placedBoards[0].id : null;
    }
    renderBoards();
    saveToLocalStorage();
}

function setupBoardPanning() {
    const container = document.getElementById('canvas-container');
    container.addEventListener('mousedown', (e) => {
        // Clear board selection if clicking empty canvas (Miro panning removed)
        if (e.target === container || e.target.classList.contains('empty-board') || (e.target.closest('#board-wrapper') && !e.target.closest('.pedal') && !e.target.closest('.placed-board'))) {
            state.selectedBoardId = null;
            updateBoardInfoPanel();
            renderBoards();
        }
    });
}

function updateTransform() {
    document.getElementById('board-wrapper').style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
    const readout = document.getElementById('zoom-readout');
    if (readout) readout.innerText = Math.round(state.zoom * 100) + '%';
}

// --- RENDERING ---
let highestZ = 10;

function updateBoardInfoPanel() {
    const panel = document.getElementById('board-info-panel');
    if (!state.selectedBoardId) {
        panel.style.display = 'none';
        return;
    }
    const b = state.placedBoards.find(x => x.id === state.selectedBoardId);
    if (!b) { panel.style.display = 'none'; return; }

    panel.style.display = 'block';
    document.getElementById('info-name').textContent = b.name;
    const originalBoard = state.boards.find(x => x.id === b.id);
    document.getElementById('info-brand').textContent = originalBoard && originalBoard.brand ? originalBoard.brand : 'Custom/Misc';
    document.getElementById('info-size').textContent = `${(b.width/10).toFixed(1)} x ${(b.height/10).toFixed(1)} cm`;
}

function renderBoards() {
    const wrapper = document.getElementById('board-wrapper');
    wrapper.innerHTML = '';

    if (state.placedBoards.length === 0 && state.canvasPedals.length === 0) {
        const placeholder = document.createElement('div');
        placeholder.className = 'empty-board';
        placeholder.innerHTML = '<span class="board-placeholder">Select or create a board</span>';
        wrapper.appendChild(placeholder);
    }

    // Render Boards & Nested Pedals
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

        boardDiv.onmousedown = (e) => {
            if (e.target !== boardDiv && !e.target.classList.contains('board-label')) return;
            state.selectedBoardId = board.id;
            updateBoardInfoPanel();
            updateOnCanvasSidebar();
            Array.from(document.querySelectorAll('.placed-board')).forEach(el => el.style.boxShadow = 'none');
            boardDiv.style.boxShadow = '0 0 0 4px #2a9fd6';
        };

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

        // Render pedals for this board
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

    // Render Boardless Canvas Pedals
    state.canvasPedals.forEach(p => {
        const pedalData = state.pedals.find(pd => pd.id === p.pedalId);
        if (pedalData) renderPedalDOM(pedalData, p.x, p.y, p.instanceId, wrapper, null);
    });

    updateBoardInfoPanel();
    updateOnCanvasSidebar();
}

function addPedalToBoard(pedalData, savedX = null, savedY = null, instanceId = null) {
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

function renderPedalDOM(pedalData, x, y, instanceId, parentEl, boardId) {
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

    // Deletion event!
    el.addEventListener('dblclick', () => removePedal(instanceId));
    el.addEventListener('mousedown', () => el.style.zIndex = ++highestZ);
    parentEl.appendChild(el);
}

// --- ADVANCED DRAG AND DROP (CROSS-BOARD REPARENTING) ---
let draggingEl = null;
let startMouseX, startMouseY, startElLeft, startElTop;
let dragSource = null;
let hasDraggedPedal = false; // The flag that fixes the double-click bug!

document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const pedalEl = e.target.closest('.pedal');
    if (pedalEl) {
        draggingEl = pedalEl;
        hasDraggedPedal = false; // Reset the drag flag on click
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
    hasDraggedPedal = true; // Mark that the pedal has actually moved
    let dx = (e.clientX - startMouseX) / state.zoom;
    let dy = (e.clientY - startMouseY) / state.zoom;
    draggingEl.style.left = (startElLeft + dx) + 'px';
    draggingEl.style.top = (startElTop + dy) + 'px';
});

document.addEventListener('mouseup', (e) => {
    if (draggingEl && dragSource) {
        // If we just clicked (no drag), don't reparent or re-render!
        // This preserves the DOM element so the double-click event can fire properly.
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

function removePedal(instanceId) {
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

function updateOnCanvasSidebar() {
    const list = document.getElementById('on-canvas-list');
    if (!list) return;
    list.innerHTML = '';
    let totalCount = 0;

    state.placedBoards.forEach(board => {
        const li = document.createElement('li');
        li.className = 'board-list-item';
        if (state.selectedBoardId === board.id) { li.style.borderLeftColor = '#2a9fd6'; li.style.backgroundColor = '#444'; }

        li.innerHTML = `
        <div class="board-list-item-header">
            <strong>${board.name}</strong> 
            <button class="remove-btn" onclick="event.stopPropagation(); removeBoardFromCanvas('${board.id}')">✕</button>
        </div>`;

        li.onclick = () => { state.selectedBoardId = board.id; renderBoards(); };

        const ul = document.createElement('ul');
        ul.className = 'pedal-sub-list';

        board.pedals.forEach(p => {
            totalCount++;
            const pData = state.pedals.find(pd => pd.id === p.pedalId);
            if(pData) {
                const pli = document.createElement('li');
                pli.className = 'pedal-sub-item';
                pli.innerHTML = `<span>↳ ${pData.brand} ${pData.name}</span> <button class="remove-btn" onclick="event.stopPropagation(); removePedal('${p.instanceId}')">✕</button>`;
                ul.appendChild(pli);
            }
        });

        li.appendChild(ul);
        list.appendChild(li);
    });

    if (state.canvasPedals.length > 0) {
        const li = document.createElement('li');
        li.className = 'board-list-item';
        li.innerHTML = `<strong>Boardless Area</strong>`;
        li.style.cursor = 'default';

        const ul = document.createElement('ul');
        ul.className = 'pedal-sub-list';

        state.canvasPedals.forEach(p => {
            totalCount++;
            const pData = state.pedals.find(pd => pd.id === p.pedalId);
            if(pData) {
                const pli = document.createElement('li');
                pli.className = 'pedal-sub-item';
                pli.innerHTML = `<span>↳ ${pData.brand} ${pData.name}</span> <button class="remove-btn" onclick="event.stopPropagation(); removePedal('${p.instanceId}')">✕</button>`;
                ul.appendChild(pli);
            }
        });
        li.appendChild(ul);
        list.appendChild(li);
    }
    document.getElementById('pedal-count').innerText = totalCount;
}

// --- STORAGE ---
function saveToLocalStorage() {
    localStorage.setItem('pedalboard_v4_state', JSON.stringify({
        selectedBoardId: state.selectedBoardId,
        placedBoards: state.placedBoards,
        canvasPedals: state.canvasPedals,
        panX: state.panX,
        panY: state.panY,
        zoom: state.zoom
    }));
}

function loadFromLocalStorage() {
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

window.addEventListener('DOMContentLoaded', init);

// --- BG SHADE AND FIT LOGIC ---
const CANVAS_SHADES = [
    { name: "Light Silver", color: "#ededed" }, { name: "Soft Stone", color: "#c7c7c7" },
    { name: "Mid Grey", color: "#8a8a8a" }, { name: "Slate", color: "#44474a" }, { name: "Deep Charcoal", color: "#18191b" }
];
function setupBgShadeSelector() {
    const selector = document.getElementById('bg-shade-selector');
    if (!selector) return;
    const saved = localStorage.getItem('pedalboard_bg_shade');
    let current = saved || CANVAS_SHADES[0].color;
    CANVAS_SHADES.forEach(shade => {
        const swatch = document.createElement('div');
        swatch.className = 'bg-shade' + (current === shade.color ? ' selected' : '');
        swatch.style.background = shade.color;
        swatch.onclick = () => {
            document.querySelectorAll('.bg-shade').forEach(el => el.classList.remove('selected'));
            swatch.classList.add('selected');
            setCanvasBgShade(shade.color);
            localStorage.setItem('pedalboard_bg_shade', shade.color);
        };
        selector.appendChild(swatch);
    });
    setCanvasBgShade(current);
}
function setCanvasBgShade(color) { document.getElementById('canvas-container').style.backgroundColor = color; }
window.addEventListener('DOMContentLoaded', setupBgShadeSelector);
