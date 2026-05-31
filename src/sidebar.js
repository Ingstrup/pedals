import { state, SHADE_STORAGE_KEY } from './state.js';
import {
    addBoardToCanvas, addPedalToBoard,
    removeBoardFromCanvas, removePedal, renderBoards,
} from './canvas.js';

export let boardListManager = null;
export let pedalListManager = null;

const CHUNK_SIZE = 50;
const PREVIEW_DEBOUNCE_MS = 100;
const THUMB_PLACEHOLDER =
    'https://placehold.co/64x64/2a2d31/8a9095?text=%E2%99%AA';

/* ---------- generic high-perf list manager ---------- */

function createListManager({
    inputId, listId, data, formatText, searchKeys, onSelect, onHighlight,
}) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);

    const nodes = [];
    let filteredNodes = [];
    let renderedCount = 0;
    let activeIndex = -1;
    let observer = null;
    let sentinel = null;
    let savedScrollTop = 0;

    list.addEventListener('scroll', () => {
        if (list.classList.contains('active')) savedScrollTop = list.scrollTop;
    }, { passive: true });

    function buildNode(item) {
        const text = formatText(item);
        const searchString = searchKeys
            .map(key => item[key] || '')
            .join(' ')
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '');
        return { item, searchString, text, el: null };
    }

    data.forEach(item => nodes.push(buildNode(item)));

    // Single activation path used by both click/tap and the Enter key.
    function activateNode(nodeObj) {
        onSelect(nodeObj.item);
        list.classList.remove('active');
        input.blur();
        if (onHighlight) onHighlight(null);
        document.dispatchEvent(new CustomEvent('catalog-select'));
    }

    function createNodeEl(nodeObj) {
        if (nodeObj.el) return nodeObj.el;
        const div = document.createElement('div');
        div.className = 'list-item';

        const thumb = document.createElement('img');
        thumb.className = 'list-thumb';
        thumb.loading = 'lazy';
        thumb.alt = '';
        thumb.src = nodeObj.item.image || THUMB_PLACEHOLDER;
        thumb.addEventListener('error', () => {
            thumb.onerror = null;
            thumb.src = THUMB_PLACEHOLDER;
        });

        const label = document.createElement('span');
        label.className = 'list-label';
        label.textContent = nodeObj.text;

        div.appendChild(thumb);
        div.appendChild(label);

        // Click/tap activates (works for mouse and touch alike).
        div.addEventListener('click', (e) => {
            e.preventDefault();
            activateNode(nodeObj);
        });
        div.addEventListener('mouseenter', () => {
            // ignore hover while in keyboard-nav mode (REQ: avoid conflict)
            if (document.body.classList.contains('kbd-nav')) return;
            setHighlight(filteredNodes.indexOf(nodeObj), false);
        });
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
        const searchTerms = text.toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .split(/\s+/)
            .filter(t => t);
        filteredNodes = searchTerms.length === 0
            ? nodes.slice()
            : nodes.filter(node =>
                searchTerms.every(term => node.searchString.includes(term)));
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

    input.addEventListener('focus', () => {
        list.classList.add('active');
        input.select();
        // restore scroll depth after the browser flushes layout
        setTimeout(() => { list.scrollTop = savedScrollTop; }, 0);
    });

    input.addEventListener('input', (e) => filterList(e.target.value));

    input.addEventListener('keydown', (e) => {
        if (!list.classList.contains('active')) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            document.body.classList.add('kbd-nav');
            setHighlight(activeIndex + (e.key === 'ArrowDown' ? 1 : -1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIndex >= 0 && activeIndex < filteredNodes.length) {
                activateNode(filteredNodes[activeIndex]);
            }
        } else if (e.key === 'Escape') {
            list.classList.remove('active');
            input.blur();
            if (onHighlight) onHighlight(null);
        }
    });

    // Mouse motion re-enables hover focus
    list.addEventListener('mousemove', () => {
        document.body.classList.remove('kbd-nav');
    });

    list.addEventListener('mouseleave', () => {
        if (document.body.classList.contains('kbd-nav')) return;
        if (activeIndex >= 0 && activeIndex < renderedCount
            && filteredNodes[activeIndex].el) {
            filteredNodes[activeIndex].el.classList.remove('highlighted');
        }
        activeIndex = -1;
        if (onHighlight) onHighlight(null);
    });

    filterList('');

    return {
        addNode: (item) => {
            nodes.push(buildNode(item));
            filterList(input.value || '');
        },
    };
}

