import { create } from 'zustand'

/**
 * Controls the Config/Edit connection modal.
 *
 * open()          -> opens in ADD mode
 * openEdit(conn)  -> opens in EDIT mode pre-filled with conn data
 * close()         -> closes and clears editConnection
 */
const useConfigModalStore = create((set) => ({
    isOpen: false,
    editConnection: null, // null = add mode, object = edit mode
    open: () => set({ isOpen: true, editConnection: null }),

    openEdit: (connection) => set({ isOpen: true, editConnection: connection }),
    close: () => set({ isOpen: false, editConnection: null }),
}))

export default useConfigModalStore
