import { create } from 'zustand'

const LEVELS = [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4]
const DEFAULT_INDEX = 2 // 1.0

const useZoomStore = create((set, get) => ({
    index: DEFAULT_INDEX,
    level: LEVELS[DEFAULT_INDEX],

    zoomIn: () => set(state => {
        const next = Math.min(state.index + 1, LEVELS.length - 1)
        return { index: next, level: LEVELS[next] }
    }),

    zoomOut: () => set(state => {
        const next = Math.max(state.index - 1, 0)
        return { index: next, level: LEVELS[next] }
    }),

    reset: () => set({ index: DEFAULT_INDEX, level: LEVELS[DEFAULT_INDEX] }),
}))

export default useZoomStore