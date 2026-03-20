/**
 * Shared autosave logic used by both App.jsx (debounced) and WorkspacePanel /
 * Header (immediate flush before switching notebooks).
 */
import useCellStore from '../store/useCellStore.js'
import useNotebookStore from '../store/useNotebookStore.js'
import { getFileHandle } from './fileHandleStore.js'

/**
 * Immediately persists the current notebook to all applicable destinations
 * without waiting for the 2-second debounce.  Call this before opening a
 * different notebook so the current one is fully on disk first.
 */
export async function flushAutosave() {
    const snapshot = useCellStore.getState().getSnapshot()
    const state = useNotebookStore.getState()

    // Always write the server-side draft
    state.saveDraft(snapshot)

    // Workspace file takes priority
    if (state.workspaceFile) {
        await state.saveWorkspace(snapshot)
        return
    }

    // File System Access API handle
    const fh = getFileHandle()
    if (fh) {
        try {
            const data = state.buildNotebook(snapshot)
            const writable = await fh.createWritable()
            await writable.write(JSON.stringify(data, null, 2))
            await writable.close()
            state.markSaved()
        } catch (e) {
            console.warn('[autosave] flush failed:', e.message)
        }
    }
}