/* ---------- preview helpers ---------- */

function setupPreview() {
    const previewOverlay = document.getElementById('preview-overlay');
    const previewImg = document.getElementById('preview-image');
    const previewName = document.getElementById('preview-name');
    const previewDims = document.getElementById('board-preview-dimensions');

    let timer = null;

    function hide() {
        clearTimeout(timer);
        previewOverlay.classList.add('hidden');
        previewDims.classList.remove('visible');
    }

    function showPedal(p) {
        clearTimeout(timer);
        if (!p) return hide();
        timer = setTimeout(() => {
            previewImg.src = p.image;
            previewImg.classList.remove('hidden');
            previewName.textContent = p.name || 'Unnamed';
            previewDims.classList.remove('visible');
            previewOverlay.classList.remove('hidden');
        }, PREVIEW_DEBOUNCE_MS);
    }

    function showBoard(b) {
        clearTimeout(timer);
        if (!b) return hide();
        timer = setTimeout(() => {
            if (b.image) {
                previewImg.src = b.image;
                previewImg.classList.remove('hidden');
            } else {
                previewImg.src = '';
                previewImg.classList.add('hidden');
            }
            previewName.textContent = b.name || 'Unnamed Board';
            previewDims.textContent = `${(b.width / 10).toFixed(1)} × ${(b.height / 10).toFixed(1)} cm`;
            previewDims.classList.add('visible');
            previewOverlay.classList.remove('hidden');
        }, PREVIEW_DEBOUNCE_MS);
    }

    return { hide, showPedal, showBoard };
}

/* ---------- public setup ---------- */

export function setupCustomLists() {
    const preview = setupPreview();

    boardListManager = createListManager({
        inputId: 'board-search',
        listId: 'board-list',
        data: state.boards,
        formatText: b => (b.brand && b.brand !== 'Unknown')
            ? `${b.brand} — ${b.name}` : b.name,
        searchKeys: ['brand', 'name'],
        onSelect: (b) => addBoardToCanvas(b),
        onHighlight: (b) => preview.showBoard(b),
    });

    pedalListManager = createListManager({
        inputId: 'pedal-search',
        listId: 'pedal-list',
        data: state.pedals,
        formatText: p => `${p.brand} — ${p.name}`,
        searchKeys: ['brand', 'name'],
        onSelect: (p) => addPedalToBoard(p),
        onHighlight: (p) => preview.showPedal(p),
    });

    // Outside-click closes lists / hides preview
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#board-search') && !e.target.closest('#board-list')) {
            document.getElementById('board-list').classList.remove('active');
            preview.hide();
        }
        if (!e.target.closest('#pedal-search') && !e.target.closest('#pedal-list')) {
            document.getElementById('pedal-list').classList.remove('active');
            preview.hide();
        }
    });
}

/* ---------- info panel + on-canvas tree ---------- */

export function updateBoardInfoPanel() {
    const panel = document.getElementById('board-info-panel');
    if (!state.selectedBoardId) { panel.hidden = true; return; }
    const b = state.placedBoards.find(x => x.id === state.selectedBoardId);
    if (!b) { panel.hidden = true; return; }
    panel.hidden = false;
    document.getElementById('info-name').textContent = b.name;
    const originalBoard = state.boards.find(x => x.id === b.id);
    document.getElementById('info-brand').textContent =
        (originalBoard && originalBoard.brand) ? originalBoard.brand : 'Custom';
    document.getElementById('info-size').textContent =
        `${(b.width / 10).toFixed(1)} × ${(b.height / 10).toFixed(1)} cm`;
}

