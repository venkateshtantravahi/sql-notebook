import { create } from 'zustand'
import cellToolbar from "../components/cell/CellToolbar.jsx";

// Draft payload shape sent to POST /draft
// {
// version: '1',
// title: string,
// savedAt: ISO string,
// cells: [{ id, query, namespace }]
// }

async function postDraft(title, cellSnapshots) {
    const body = {
        version: '1',
        title,
        savedAt: new Date().toISOString(),
        cells: cellSnapshots,
    }

    try {
        const res = await fetch('/draft', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body),
        })
        if (!res.ok) {
            console.warn('[draft] POST /draft failed:', res.status)
        }
    } catch (e) {
        console.warn('[draft] Could not reach backend to save draft:', e.message)
    }
}

const useNotebookStore = create((set, get) => ({
    title: 'Untitled Notebook',
    savedAt: null,
    isDirty: false,

    setTitle: (title) => set({ title, isDirty: true}),

    // Called after a successful explicit file save
    // Marks the notebook clean and records the save timestamp
    markSaved: () => {
        set({ savedAt: new Date().toISOString(), isDirty: false})
    },

    // called by autosave subscriber in App.jsx with the current cell snapshot.
    // Posts to backed fire and forget, errors are logged not thrown.
    saveDraft:(cellSnapshots) => {
        const { title } = get()
        postDraft(title, cellSnapshots)
        // Mark dirty = false only after successful write would be ideal but since
        // postDraft is async fire-and-forget we optimistically clear it here.
        // The blue dot will reappear on the next cell change anyway.
        set({ isDirty: false })
    },

    // Resets Store to blank and posts an empty draft to disk so the next
    // reload starts fresh rather than restoring the old notebook.
    newNotebook: (cellSnapshots = []) => {
        set({ title: 'Untitled Notebook', savedAt: null, isDirty: false })
        postDraft('Untitled Notebook', cellSnapshots)
    },

    // Called on app init after GET /draft returns a title
    restoreTitle: (title) => {
        if (title) set({ title })
    },
}))

export default useNotebookStore