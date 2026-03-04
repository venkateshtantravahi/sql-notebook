import useThemeStore from "./store/useThemeStore.js";
import Header from "./components/layout/Header.jsx";
import Sidebar from "./components/layout/Sidebar.jsx";
import MainArea from "./components/layout/MainArea.jsx";
import BottomBar from "./components/layout/BottomBar.jsx";
import ConfigModal from "./components/modal/ConfigModal.jsx";
import useAutoSave from "./hooks/useAutoSave.js";
import useNotebookStore from "./store/useNotebookStore.js";
import useCellStore from "./store/useCellStore.js";
import {useEffect, useRef} from "react";

const AUTOSAVE_DEBOUNCE_MS = 2000 // 2s of inactivity triggers a draft write

function App() {
    const { theme, toggleTheme } = useThemeStore()
    const restoreTitle = useNotebookStore(s => s.restoreTitle)
    const saveDraft = useNotebookStore(s => s.saveDraft)
    const initFromDraft = useCellStore(s => s.initFromDraft)
    const getSnapshot = useCellStore(s => s.getSnapshot)

    const debounceTimer = useRef(null)
    const isRestoring = useRef(true)

    // on mount: restore draft from backend
    useEffect(() => {
        isRestoring.current = true

        initFromDraft().then(({ title }) => {
            // push the restored title into useNotebookStore without making dirty
            restoreTitle(title)
            // Allow autosave subscriber to fire
            isRestoring.current = false
        })
    }, [])

    // autosave: subscribe to cell changes
    useEffect(() => {
        const unsubscribe = useCellStore.subscribe((newState, prevState) => {
            // Don't autosave while restoring from draft on first load
            if (isRestoring.current) return

            // only trigger on cell content changes
            const cellsChnaged = newState.cells !== prevState.cells
            if (!cellsChnaged) return

            // reset timer on every change, fire after 2s of quiet
            clearTimeout(debounceTimer.current)
            debounceTimer.current = setTimeout(() => {
                const snapshot = getSnapshot()
                saveDraft(snapshot)
            }, AUTOSAVE_DEBOUNCE_MS)
        })

        return () => {
            unsubscribe()
            clearTimeout(debounceTimer.current)
        }
    }, [])

    // also save draft when title changes
    useEffect(() => {
        const unsubscribe = useCellStore.subscribe((newState, prevState) => {
            if (isRestoring.current) return
            if (newState.title === prevState.title) return

            clearTimeout(debounceTimer.current)
            debounceTimer.current = setTimeout(() => {
                const snapshot = getSnapshot()
                saveDraft(snapshot)
            }, AUTOSAVE_DEBOUNCE_MS)
        })
        return () => unsubscribe()
    }, [])

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
            <Header />
            <Sidebar />
            <MainArea />
            <BottomBar />
            <ConfigModal />
        </div>
    )
}

export default App
