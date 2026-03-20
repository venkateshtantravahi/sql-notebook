import useSidebarStore from '../store/useSidebarStore.js'

/**
 * Returns true once the backend has passed its health check and connection
 * pools have settled (set by App.jsx after waitForBackend resolves).
 *
 * Use this as a guard in every useEffect that makes a backend request so that
 * no component fires requests independently before the app-level startup
 * sequence completes.
 *
 *   const backendReady = useBackendReady()
 *   useEffect(() => {
 *     if (!backendReady) return
 *     fetchData()
 *   }, [backendReady])
 */
export function useBackendReady() {
    return useSidebarStore((s) => s.backendReady)
}
