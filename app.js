// --- APP STATE ---
const state = {
    selectedBoard: null,
    pedals: [],
    boards: [],
    placedPedals: [],
    zoom: 1,
    panX: 0,
    panY: 0
};

// Converts the JSON schema to app schema
function normalizePedals(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(p => ({
        id: ((p.Brand || 'unk') + '_' + (p.Name || 'unk')).toLowerCase().replace(/[^a-z0-9]/g, '_'),
        name: p.Name || "Unknown",
        brand: p.Brand || "Unknown",
        width: Math.round((p.Width || 2) * 25.4),
        height: Math.round((p.Height || 4) * 25.4),
        // Updated to match your new folder structure
        image: './data/images/pedals/' + p.Image
    }));
}

// --- INITIALIZATION ---
async function init() {
    await loadData();
    setupCustomLists();
    setupEventListeners();
    setupBoardPanning();

    const container = document.getElementById('canvas-container');
    state.panX = container.clientWidth / 2 - 200;
    state.panY = container.clientHeight / 2 - 100;
    updateTransform();

    loadFromLocalStorage();
}

async function loadData() {
    try {
        const [boardsRes, pedalsRes] = await Promise.all([
            fetch('./data/boards.json').catch(err => null),
            fetch('./data/pedals.json').catch(err => null)
        ]);

        if (boardsRes && boardsRes.ok) state.boards = await boardsRes.json();
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

    // Reusable factory for highly performant lists
    function createListManager(inputId, listId, data, formatText, onSelect, onHighlight) {
        const input = document.getElementById(inputId);
        const list = document.getElementById(listId);

        const nodes = [];
        let visibleNodes = [];
        let activeIndex = -1;

        // Build the DOM once
        function addNode(item) {
            const div = document.createElement('div');
            div.className = 'list-item';
            const text = formatText(item);
            div.innerText = text;

            const nodeObj = {
                el: div,
                item: item,
                // CACHE THE TEXT IN MEMORY! No more reading from the DOM!
                searchString: text.toLowerCase().replace(/-/g, '')
            };

            // Using mousedown prevents the input from stealing focus and hiding the list too early
            div.onmousedown = (e) => {
                e.preventDefault();
                onSelect(item);
                list.classList.remove('active');
                input.blur();
                if (onHighlight) onHighlight(null);
            };

            div.addEventListener('mouseenter', () => setHighlight(visibleNodes.indexOf(nodeObj), false));

            list.appendChild(div);
            nodes.push(nodeObj);
        }

        data.forEach(addNode);

        // Blazing fast memory-only filter with Fuzzy Search and Auto-Highlight
        function filterList(text) {
            const searchTerms = text.toLowerCase().replace(/-/g, '').split(' ').filter(t => t.trim() !== '');

            visibleNodes = [];
            let count = 0;

            nodes.forEach(node => {
                node.el.classList.remove('highlighted');

                // Compare against the cached string in memory (Instantaneous)
                const matches = searchTerms.every(term => node.searchString.includes(term));

                // Hard cap at 50 to keep the DOM blazing fast
                if ((searchTerms.length === 0 || matches) && count < 50) {
                    node.el.style.display = '';
                    visibleNodes.push(node);
                    count++;
                } else {
                    node.el.style.display = 'none';
                }
            });

            list.scrollTop = 0; // Reset scroll on new search

            // Auto-highlight the top result if typing
            if (visibleNodes.length > 0 && text.trim() !== '') {
                setHighlight(0, true);
            } else {
                activeIndex = -1;
                if (onHighlight) onHighlight(null);
            }
        }

        // Handles keyboard & mouse hovering
        function setHighlight(index, scroll = true) {
            if (visibleNodes.length === 0) return;
            if (activeIndex >= 0 && activeIndex < visibleNodes.length) {
                visibleNodes[activeIndex].el.classList.remove('highlighted');
            }

            activeIndex = index;
            if (activeIndex < 0) activeIndex = visibleNodes.length - 1;
            if (activeIndex >= visibleNodes.length) activeIndex = 0;

            const activeNode = visibleNodes[activeIndex];
            activeNode.el.classList.add('highlighted');

            if (scroll) activeNode.el.scrollIntoView({ block: 'nearest' });
            if (onHighlight) onHighlight(activeNode.item);
        }

        input.addEventListener('focus', () => {
            list.classList.add('active');
            input.value = '';
            filterList('');
        });

        input.addEventListener('input', (e) => filterList(e.target.value));

        // Keyboard Navigation
        input.addEventListener('keydown', (e) => {
            if (!list.classList.contains('active')) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlight(activeIndex + 1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlight(activeIndex - 1);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (activeIndex >= 0 && activeIndex < visibleNodes.length) {
                    visibleNodes[activeIndex].el.onmousedown(e);
                }
            } else if (e.key === 'Escape') {
                list.classList.remove('active');
                input.blur();
                if (onHighlight) onHighlight(null);
            }
        });

        // Hide preview if mouse leaves the list completely
        list.addEventListener('mouseleave', () => {
            if (activeIndex >= 0 && activeIndex < visibleNodes.length) {
                visibleNodes[activeIndex].el.classList.remove('highlighted');
            }
            activeIndex = -1;
            if (onHighlight) onHighlight(null);
        });

        return { addNode };
    }

    // Initialize Board List
    boardListManager = createListManager(
        'board-search', 'board-list', state.boards,
        b => b.name,
        b => { setBoard(b); document.getElementById('board-search').value = b.name; }
    );

    let previewTimeout; // The magic debouncer!

    // Initialize Pedal List with full scrolling and previews
    createListManager(
        'pedal-search', 'pedal-list', state.pedals,
        p => `${p.brand} - ${p.name}`,
        p => { addPedalToBoard(p); document.getElementById('pedal-search').value = ''; },
        p => {
            clearTimeout(previewTimeout); // Cancel previous load request
            if (p) {
                // Wait 100ms before doing the heavy lifting
                previewTimeout = setTimeout(() => {
                    previewImg.src = p.image;
                    previewName.innerText = p.name;
                    previewOverlay.classList.remove('hidden');
                }, 100);
            } else {
                previewOverlay.classList.add('hidden');
            }
        }
    );

    // Close lists if clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#board-search') && !e.target.closest('#board-list')) {
            document.getElementById('board-list').classList.remove('active');
        }
        if (!e.target.closest('#pedal-search') && !e.target.closest('#pedal-list')) {
            document.getElementById('pedal-list').classList.remove('active');
            previewOverlay.classList.add('hidden');
        }
    });
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    document.getElementById('custom-board-btn').addEventListener('click', () => {
        const w = parseFloat(document.getElementById('custom-w').value);
        const h = parseFloat(document.getElementById('custom-h').value);
        if (w > 0 && h > 0) {
            const customBoard = { id: 'custom_' + Date.now(), name: `Custom (${w}x${h} cm)`, width: w * 10, height: h * 10 };
            state.boards.push(customBoard);
            boardListManager.addNode(customBoard); // Inject new board into the UI list
            setBoard(customBoard);
            document.getElementById('board-search').value = customBoard.name;
            document.getElementById('board-list').classList.remove('active');
        } else {
            alert("Please enter valid dimensions in cm.");
        }
    });

    document.getElementById('clear-board-btn').addEventListener('click', clearPedals);

    document.getElementById('canvas-container').addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
        state.zoom = Math.max(0.2, Math.min(state.zoom * zoomDelta, 3));
        updateTransform();
        saveToLocalStorage();
    }, {passive: false});
}

