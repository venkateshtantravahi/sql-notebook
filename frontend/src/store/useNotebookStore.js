import { create } from 'zustand'

// ---------------------------------------------------------------------------
// Notebook ID generation
// ---------------------------------------------------------------------------

function makeNotebookId() {
    const arr = new Uint8Array(6)
    crypto.getRandomValues(arr)
    return (
        'nb_' +
        Array.from(arr)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')
    )
}

// ---------------------------------------------------------------------------
// v2 notebook format builder - used by both autosave and explicit save
// ---------------------------------------------------------------------------

export function buildV2Notebook({
    id,
    title,
    description,
    tags,
    defaultNamespace,
    createdAt,
    cells,
}) {
    return {
        format: { type: 'sqlnotebook', major: 2, minor: 0 },
        metadata: {
            id: id ?? makeNotebookId(),
            title: title ?? 'Untitled Notebook',
            description: description ?? '',
            created: createdAt ?? new Date().toISOString(),
            modified: new Date().toISOString(),
            tags: tags ?? [],
            defaultNamespace: defaultNamespace ?? null,
            generator: { app: 'sql-notebook', version: '0.5.0' },
        },
        cells: cells ?? [],
    }
}

// ---------------------------------------------------------------------------
// Draft POST (fire-and-forget)
// ---------------------------------------------------------------------------

async function postDraft(payload) {
    try {
        const res = await fetch('/draft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })
        if (!res.ok) console.warn('[draft] POST /draft failed:', res.status)
    } catch (e) {
        console.warn('[draft] Could not reach backend to save draft:', e.message)
    }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const useNotebookStore = create((set, get) => ({
    id: makeNotebookId(),
    title: 'Untitled Notebook',
    description: '',
    tags: [],
    defaultNamespace: null,
    createdAt: new Date().toISOString(),
    savedAt: null,
    isDirty: false,
    isSaving: false,
    workspaceFile: null,

    setTitle: (title) => set({ title, isDirty: true }),
    setDescription: (description) => set({ description, isDirty: true }),
    setTags: (tags) => set({ tags, isDirty: true }),
    setDefaultNamespace: (ns) => set({ defaultNamespace: ns, isDirty: true }),
    setWorkspaceFile: (name) => set({ workspaceFile: name }),
    markSaved: () => set({ savedAt: new Date().toISOString(), isDirty: false, isSaving: false }),

    // Autosave to the workspace file currently open in the sidebar.
    // Returns true on success, false on failure (draft save is a separate fallback).
    saveWorkspace: async (cellSnapshots) => {
        const s = get()
        if (!s.workspaceFile) return false
        const data = s.buildNotebook(cellSnapshots)
        const parts = s.workspaceFile.split('/')
        const name = parts.pop()
        const dir = parts.join('/')
        const qs = dir
            ? `?name=${encodeURIComponent(name)}&dir=${encodeURIComponent(dir)}`
            : `?name=${encodeURIComponent(name)}`
        set({ isSaving: true })
        try {
            const res = await fetch(`/workspace/save${qs}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data, null, 2),
            })
            if (res.ok) {
                set({ savedAt: new Date().toISOString(), isDirty: false, isSaving: false })
                return true
            }
            console.warn('[autosave] workspace save failed:', res.status)
        } catch (e) {
            console.warn('[autosave] workspace save error:', e.message)
        }
        set({ isSaving: false })
        return false
    },

    // Builds the full v2 notebook document from current metadata + provided cell snapshots
    buildNotebook: (cellSnapshots) => {
        const s = get()
        return buildV2Notebook({
            id: s.id,
            title: s.title,
            description: s.description,
            tags: s.tags,
            defaultNamespace: s.defaultNamespace,
            createdAt: s.createdAt,
            cells: cellSnapshots,
        })
    },

    // Autosave: posts full v2 document to /draft, fire-and-forget
    saveDraft: (cellSnapshots) => {
        const payload = get().buildNotebook(cellSnapshots)
        postDraft(payload)
        set({ isDirty: false })
    },

    // New notebook: reset all metadata, post empty draft
    newNotebook: (cellSnapshots = []) => {
        const newId = makeNotebookId()
        const now = new Date().toISOString()
        set({
            id: newId,
            title: 'Untitled Notebook',
            description: '',
            tags: [],
            defaultNamespace: null,
            createdAt: now,
            savedAt: null,
            isDirty: false,
            workspaceFile: null,
        })
        postDraft(
            buildV2Notebook({
                id: newId,
                title: 'Untitled Notebook',
                cells: cellSnapshots,
                createdAt: now,
            })
        )
    },

    // Restore metadata from a loaded notebook document (v2 or v1)
    restoreMetadata: (data) => {
        const meta = data.metadata ?? {}
        set({
            id: meta.id ?? makeNotebookId(),
            title: meta.title ?? data.title ?? 'Untitled Notebook',
            description: meta.description ?? '',
            tags: Array.isArray(meta.tags) ? meta.tags : [],
            defaultNamespace: meta.defaultNamespace ?? null,
            createdAt: meta.created ?? new Date().toISOString(),
            isDirty: false,
        })
    },

    // Called on app init - lightweight title-only restore path
    restoreTitle: (title) => {
        if (title) set({ title })
    },
}))

export default useNotebookStore
