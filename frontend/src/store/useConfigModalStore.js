import { create } from "zustand";

const useConfigModalStore = create((set) => ({
    isOpen: false,
    open:  () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
}))

export default useConfigModalStore