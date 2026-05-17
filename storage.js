import { state } from './state.js';
import { updateTransform, renderBoards } from './canvas.js';

const SCENES_KEY = 'pedalboard_v4_scenes';
const LEGACY_STATE_KEY = 'pedalboard_v4_state';
const DEFAULT_SCENE = 'Default';

function snapshot() {
    return {
        selectedBoardId: state.selectedBoardId,
        placedBoards: state.placedBoards,
        canvasPedals: state.canvasPedals,
        panX: state.panX,
        panY: state.panY,
        zoom: state.zoom
    };
}

function apply(parsed) {
    if (parsed.zoom !== undefined) state.zoom = parsed.zoom;
    if (parsed.panX !== undefined) state.panX = parsed.panX;
    if (parsed.panY !== undefined) state.panY = parsed.panY;
    state.placedBoards = parsed.placedBoards || [];
    state.canvasPedals = parsed.canvasPedals || [];
    state.selectedBoardId = parsed.selectedBoardId || null;
}

function readScenes() {
    try {
        const raw = localStorage.getItem(SCENES_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.scenes && parsed.current) return parsed;
        }
    } catch {}
    // First run, or corrupt. Try to migrate the legacy single-scene store.
    let initial = {};
    try {
        const legacy = localStorage.getItem(LEGACY_STATE_KEY);
        if (legacy) initial = JSON.parse(legacy) || {};
    } catch {}
    const migrated = { current: DEFAULT_SCENE, scenes: { [DEFAULT_SCENE]: initial } };
    localStorage.setItem(SCENES_KEY, JSON.stringify(migrated));
    if (localStorage.getItem(LEGACY_STATE_KEY)) localStorage.removeItem(LEGACY_STATE_KEY);
    return migrated;
}

function writeScenes(scenes) {
    localStorage.setItem(SCENES_KEY, JSON.stringify(scenes));
}

export function saveToLocalStorage() {
    const scenes = readScenes();
    scenes.scenes[scenes.current] = snapshot();
    writeScenes(scenes);
}

export function loadFromLocalStorage() {
    try {
        const scenes = readScenes();
        const data = scenes.scenes[scenes.current];
        if (data) {
            apply(data);
            updateTransform();
            renderBoards();
        }
    } catch (e) {
        console.error("Save data corrupted. Resetting.");
        localStorage.removeItem(SCENES_KEY);
    }
}

// --- Scene management ---

export function listSceneNames() {
    return Object.keys(readScenes().scenes);
}

export function getCurrentSceneName() {
    return readScenes().current;
}

export function switchToScene(name) {
    const scenes = readScenes();
    if (!scenes.scenes[name]) return false;
    // Persist the current scene first so unsaved tweaks don't disappear.
    scenes.scenes[scenes.current] = snapshot();
    scenes.current = name;
    writeScenes(scenes);
    apply(scenes.scenes[name]);
    updateTransform();
    renderBoards();
    return true;
}

export function createScene(name) {
    const scenes = readScenes();
    if (scenes.scenes[name]) return false;
    // Save current first so we leave it in a known state.
    scenes.scenes[scenes.current] = snapshot();
    scenes.scenes[name] = { selectedBoardId: null, placedBoards: [], canvasPedals: [], panX: 0, panY: 0, zoom: 1 };
    scenes.current = name;
    writeScenes(scenes);
    apply(scenes.scenes[name]);
    updateTransform();
    renderBoards();
    return true;
}