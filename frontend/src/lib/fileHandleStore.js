/**
 * Module-level singleton for the File System Access API file handle.
 * Shared between Header.jsx (which sets it on open/saveAs) and App.jsx
 * (which reads it during autosave).  Not React state – just a plain JS ref
 * so there is no subscription overhead and no stale-closure risk.
 */
let _handle = null

export const getFileHandle = () => _handle
export const setFileHandle = (handle) => {
    _handle = handle
}
export const clearFileHandle = () => {
    _handle = null
}
