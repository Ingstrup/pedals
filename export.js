import { state } from './state.js';

function computeBoundingBox() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let count = 0;
    state.placedBoards.forEach(b => {
        minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height);
        count++;
    });
    state.canvasPedals.forEach(p => {
        const pData = state.pedals.find(pd => pd.id === p.pedalId);
        const w = pData ? pData.width : 50;
        const h = pData ? pData.height : 100;
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x + w); maxY = Math.max(maxY, p.y + h);
        count++;
    });
    if (count === 0) return null;
    return { minX, minY, maxX, maxY };
}

function loadImage(src) {
    return new Promise((resolve) => {
        if (!src) { resolve(null); return; }
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

function drawPedal(ctx, pedalData, placed) {
    const cx = placed.x + pedalData.width / 2;
    const cy = placed.y + pedalData.height / 2;
    const rotation = (placed.rotation || 0) * Math.PI / 180;
    ctx.save();
    ctx.translate(cx, cy);
    if (rotation) ctx.rotate(rotation);
    if (pedalData._img) {
        ctx.drawImage(pedalData._img, -pedalData.width / 2, -pedalData.height / 2, pedalData.width, pedalData.height);
    } else {
        ctx.fillStyle = '#444';
        ctx.fillRect(-pedalData.width / 2, -pedalData.height / 2, pedalData.width, pedalData.height);
        ctx.fillStyle = '#fff';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pedalData.name || 'Pedal', 0, 0);
    }
    ctx.restore();
}

export async function exportCanvasToPng({ scale = 2, margin = 40 } = {}) {
    const bbox = computeBoundingBox();
    if (!bbox) {
        alert('Nothing on the canvas to export.');
        return;
    }

    // Preload all images once. Cache on the pedal/board object as `_img`.
    const uniqueBoards = state.placedBoards;
    const uniquePedals = new Map();
    state.placedBoards.forEach(b => b.pedals.forEach(p => {
        const pd = state.pedals.find(pp => pp.id === p.pedalId);
        if (pd && !uniquePedals.has(pd.id)) uniquePedals.set(pd.id, pd);
    }));
    state.canvasPedals.forEach(p => {
        const pd = state.pedals.find(pp => pp.id === p.pedalId);
        if (pd && !uniquePedals.has(pd.id)) uniquePedals.set(pd.id, pd);
    });

    await Promise.all([
        ...uniqueBoards.map(async b => { b._img = b.image ? await loadImage(b.image) : null; }),
        ...[...uniquePedals.values()].map(async pd => { pd._img = pd.image ? await loadImage(pd.image) : null; })
    ]);

    const worldW = (bbox.maxX - bbox.minX) + margin * 2;
    const worldH = (bbox.maxY - bbox.minY) + margin * 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(worldW * scale);
    canvas.height = Math.round(worldH * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.translate(-bbox.minX + margin, -bbox.minY + margin);

    // White background so the result is print-friendly.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.scale(scale, scale);
    ctx.translate(-bbox.minX + margin, -bbox.minY + margin);

    // Boards first, in placed order.
    state.placedBoards.forEach(board => {
        if (board._img) {
            ctx.drawImage(board._img, board.x, board.y, board.width, board.height);
        } else {
            ctx.fillStyle = '#d0d0d0';
            ctx.fillRect(board.x, board.y, board.width, board.height);
            ctx.strokeStyle = '#888';
            ctx.lineWidth = 1;
            ctx.strokeRect(board.x, board.y, board.width, board.height);
        }
        // Board pedals.
        board.pedals.forEach(p => {
            const pd = uniquePedals.get(p.pedalId);
            if (!pd) return;
            drawPedal(ctx, pd, { x: board.x + p.x, y: board.y + p.y, rotation: p.rotation || 0 });
        });
    });

    // Boardless pedals on top.
    state.canvasPedals.forEach(p => {
        const pd = uniquePedals.get(p.pedalId);
        if (!pd) return;
        drawPedal(ctx, pd, p);
    });

    // Clean up cached image references so they can be GC'd.
    uniqueBoards.forEach(b => { delete b._img; });
    [...uniquePedals.values()].forEach(pd => { delete pd._img; });

    canvas.toBlob((blob) => {
        if (!blob) { alert('Could not produce PNG.'); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'pedalboard.png';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    }, 'image/png');
}
