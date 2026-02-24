import { useEffect, useRef } from 'react'

/**
 * useNamespaceRefresh
 *
 * Calls the provided callback whenever:
 *  1. The component first mounts
 *  2. A 'namespace-added' custom event fires on window (after POST /connections succeeds)
 *
 * Usage:
 *   useNamespaceRefresh(fetchNamespaces)
 *
 * Any component that displays live namespace data should use this hook
 * so it refreshes immediately when the user adds a new connection via ConfigModal.
 */
export function useNamespaceRefresh(callback) {
    const callbackRef = useRef(callback)
    callbackRef.current = callback

    useEffect(() => {
        function handle() { callbackRef.current() }
        window.addEventListener('namespace-added', handle)
        return () => window.removeEventListener('namespace-added', handle)
    }, [])
}