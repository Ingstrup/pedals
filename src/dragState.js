// Shared flag so the canvas-level pan/pinch handler (gestures.js) can stand
// down while an element (pedal or board) is being dragged.
let elementDragging = false;

export function setElementDragging(v) { elementDragging = v; }
export function isElementDragging() { return elementDragging; }
