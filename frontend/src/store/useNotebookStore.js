import { create } from 'zustand'

const STORAGE_KEY = 'sql-notebook:notebook'

function loadFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return null
        return JSON.parse(raw)
    } catch {
        return null
    }
}

function saveToStorage(data) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
        console.warn('Failed to save notebook to localStorage')
    }
}

const saved = loadFromStorage()

const useNotebookStore = create((set, get) => ({
    title:    saved?.title    ?? 'Untitled Notebook',
    savedAt:  saved?.savedAt  ?? null,
    isDirty:  false,

    setTitle: (title) => set({ title, isDirty: true }),

    save: (cellSnapshots) => {
        const { title } = get()
        const savedAt = new Date().toISOString()
        const data = { title, savedAt, cells: cellSnapshots }
        saveToStorage(data)
        set({ savedAt, isDirty: false })
        return data
    },

    load: () => {
        return loadFromStorage()
    },

    newNotebook: () => {
        localStorage.removeItem(STORAGE_KEY)
        set({ title: 'Untitled Notebook', savedAt: null, isDirty: false })
    },
}))

export default useNotebookStore