import { state } from './state.js';

function normalizePedals(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(p => {
        const brand = (p.Brand || 'unk').toLowerCase().replace(/[^a-z0-9]/g, '');
        const name = (p.Name || 'unk').toLowerCase().replace(/[^a-z0-9]/g, '');
        return {
            id: brand + '_' + name,
            name: p.Name || 'Unknown',
            brand: p.Brand || 'Unknown',
            width: Math.round((p.Width || 2) * 25.4),
            height: Math.round((p.Height || 4) * 25.4),
            image: './data/images/pedals/' + (p.Image || ''),
        };
    });
}

function normalizeBoards(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(b => {
        const name = b.name || b.Name || 'Unnamed Board';
        const brand = b.brand || b.Brand || 'Unknown';
        const widthRaw = b.width !== undefined ? b.width : (b.Width !== undefined ? b.Width : 600);
        const heightRaw = b.height !== undefined ? b.height : (b.Height !== undefined ? b.Height : 300);
        const width = widthRaw < 100 ? Math.round(widthRaw * 25.4) : Math.round(widthRaw);
        const height = heightRaw < 100 ? Math.round(heightRaw * 25.4) : Math.round(heightRaw);
        const id = b.id || b.ID
            || (name + '_' + width + 'x' + height).toLowerCase().replace(/[^a-z0-9]/g, '_');
        let image = b.image || b.Image || undefined;
        if (image) {
            const filename = image.split(/[\\/]/).pop();
            image = './data/images/boards/' + filename;
        }
        return { id, name, brand, width, height, image };
    });
}

export async function loadData() {
    try {
        const [boardsRes, pedalsRes] = await Promise.all([
            fetch('./data/boards.json').catch(() => null),
            fetch('./data/pedals.json').catch(() => null),
        ]);
        if (boardsRes && boardsRes.ok) {
            try { state.boards = normalizeBoards(await boardsRes.json()); }
            catch (e) { console.error('boards.json parse error:', e); }
        }
        if (pedalsRes && pedalsRes.ok) {
            try { state.pedals = normalizePedals(await pedalsRes.json()); }
            catch (e) { console.error('pedals.json parse error:', e); }
        }
    } catch (e) {
        console.error('Fatal network error during loadData:', e);
    }
}