// --- BOARD LOGIC ---
function setBoard(board) {
    state.selectedBoard = board;
    const boardEl = document.getElementById('board');
    if (board) {
        boardEl.classList.remove('empty-board');
        boardEl.style.width = board.width + 'px';
        boardEl.style.height = board.height + 'px';
        boardEl.innerHTML = '';
    } else {
        boardEl.classList.add('empty-board');
        boardEl.style.width = '';
        boardEl.style.height = '';
        boardEl.innerHTML = '<span class="board-placeholder">Select or create a board</span>';
    }
    renderPlacedPedals();
    saveToLocalStorage();
}

function setupBoardPanning() {
    let isPanning = false;
    let startX, startY;
    const container = document.getElementById('canvas-container');

    container.addEventListener('mousedown', (e) => {
        if (e.target === container || (e.target.closest('#board') && !e.target.closest('.pedal'))) {
            isPanning = true;
            startX = e.clientX - state.panX;
            startY = e.clientY - state.panY;
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        state.panX = e.clientX - startX;
        state.panY = e.clientY - startY;
        updateTransform();
    });

    window.addEventListener('mouseup', () => {
        if (isPanning) {
            isPanning = false;
            saveToLocalStorage();
        }
    });
}

function updateTransform() {
    document.getElementById('board-wrapper').style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
}

// --- PEDAL RENDERING ---
let highestZ = 10;

function renderPlacedPedals() {
    const boardEl = document.getElementById('board');
    Array.from(boardEl.querySelectorAll('.pedal')).forEach(el => el.remove());

    state.placedPedals.forEach(p => {
        const pedalData = state.pedals.find(pd => pd.id === p.pedalId);
        if (pedalData) renderPedalDOM(pedalData, p.x, p.y, p.instanceId);
    });
    updateSidebarList();
}

function addPedalToBoard(pedalData, savedX = null, savedY = null, instanceId = null) {
    const id = instanceId || `pedal_${Date.now()}_${Math.floor(Math.random()*1000)}`;

    let boardW = state.selectedBoard ? state.selectedBoard.width : document.getElementById('canvas-container').clientWidth;
    let boardH = state.selectedBoard ? state.selectedBoard.height : document.getElementById('canvas-container').clientHeight;

    const x = savedX !== null ? savedX : (boardW / 2) - (pedalData.width / 2);
    const y = savedY !== null ? savedY : (boardH / 2) - (pedalData.height / 2);

    if(!instanceId) {
        state.placedPedals.push({ instanceId: id, pedalId: pedalData.id, x, y });
        saveToLocalStorage();
    }
    renderPedalDOM(pedalData, x, y, id);
    updateSidebarList();
}

function renderPedalDOM(pedalData, x, y, id) {
    const el = document.createElement('div');
    el.className = 'pedal';
    el.id = id;
    el.style.width = pedalData.width + 'px';
    el.style.height = pedalData.height + 'px';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.zIndex = ++highestZ;

    const shortName = pedalData.name ? pedalData.name.split(' ')[0] : 'Pedal';
    el.innerHTML = `<img src="${pedalData.image}" draggable="false" onerror="this.src='https://placehold.co/${pedalData.width}x${pedalData.height}/444/fff?text=${shortName}'">`;

    el.addEventListener('dblclick', () => removePedal(id));
    el.addEventListener('mousedown', () => el.style.zIndex = ++highestZ);

    document.getElementById('board').appendChild(el);
}

// --- DRAG AND DROP ---
let draggingEl = null;
let startMouseX, startMouseY, startElLeft, startElTop;

document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const pedalEl = e.target.closest('.pedal');
    if (pedalEl) {
        draggingEl = pedalEl;
        startMouseX = e.clientX;
        startMouseY = e.clientY;
        startElLeft = parseFloat(draggingEl.style.left || 0);
        startElTop = parseFloat(draggingEl.style.top || 0);
    }
});

