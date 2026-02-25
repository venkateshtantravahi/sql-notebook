import { create } from 'zustand'

const LEVELS = [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4]
const DEFAULT_INDEX = 2 // 1.0

// Apply font-size to the document root so every rem-based element
// in the entire page scales — sidebar, header, cells, bottom bar, everything.
function applyZoom(level) {
    document.documentElement.style.fontSize = `${level * 100}%`
}

// Apply initial zoom immediately on module load
applyZoom(LEVELS[DEFAULT_INDEX])

const useZoomStore = create((set) => ({
    index: DEFAULT_INDEX,
    level: LEVELS[DEFAULT_INDEX],

    zoomIn: () => set(state => {
        const next = Math.min(state.index + 1, LEVELS.length - 1)
        applyZoom(LEVELS[next])
        return { index: next, level: LEVELS[next] }
    }),

    zoomOut: () => set(state => {
        const next = Math.max(state.index - 1, 0)
        applyZoom(LEVELS[next])
        return { index: next, level: LEVELS[next] }
    }),

    reset: () => {
        applyZoom(LEVELS[DEFAULT_INDEX])
        return set({ index: DEFAULT_INDEX, level: LEVELS[DEFAULT_INDEX] })
    },
}))

export default useZoomStore