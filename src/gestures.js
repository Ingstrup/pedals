import { state } from './state.js';
import { updateTransform, ZOOM_MIN, ZOOM_MAX } from './canvas.js';
import { saveToLocalStorage } from './storage.js';
import { isElementDragging } from './dragState.js';

// Canvas-level pan (1 pointer) and pinch-zoom (2 pointers). Only pointers that
// land on the canvas BACKGROUND are tracked; pointers on a pedal or board are
// left to the element-drag handlers. While an element drag is in progress this
// handler stands down entirely (isElementDragging guard).
export function setupGestures() {
    const container = document.getElementById('canvas-container');
    const pointers = new Map(); // pointerId -> { x, y }

    function isBackground(target) {
        return target === container
            || (target.closest('#board-wrapper')
                && !target.closest('.pedal')
                && !target.closest('.placed-board'));
    }

    container.addEventListener('pointerdown', (e) => {
        if (isElementDragging()) return;
        if (!isBackground(e.target)) return;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        // Capture so we keep receiving move/up even if the finger leaves the box.
        try { container.setPointerCapture(e.pointerId); } catch { /* noop */ }
    });

    container.addEventListener('pointermove', (e) => {
        if (!pointers.has(e.pointerId)) return;
        const prev = pointers.get(e.pointerId);

        if (pointers.size === 1) {
            state.panX += e.clientX - prev.x;
            state.panY += e.clientY - prev.y;
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            updateTransform();
            return;
        }

        if (pointers.size === 2) {
            let other = null;
            for (const [id, pt] of pointers) {
                if (id !== e.pointerId) { other = pt; break; }
            }
            const rect = container.getBoundingClientRect();
            const prevDist = Math.hypot(prev.x - other.x, prev.y - other.y);
            const currDist = Math.hypot(e.clientX - other.x, e.clientY - other.y);
            const prevMidX = (prev.x + other.x) / 2;
            const prevMidY = (prev.y + other.y) / 2;
            const currMidX = (e.clientX + other.x) / 2;
            const currMidY = (e.clientY + other.y) / 2;

            if (prevDist > 0) {
                const newZoom = Math.max(
                    ZOOM_MIN,
                    Math.min(state.zoom * (currDist / prevDist), ZOOM_MAX),
                );
                // Keep the pinch midpoint anchored while scaling.
                const originX = currMidX - rect.left;
                const originY = currMidY - rect.top;
                state.panX = originX - (originX - state.panX) * (newZoom / state.zoom);
                state.panY = originY - (originY - state.panY) * (newZoom / state.zoom);
                state.zoom = newZoom;
            }
            // Pan by midpoint travel (two-finger drag).
            state.panX += currMidX - prevMidX;
            state.panY += currMidY - prevMidY;

            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            updateTransform();
        }
    });

    function release(e) {
        if (!pointers.has(e.pointerId)) return;
        pointers.delete(e.pointerId);
        try { container.releasePointerCapture(e.pointerId); } catch { /* noop */ }
        if (pointers.size === 0) saveToLocalStorage();
    }

    container.addEventListener('pointerup', release);
    container.addEventListener('pointercancel', release);

    suppressBrowserZoom();
}

// iOS Safari ignores `user-scalable=no`, so the browser's own pinch-zoom leaks
// through. These proprietary gesture events drive that zoom — cancelling them
// keeps zoom under our control. (Double-tap-zoom is handled separately via
// `touch-action: manipulation` in CSS, which doesn't break fast taps.)
function suppressBrowserZoom() {
    ['gesturestart', 'gesturechange', 'gestureend'].forEach((type) => {
        document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
    });
}
