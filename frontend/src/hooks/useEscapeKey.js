import { useEffect } from 'react'

/**
 * Calls onEscape when the Escape key is pressed, while active is true.
 * Attaches and removes the keydown listener whenever active changes.
 *
 * @param {boolean} active - Whether the listener should be active (e.g. modal is open).
 * @param {() => void} onEscape - Callback fired on Escape keydown.
 */
export function useEscapeKey(active, onEscape) {
    useEffect(() => {
        if (!active) return
        function handle(e) {
            if (e.key === 'Escape') onEscape()
        }
        document.addEventListener('keydown', handle)
        return () => document.removeEventListener('keydown', handle)
    }, [active, onEscape])
}
