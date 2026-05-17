import { state } from './state.js';
import { addBoardToCanvas, addPedalToBoard, removeBoardFromCanvas, removePedal, renderBoards } from './canvas.js';

export let boardListManager = null;

export function setupCustomLists() {
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

    function createListManager(inputId, listId, data, formatText, searchKeys, onSelect, onHighlight) {
        const input = document.getElementById(inputId);
        const list = document.getElementById(listId);
        const nodes = [];
        let filteredNodes = [];
        let renderedCount = 0;
        let activeIndex = -1;
        const CHUNK_SIZE = 50;
        let observer = null;
        let sentinel = null;
        let savedScrollTop = 0; 

        list.addEventListener('scroll', () => {
            if (list.classList.contains('active')) savedScrollTop = list.scrollTop;
        }, { passive: true });

        data.forEach(item => {
            let text = formatText(item);
            let searchString = searchKeys.map(key => item[key] || '').join(' ').toLowerCase().replace(/[^a-z0-9\s]/g, '');
            nodes.push({ item, searchString, text, el: null });
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
                if (entries[0].isIntersecting && renderedCount < filteredNodes.length) renderNextChunk();
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
            const searchTerms = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(t => t);
            filteredNodes = nodes.filter(node => searchTerms.every(term => node.searchString.includes(term)));
            clearList();
            renderNextChunk();
            if (filteredNodes.length > 0 && text.trim() !== '') setHighlight(0, true);
            else { activeIndex = -1; if (onHighlight) onHighlight(null); }
        }

        function setHighlight(index, scroll = true) {
            if (filteredNodes.length === 0) return;
            if (activeIndex >= 0 && activeIndex < renderedCount && filteredNodes[activeIndex].el) filteredNodes[activeIndex].el.classList.remove('highlighted');
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
            setTimeout(() => { list.scrollTop = savedScrollTop; }, 0);
        });
        
        input.addEventListener('input', (e) => filterList(e.target.value));
        input.addEventListener('keydown', (e) => {
            if (!list.classList.contains('active')) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(activeIndex + 1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(activeIndex - 1); }
            else if (e.key === 'Enter') { e.preventDefault(); if (activeIndex >= 0 && activeIndex < renderedCount && filteredNodes[activeIndex].el) filteredNodes[activeIndex].el.onmousedown(e); }
            else if (e.key === 'Escape') { list.classList.remove('active'); input.blur(); if (onHighlight) onHighlight(null); }
        });

        list.addEventListener('mouseleave', () => {
            if (activeIndex >= 0 && activeIndex < renderedCount && filteredNodes[activeIndex].el) filteredNodes[activeIndex].el.classList.remove('highlighted');
            activeIndex = -1;
            if (onHighlight) onHighlight(null);
        });

        filterList('');
        return { addNode: (item) => {
            let text = formatText(item);
            let searchString = searchKeys.map(key => item[key] || '').join(' ').toLowerCase().replace(/[^a-z0-9\s]/g, '');
            nodes.push({ item, searchString, text, el: null });
            filterList(input.value || '');
        }};
    }

    boardListManager = createListManager(
        'board-search', 'board-list', state.boards,
        b => (b.brand && b.brand !== 'Unknown') ? `${b.brand} - ${b.name}` : b.name,
        ['brand', 'name'], 
        b => { addBoardToCanvas(b); },
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
        ['brand', 'name'], 
        p => { addPedalToBoard(p); },
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

export function updateBoardInfoPanel() {
    const panel = document.getElementById('board-info-panel');
    if (!state.selectedBoardId) { panel.style.display = 'none'; return; }
    const b = state.placedBoards.find(x => x.id === state.selectedBoardId);
    if (!b) { panel.style.display = 'none'; return; }
    
    panel.style.display = 'block';
    document.getElementById('info-name').textContent = b.name;
    const originalBoard = state.boardsById.get(b.id);
    document.getElementById('info-brand').textContent = originalBoard && originalBoard.brand ? originalBoard.brand : 'Custom/Misc';
    document.getElementById('info-size').textContent = `${(b.width/10).toFixed(1)} x ${(b.height/10).toFixed(1)} cm`;
}

export function updateOnCanvasSidebar() {
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
            <button class="remove-btn" onclick="event.stopPropagation(); window.removeBoardFromCanvasGlobal('${board.id}')">✕</button>
        </div>`;
    li.onclick = () => { state.selectedBoardId = board.id; renderBoards(); };
    
    const ul = document.createElement('ul');
    ul.className = 'pedal-sub-list';
    board.pedals.forEach(p => {
        totalCount++;
        const pData = state.pedalsById.get(p.pedalId);
        if(pData) {
            const pli = document.createElement('li');
            pli.className = 'pedal-sub-item';
            pli.innerHTML = `<span>↳ ${pData.brand} ${pData.name}</span> <button class="remove-btn" onclick="event.stopPropagation(); window.removePedalGlobal('${p.instanceId}')">✕</button>`;
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
        const pData = state.pedalsById.get(p.pedalId);
        if(pData) {
            const pli = document.createElement('li');
            pli.className = 'pedal-sub-item';
            pli.innerHTML = `<span>↳ ${pData.brand} ${pData.name}</span> <button class="remove-btn" onclick="event.stopPropagation(); window.removePedalGlobal('${p.instanceId}')">✕</button>`;
            ul.appendChild(pli);
        }
      });
      li.appendChild(ul);
      list.appendChild(li);
  }
  document.getElementById('pedal-count').innerText = totalCount;
}

const CANVAS_SHADES = [
    { name: "Light Silver", color: "#ededed" }, { name: "Soft Stone", color: "#c7c7c7" },
    { name: "Mid Grey", color: "#8a8a8a" }, { name: "Slate", color: "#44474a" }, { name: "Deep Charcoal", color: "#18191b" }
];

function setCanvasBgShade(color) { document.getElementById('canvas-container').style.backgroundColor = color; }

export function setupBgShadeSelector() {
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