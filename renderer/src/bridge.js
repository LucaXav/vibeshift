/* The Electron IPC bridge exposed by preload.js as `window.pew`, or null when
 * running in a plain browser (the game degrades gracefully without it). */
export const bridge = window.pew || null;
