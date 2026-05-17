// --- State & Config ---
const STATE_KEY = 'pb_minimal_state';
let state = {
    items: [], 
    panX: 0, panY: 0, zoom: 1,
    snapToGrid: false
};
let rawData = { boards: [], pedals: [] };
let searchCache = [];
let zIndexCounter = 10;
let spawnOffsetPedal = 0;
let previewTimer = null;

// --- DOM Elements ---
const DOM = {
    container: document.getElementById('canvas-container'),
    workspace: document.getElementById('workspace'),
    previewOverlay: document.getElementById('preview-overlay'),
    previewImg: document.getElementById('preview-img'),
    pedalSearch: document.getElementById('pedal-search'),
    searchResults: document.getElementById('search-results'),
    boardSelect: document.getElementById('board-select'),
    snapToggle: document.getElementById('snap-toggle'),
    onBoardCount: document.getElementById('on-board-count'),
    emptyState: document.getElementById('empty-state'),
    btnAddBoard: document.getElementById('btn-add-board')
};

// --- Initialization ---
async function init() {
    loadState();
    await loadData();
    setupEventListeners();
    renderWorkspace();
    updateUiState();
}

async function loadData() {
    try {
        const [boardsRes, pedalsRes] = await Promise.all([
            fetch('data/boards.json').catch(() => ({ ok: false })),
            fetch('data/pedals.json').catch(() => ({ ok: false }))
        ]);

        if (boardsRes.ok) rawData.boards = await boardsRes.json();
        if (pedalsRes.ok) rawData.pedals = await pedalsRes.json();

        // Populate board dropdown
        rawData.boards.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.id;
            opt.textContent = `${b.brand} ${b.name} (${b.width}x${b.height}cm)`;
            DOM.boardSelect.appendChild(opt);
        });

        // Cache pedal strings for fuzzy search
        searchCache = rawData.pedals.map(p => ({
            ...p,
            _searchTokens: `${p.brand} ${p.name}`.toLowerCase().replace(/-/g, '').split(/\s+/)
        }));
    } catch (e) {
        console.warn('Data missing or malformed.');
    }
}

// --- LocalStorage ---
function loadState() {
    const saved = localStorage.getItem(STATE_KEY);
    if (saved) {
        try {
            state = { ...state, ...JSON.parse(saved) };
            DOM.snapToggle.checked = state.snapToGrid;
        } catch (e) { console.error('Corrupt state'); }
    }
}

function saveState() {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    updateUiState();
}

// Update counters and empty states
function updateUiState() {
    const pedalCount = state.items.filter(i => !i.isBoard).length;
    DOM.onBoardCount.textContent = `On Board (${pedalCount})`;
    
    const hasBoard = state.items.some(i => i.isBoard);
    if (hasBoard || state.items.length > 0) {
        DOM.emptyState.classList.add('d-none');
        DOM.emptyState.classList.remove('d-flex');
    } else {
        DOM.emptyState.classList.remove('d-none');
        DOM.emptyState.classList.add('d-flex');
    }
}

// --- Canvas Mechanics ---
let isPanning = false, startPanX, startPanY;

function renderWorkspace() {
    DOM.workspace.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
    DOM.workspace.innerHTML = ''; 
    state.items.sort((a, b) => a.zIndex - b.zIndex).forEach(renderItem);
}

function updateWorkspaceTransform() {
    DOM.workspace.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
    saveState();
}

DOM.container.addEventListener('mousedown', (e) => {
    if (e.target === DOM.container || e.target === DOM.workspace) {
        isPanning = true;
        startPanX = e.clientX - state.panX;
        startPanY = e.clientY - state.panY;
    }
});

window.addEventListener('mousemove', (e) => {
    if (isPanning) {
        state.panX = e.clientX - startPanX;
        state.panY = e.clientY - startPanY;
        updateWorkspaceTransform();
    }
});

window.addEventListener('mouseup', () => isPanning = false);

DOM.container.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    state.zoom = Math.max(0.1, Math.min(state.zoom * zoomFactor, 3));
    updateWorkspaceTransform();
}, { passive: false });


