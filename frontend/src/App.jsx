import Header from './components/layout/Header.jsx'
import Sidebar from './components/layout/Sidebar.jsx'
import MainArea from './components/layout/MainArea.jsx'
import BottomBar from './components/layout/BottomBar.jsx'
import ConfigModal from './components/modal/ConfigModal.jsx'
import SplashScreen from './components/common/SplashScreen.jsx'
import useNotebookStore from './store/useNotebookStore.js'
import useCellStore from './store/useCellStore.js'
import useSidebarStore from './store/useSidebarStore.js'
import { useEffect, useRef, useState } from 'react'

const AUTOSAVE_DEBOUNCE_MS = 2000 // 2s of inactivity triggers a draft write

/**
 * Polls GET /health with exponential backoff until the backend is ready.
 * Max ~15s total wait (100ms → 150ms → … → 3000ms cap, 20 attempts).
 * Resolves regardless — if the backend never responds, the app proceeds
 * anyway and shows partial state rather than hanging forever.
 */
async function waitForBackend(maxAttempts = 20) {
    let delay = 100
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const r = await fetch('/health')
            if (r.ok) return
        } catch {
            // backend not up yet — keep polling
        }
        await new Promise((r) => setTimeout(r, delay))
        delay = Math.min(Math.floor(delay * 1.5), 3000)
    }
}

/** Extra settle time after health passes — allows JDBC pools to finish warming. */
const BACKEND_SETTLE_MS = 2000

function App() {
    const restoreTitle = useNotebookStore((s) => s.restoreTitle)
    const saveDraft = useNotebookStore((s) => s.saveDraft)
    const initFromDraft = useCellStore((s) => s.initFromDraft)
    const getSnapshot = useCellStore((s) => s.getSnapshot)

    const debounceTimer = useRef(null)
    const isRestoring = useRef(true)

    const [splashReady, setSplashReady] = useState(false)
    const [splashDone, setSplashDone] = useState(false)

    // on mount: wait for backend health, settle, then restore draft
    useEffect(() => {
        isRestoring.current = true

        waitForBackend()
            .then(() => new Promise((r) => setTimeout(r, BACKEND_SETTLE_MS)))
            .then(() => {
                useSidebarStore.getState().setBackendReady(true)
                return initFromDraft()
            })
            .then(({ title }) => {
                restoreTitle(title)
                isRestoring.current = false
                setSplashReady(true)
            })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        return useNotebookStore.subscribe((state) => {
            document.title = `${state.title} — sql-notebook`
        })
    }, [])

    // autosave: subscribe to cell changes — intentionally mount-only, Zustand refs are stable
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // also save draft when title changes — intentionally mount-only, Zustand refs are stable
    useEffect(() => {
        const unsubscribe = useNotebookStore.subscribe((newState, prevState) => {
            if (isRestoring.current) return
            if (newState.title === prevState.title) return

            clearTimeout(debounceTimer.current)
            debounceTimer.current = setTimeout(() => {
                const snapshot = getSnapshot()
                saveDraft(snapshot)
            }, AUTOSAVE_DEBOUNCE_MS)
        })
        return () => unsubscribe()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
        <>
            {/* Splash — rendered until backend init completes, then fades out */}
            {!splashDone && <SplashScreen ready={splashReady} onDone={() => setSplashDone(true)} />}
            <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
                <Header />
                <Sidebar />
                <MainArea />
                <BottomBar />
                <ConfigModal />
            </div>
        </>
    )
}

export default App