export function updateOnCanvasSidebar() {
    const list = document.getElementById('on-canvas-list');
    if (!list) return;
    list.innerHTML = '';
    let totalCount = 0;

    state.placedBoards.forEach(board => {
        const li = document.createElement('li');
        li.className = 'board-list-item';
        if (state.selectedBoardId === board.id) li.classList.add('selected');

        const header = document.createElement('div');
        header.className = 'board-list-item-header';
        const strong = document.createElement('strong');
        strong.textContent = board.name;
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.title = 'Remove this board';
        removeBtn.setAttribute('aria-label', `Remove ${board.name}`);
        removeBtn.innerHTML = '<i class="bi bi-x-lg"></i>';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeBoardFromCanvas(board.id);
        });
        header.appendChild(strong);
        header.appendChild(removeBtn);
        li.appendChild(header);

        li.addEventListener('click', () => {
            state.selectedBoardId = board.id;
            renderBoards();
        });

        const ul = document.createElement('ul');
        ul.className = 'pedal-sub-list';
        board.pedals.forEach(p => {
            totalCount++;
            const pData = state.pedals.find(pd => pd.id === p.pedalId);
            if (!pData) return;
            ul.appendChild(buildPedalSubItem(pData, p.instanceId));
        });
        li.appendChild(ul);
        list.appendChild(li);
    });

    if (state.canvasPedals.length > 0) {
        const li = document.createElement('li');
        li.className = 'board-list-item';
        li.style.cursor = 'default';
        const header = document.createElement('div');
        header.className = 'board-list-item-header';
        const strong = document.createElement('strong');
        strong.textContent = 'Boardless area';
        header.appendChild(strong);
        li.appendChild(header);

        const ul = document.createElement('ul');
        ul.className = 'pedal-sub-list';
        state.canvasPedals.forEach(p => {
            totalCount++;
            const pData = state.pedals.find(pd => pd.id === p.pedalId);
            if (!pData) return;
            ul.appendChild(buildPedalSubItem(pData, p.instanceId));
        });
        li.appendChild(ul);
        list.appendChild(li);
    }

    document.getElementById('pedal-count').textContent = totalCount;
}

function buildPedalSubItem(pData, instanceId) {
    const pli = document.createElement('li');
    pli.className = 'pedal-sub-item';
    const label = document.createElement('span');
    label.textContent = `↳ ${pData.brand} ${pData.name}`;
    const btn = document.createElement('button');
    btn.className = 'remove-btn';
    btn.title = 'Remove pedal';
    btn.setAttribute('aria-label', `Remove ${pData.name}`);
    btn.innerHTML = '<i class="bi bi-x-lg"></i>';
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removePedal(instanceId);
    });
    pli.appendChild(label);
    pli.appendChild(btn);
    return pli;
}

/* ---------- background shade selector ---------- */

const CANVAS_SHADES = [
    { name: 'Deep Charcoal', color: '#18191b' },
    { name: 'Slate',         color: '#44474a' },
    { name: 'Mid Grey',      color: '#8a8a8a' },
    { name: 'Soft Stone',    color: '#c7c7c7' },
    { name: 'Light Silver',  color: '#ededed' },
];

function setCanvasBgShade(color) {
    const c = document.getElementById('canvas-container');
    if (c) c.style.backgroundColor = color;
}

export function setupBgShadeSelector() {
    const selector = document.getElementById('bg-shade-selector');
    if (!selector) return;
    const saved = localStorage.getItem(SHADE_STORAGE_KEY);
    const current = saved || CANVAS_SHADES[0].color; // darkest default

    selector.innerHTML = '';
    CANVAS_SHADES.forEach(shade => {
        const swatch = document.createElement('div');
        swatch.className = 'bg-shade' + (current === shade.color ? ' selected' : '');
        swatch.style.background = shade.color;
        swatch.title = shade.name;
        swatch.dataset.shade = shade.color;
        swatch.addEventListener('click', () => {
            document.querySelectorAll('.bg-shade')
                .forEach(el => el.classList.remove('selected'));
            swatch.classList.add('selected');
            setCanvasBgShade(shade.color);
            localStorage.setItem(SHADE_STORAGE_KEY, shade.color);
        });
        selector.appendChild(swatch);
    });
    setCanvasBgShade(current);
}
