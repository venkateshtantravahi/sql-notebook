import Header from './components/layout/Header.jsx'
import Sidebar from './components/layout/Sidebar.jsx'
import MainArea from './components/layout/MainArea.jsx'
import BottomBar from './components/layout/BottomBar.jsx'
import ConfigModal from './components/modal/ConfigModal.jsx'
import SplashScreen from './components/common/SplashScreen.jsx'
import useNotebookStore from './store/useNotebookStore.js'
import useCellStore from './store/useCellStore.js'
import useSidebarStore from './store/useSidebarStore.js'
import { flushAutosave } from './lib/autosave.js'
import { useEffect, useRef, useState } from 'react'

const AUTOSAVE_DEBOUNCE_MS = 2000 // 2s of inactivity triggers a draft write

/**
 * Polls GET /health with exponential backoff until the backend is ready.
 * Waits INITIAL_WAIT_MS before the first attempt so the JVM has time to bind
 * its port. Max ~30s total polling after that (500ms -> 750ms -> ... -> 3000ms cap).
 * Resolves regardless  -  if the backend never responds the app proceeds anyway.
 */
const INITIAL_WAIT_MS = 5000 // wait before first health probe
const BACKEND_SETTLE_MS = 3000 // extra buffer after health OK for JDBC pools

async function waitForBackend(maxAttempts = 20) {
    // Give the JVM a head-start before we start hammering /health
    await new Promise((r) => setTimeout(r, INITIAL_WAIT_MS))

    let delay = 500
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const r = await fetch('/health')
            if (r.ok) return
        } catch {
            // backend not up yet  -  keep polling
        }
        await new Promise((r) => setTimeout(r, delay))
        delay = Math.min(Math.floor(delay * 1.5), 3000)
    }
}

function App() {
    const restoreTitle = useNotebookStore((s) => s.restoreTitle)
    const initFromDraft = useCellStore((s) => s.initFromDraft)
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
            .then(({ title, notebookData }) => {
                if (notebookData) {
                    useNotebookStore.getState().restoreMetadata(notebookData)
                } else {
                    restoreTitle(title)
                }
                isRestoring.current = false
                setSplashReady(true)
            })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        return useNotebookStore.subscribe((state) => {
            document.title = `${state.title} - sql-notebook`
        })
    }, [])

    // Debounced wrapper around the shared flushAutosave -- fires 2s after the
    // last change.  Stable ref pattern: reads state via getState() inside flush.
    function scheduleAutosave() {
        clearTimeout(debounceTimer.current)
        debounceTimer.current = setTimeout(flushAutosave, AUTOSAVE_DEBOUNCE_MS)
    }

    // autosave: subscribe to cell changes  -  intentionally mount-only, Zustand refs are stable
    useEffect(() => {
        const unsubscribe = useCellStore.subscribe((newState, prevState) => {
            if (isRestoring.current) return
            if (newState.cells === prevState.cells) return
            scheduleAutosave()
        })

        return () => {
            unsubscribe()
            clearTimeout(debounceTimer.current)
        }
    }, [])

    // also autosave when notebook metadata (title, description, tags, ns) changes
    useEffect(() => {
        const unsubscribe = useNotebookStore.subscribe((newState, prevState) => {
            if (isRestoring.current) return
            if (
                newState.title === prevState.title &&
                newState.description === prevState.description &&
                newState.tags === prevState.tags &&
                newState.defaultNamespace === prevState.defaultNamespace
            )
                return
            scheduleAutosave()
        })
        return () => unsubscribe()
    }, [])

    return (
        <>
            {/* Splash  -  rendered until backend init completes, then fades out */}
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