document.addEventListener('mousemove', (e) => {
    if (!draggingEl) return;

    let dx = (e.clientX - startMouseX) / state.zoom;
    let dy = (e.clientY - startMouseY) / state.zoom;
    let newLeft = startElLeft + dx;
    let newTop = startElTop + dy;

    if (document.getElementById('snap-grid').checked) {
        newLeft = Math.round(newLeft / 10) * 10;
        newTop = Math.round(newTop / 10) * 10;
    }

    draggingEl.style.left = newLeft + 'px';
    draggingEl.style.top = newTop + 'px';
});

document.addEventListener('mouseup', () => {
    if (draggingEl) {
        const pState = state.placedPedals.find(p => p.instanceId === draggingEl.id);
        if(pState) {
            pState.x = parseFloat(draggingEl.style.left);
            pState.y = parseFloat(draggingEl.style.top);
        }
        saveToLocalStorage();
        draggingEl = null;
    }
});

// --- UTILITIES ---
function removePedal(instanceId) {
    state.placedPedals = state.placedPedals.filter(p => p.instanceId !== instanceId);
    const el = document.getElementById(instanceId);
    if(el) el.remove();
    updateSidebarList();
    saveToLocalStorage();
}

function clearPedals() {
    state.placedPedals = [];
    Array.from(document.getElementById('board').querySelectorAll('.pedal')).forEach(el => el.remove());
    updateSidebarList();
    saveToLocalStorage();
}

function updateSidebarList() {
    const list = document.getElementById('placed-pedals-list');
    document.getElementById('pedal-count').innerText = state.placedPedals.length;
    list.innerHTML = '';
    state.placedPedals.forEach(p => {
        const pData = state.pedals.find(pd => pd.id === p.pedalId);
        if(pData) {
            const li = document.createElement('li');
            li.innerHTML = `<span>${pData.brand} - ${pData.name}</span><button class="remove-btn" onclick="removePedal('${p.instanceId}')">✕</button>`;
            list.appendChild(li);
        }
    });
}

// --- STORAGE ---
function saveToLocalStorage() {
    localStorage.setItem('pedalboard_v4_state', JSON.stringify({
        board: state.selectedBoard,
        placedPedals: state.placedPedals,
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
            updateTransform();

            if (parsed.board) {
                if (parsed.board.id && parsed.board.id.startsWith('custom_') && !state.boards.find(b => b.id === parsed.board.id)) {
                    state.boards.push(parsed.board);
                    if(boardListManager) boardListManager.addNode(parsed.board);
                }
                document.getElementById('board-search').value = parsed.board.name;
                setBoard(parsed.board);
            }

            state.placedPedals = parsed.placedPedals || [];
            renderPlacedPedals();
        }
    } catch (e) {
        console.error("Save data corrupted. Resetting.");
        localStorage.removeItem('pedalboard_v4_state');
    }
}

window.addEventListener('DOMContentLoaded', init);
