import { state } from './state.js';

export const PEDAL_TYPES = ['drive', 'mod', 'delay', 'reverb', 'utility', 'other'];

// If a pedal's JSON doesn't carry a `Type` field, infer one from its name.
// Keep this list narrow — false positives are worse than a fallback to "other".
function inferType(rawType, name = '') {
    if (typeof rawType === 'string' && rawType.trim()) {
        const norm = rawType.toLowerCase().trim();
        if (PEDAL_TYPES.includes(norm)) return norm;
        if (/(overdrive|distortion|fuzz|boost)/.test(norm)) return 'drive';
        if (/(chorus|flanger|phaser|tremolo|vibrato|rotary|modulation)/.test(norm)) return 'mod';
    }
    const n = name.toLowerCase();
    if (/\b(od|drive|overdrive|distortion|fuzz|boost|gain)\b/.test(n)) return 'drive';
    if (/\b(chorus|flanger|phaser|tremolo|trem|vibe|vibrato|leslie|rotary)\b/.test(n)) return 'mod';
    if (/\b(delay|echo)\b/.test(n)) return 'delay';
    if (/\b(reverb|verb|hall|plate|spring)\b/.test(n)) return 'reverb';
    if (/\b(tuner|buffer|loop|looper|switcher|volume|noise gate|gate)\b/.test(n)) return 'utility';
    return 'other';
}

function normalizePedals(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(p => {
        const brand = (p.Brand || 'unk').toLowerCase().replace(/[^a-z0-9]/g, '');
        const name = (p.Name || 'unk').toLowerCase().replace(/[^a-z0-9]/g, '');
        return {
            id: brand + '_' + name,
            name: p.Name || "Unknown",
            brand: p.Brand || "Unknown",
            type: inferType(p.Type, p.Name),
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
        const brand = b.brand || b.Brand || 'Unknown';
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
        return { id, name, brand, width, height, image };
    });
}

export async function loadData() {
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