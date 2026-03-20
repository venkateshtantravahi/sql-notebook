import { useEffect, useRef } from 'react'

// useNamespaceRefresh - calls callback on mount and on every 'namespace-added' window event.
// Use in any component that displays live namespace data.
export function useNamespaceRefresh(callback) {
    const callbackRef = useRef(callback)
    callbackRef.current = callback

    useEffect(() => {
        function handle() {
            callbackRef.current()
        }
        window.addEventListener('namespace-added', handle)
        return () => window.removeEventListener('namespace-added', handle)
    }, [])
}