// --- Items (Drag/Drop/Z-index/Delete) ---
function renderItem(itemData) {
    const el = document.createElement('div');
    el.className = `canvas-item ${itemData.isBoard ? 'canvas-board' : 'canvas-pedal'}`;
    el.style.width = `${itemData.width}px`;
    el.style.height = `${itemData.height}px`;
    el.style.left = `${itemData.x}px`;
    el.style.top = `${itemData.y}px`;
    el.style.zIndex = itemData.zIndex;
    if (itemData.src) el.style.backgroundImage = `url('${itemData.src}')`;
    el.dataset.uid = itemData.uid;

    el.addEventListener('mousedown', (e) => handleItemInteractionStart(e, itemData, el));
    
    // Double click to delete
    el.addEventListener('dblclick', () => {
        state.items = state.items.filter(i => i.uid !== itemData.uid);
        el.remove();
        saveState();
    });

    DOM.workspace.appendChild(el);
    if(itemData.zIndex > zIndexCounter) zIndexCounter = itemData.zIndex + 1;
}

let draggingEl = null, draggingItem = null;
let dragStartX, dragStartY, initialItemX, initialItemY;

function handleItemInteractionStart(e, itemData, el) {
    e.stopPropagation();
    
    draggingEl = el;
    draggingItem = itemData;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    initialItemX = itemData.x;
    initialItemY = itemData.y;
    
    itemData.zIndex = zIndexCounter++;
    el.style.zIndex = itemData.zIndex;
}

window.addEventListener('mousemove', (e) => {
    if (draggingEl && draggingItem) {
        const dx = (e.clientX - dragStartX) / state.zoom;
        const dy = (e.clientY - dragStartY) / state.zoom;
        draggingItem.x = initialItemX + dx;
        draggingItem.y = initialItemY + dy;
        draggingEl.style.left = `${draggingItem.x}px`;
        draggingEl.style.top = `${draggingItem.y}px`;
    }
});

window.addEventListener('mouseup', () => {
    if (draggingEl && draggingItem) {
        if (state.snapToGrid) { 
            draggingItem.x = Math.round(draggingItem.x / 10) * 10;
            draggingItem.y = Math.round(draggingItem.y / 10) * 10;
            draggingEl.style.left = `${draggingItem.x}px`;
            draggingEl.style.top = `${draggingItem.y}px`;
        }
        draggingEl = null;
        draggingItem = null;
        saveState();
    }
});

// --- Smart Spawning ---
function spawnItem(item) {
    const rect = DOM.container.getBoundingClientRect();
    const centerX = (rect.width / 2 - state.panX) / state.zoom;
    const centerY = (rect.height / 2 - state.panY) / state.zoom;
    const workspaceCenter = 5000; 

    item.uid = Date.now().toString() + Math.random();
    item.zIndex = zIndexCounter++;

    if (item.isBoard) {
        // Drop board exactly center
        item.x = workspaceCenter + centerX - (item.width / 2);
        item.y = workspaceCenter + centerY - (item.height / 2);
    } else {
        item.x = workspaceCenter + centerX - (item.width / 2) + spawnOffsetPedal;
        item.y = workspaceCenter + centerY - (item.height / 2) + spawnOffsetPedal;
        spawnOffsetPedal = (spawnOffsetPedal + 20) % 100;
    }

    state.items.push(item);
    renderItem(item);
    saveState();
}

// --- Search & UI Control ---
let currentSearchIndex = -1;
let currentResults = [];

function handleSearch(e) {
    const query = e.target.value.toLowerCase().replace(/-/g, '').trim();
    if (!query) {
        closeSearch();
        return;
    }

    const tokens = query.split(/\s+/).filter(Boolean);
    currentResults = searchCache.filter(p => tokens.every(token => p._searchTokens.some(pt => pt.includes(token)))).slice(0, 50);

    renderSearchResults();
    
    if (currentResults.length > 0) {
        currentSearchIndex = 0; 
        highlightSearchItem();
    } else {
        DOM.searchResults.innerHTML = '<li class="list-group-item disabled dark-input text-muted">No pedals found</li>';
        DOM.searchResults.classList.remove('d-none');
    }
}

