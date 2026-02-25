import { useState, useEffect, useCallback } from 'react'

/**
 * Fetches schema for all known namespaces.
 * Flow: GET /namespaces → for each namespace GET /schema/:namespace
 *
 * Re-fetches automatically when the 'namespace-added' event fires
 * (dispatched by ConfigModal after a successful connection and by
 * Sidebar after a delete), so the schema tree stays in sync with
 * the live registry without needing a page refresh.
 */
function useSchema() {
    const [schema, setSchema]   = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError]     = useState(null)

    const load = useCallback(async () => {
        let cancelled = false

        try {
            setLoading(true)
            setError(null)

            const nsResp = await fetch('/namespaces')
            if (!nsResp.ok) throw new Error('Failed to fetch namespaces')
            const namespaces = await nsResp.json()

            if (namespaces.length === 0) {
                setSchema([])
                return
            }

            const results = await Promise.allSettled(
                namespaces.map(ns =>
                    fetch(`/schema/${ns}`).then(r => {
                        if (!r.ok) throw new Error(`Failed to fetch schema for ${ns}`)
                        return r.json()
                    })
                )
            )

            if (cancelled) return

            const schemas = results
                .map((result, i) => {
                    if (result.status === 'fulfilled') return result.value
                    console.warn(`Schema fetch failed for ${namespaces[i]}:`, result.reason)
                    return null
                })
                .filter(Boolean)

            setSchema(schemas)
        } catch (err) {
            if (!cancelled) setError(err.message)
        } finally {
            if (!cancelled) setLoading(false)
        }

        return () => { cancelled = true }
    }, [])

    // Fetch on mount
    useEffect(() => {
        load()
    }, [load])

    // Re-fetch whenever a connection is added or removed
    useEffect(() => {
        window.addEventListener('namespace-added', load)
        return () => window.removeEventListener('namespace-added', load)
    }, [load])

    return { schema, loading, error, refresh: load }
}

export default useSchema