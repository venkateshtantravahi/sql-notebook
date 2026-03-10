import { create } from 'zustand'

const RAIL_WIDTH = 40
const DEFAULT_PANEL_WIDTH = 288

const useSidebarStore = create((set, get) => ({
    activePanel: 'connections', // 'connections' | 'schema' | 'datasources' | null
    panelWidth: DEFAULT_PANEL_WIDTH,
    railWidth: RAIL_WIDTH,
    namespaces: [],
    selectedNs: null,

    // derived
    get isOpen() {
        return get().activePanel !== null
    },

    setPanel: (id) => set({ activePanel: id }),
    togglePanel: (id) =>
        set((state) => ({
            activePanel: state.activePanel === id ? null : id,
        })),

    // ⌘B — close panel if open, reopen connections by default
    toggle: () =>
        set((state) => ({
            activePanel: state.activePanel !== null ? null : 'connections',
        })),

    open: () => set({ activePanel: 'connections' }),
    close: () => set({ activePanel: null }),

    setPanelWidth: (w) => set({ panelWidth: w }),
    setNamespaces: (list) => set({ namespaces: list }),
    setSelectedNs: (ns) => set({ selectedNs: ns }),
}))

export default useSidebarStore