function renderSearchResults() {
    DOM.searchResults.innerHTML = '';
    DOM.searchResults.classList.remove('d-none');
    
    currentResults.forEach((res, idx) => {
        const li = document.createElement('li');
        li.className = 'list-group-item search-item px-3 py-2';
        li.textContent = `${res.brand} - ${res.name}`;
        li.dataset.idx = idx;
        
        li.addEventListener('mouseenter', () => {
            currentSearchIndex = idx;
            highlightSearchItem();
            triggerPreview(`data/images/pedals/${res.image}`);
        });
        
        li.addEventListener('click', () => {
            addPedalFromData(res);
            closeSearch();
        });

        DOM.searchResults.appendChild(li);
    });
}

function highlightSearchItem() {
    Array.from(DOM.searchResults.children).forEach((li, idx) => {
        li.classList.toggle('active-item', idx === currentSearchIndex);
    });
    if(currentResults[currentSearchIndex]) {
        triggerPreview(`data/images/pedals/${currentResults[currentSearchIndex].image}`);
    }
}

function triggerPreview(src) {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
        DOM.previewImg.src = src;
        DOM.previewOverlay.classList.remove('d-none');
        DOM.previewOverlay.classList.add('d-flex');
    }, 100); 
}

function closeSearch() {
    DOM.searchResults.classList.add('d-none');
    DOM.pedalSearch.value = '';
    DOM.previewOverlay.classList.remove('d-flex');
    DOM.previewOverlay.classList.add('d-none');
    currentSearchIndex = -1;
    clearTimeout(previewTimer);
}

function addPedalFromData(pedalData) {
    spawnItem({
        isBoard: false,
        width: pedalData.width * 10,
        height: pedalData.height * 10,
        src: `data/images/pedals/${pedalData.image}`
    });
}

// --- Event Listeners ---
function setupEventListeners() {
    DOM.pedalSearch.addEventListener('input', handleSearch);
    
    DOM.pedalSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeSearch();
        if (DOM.searchResults.classList.contains('d-none')) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            currentSearchIndex = Math.min(currentSearchIndex + 1, currentResults.length - 1);
            highlightSearchItem();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            currentSearchIndex = Math.max(currentSearchIndex - 1, 0);
            highlightSearchItem();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (currentSearchIndex >= 0 && currentResults[currentSearchIndex]) {
                addPedalFromData(currentResults[currentSearchIndex]);
                closeSearch();
            }
        }
    });

    DOM.pedalSearch.addEventListener('blur', () => setTimeout(closeSearch, 200));

    document.getElementById('btn-nuke').addEventListener('click', () => {
        state.items = [];
        state.panX = 0; state.panY = 0; state.zoom = 1;
        renderWorkspace();
        saveState();
    });

    DOM.snapToggle.addEventListener('change', (e) => {
        state.snapToGrid = e.target.checked;
        saveState();
    });

    // Handle predefined board select drop down
    DOM.boardSelect.addEventListener('change', () => {
        const bId = DOM.boardSelect.value;
        const b = rawData.boards.find(x => x.id === bId);
        if (b) {
            spawnItem({
                isBoard: true,
                width: b.width * 10,
                height: b.height * 10,
                src: `data/images/boards/${b.image}`
            });
            DOM.boardSelect.value = ""; // reset after placing
        }
    });

    // Add Custom Board
    document.getElementById('btn-custom-board').addEventListener('click', () => {
        const w = parseFloat(document.getElementById('custom-board-w').value);
        const h = parseFloat(document.getElementById('custom-board-h').value);
        if (w > 0 && h > 0) {
            spawnItem({
                isBoard: true,
                width: w * 10,
                height: h * 10,
                src: '' 
            });
            // Clear inputs
            document.getElementById('custom-board-w').value = '';
            document.getElementById('custom-board-h').value = '';
        }
    });
}

// Start App
init();