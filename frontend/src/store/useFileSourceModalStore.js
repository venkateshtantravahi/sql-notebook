import {create} from "zustand";


const useFileSourceModalStore = create(set => ({
    isOpen: false,
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
}))

export default useFileSourceModalStore