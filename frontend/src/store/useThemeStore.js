import {create} from "zustand";

const getInitialTheme = () => {
    // check local storage first, then system preferance
    const stored = localStorage.getItem('sql-notebook-theme')
    if (stored) return stored
    return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark' : 'light'
}

const applyTheme = (theme) => {
    const root = document.documentElement
    if (theme === 'dark') {
        root.classList.add('dark')
    } else {
        root.classList.remove('dark')
    }
    localStorage.setItem('sql-notebook-theme', theme)
}

const useThemeStore = create((set) => ({
    theme: getInitialTheme(),

    setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
    },

    toggleTheme: () => {
        set((state) => {
            const next = state.theme === 'dark' ? 'light' : 'dark'
            applyTheme(next)
            return { theme: next }
        })
    },
}))

applyTheme(getInitialTheme())

export default useThemeStore