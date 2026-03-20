import { useState, useEffect, useCallback } from 'react'
import { useBackendReady } from './useBackendReady.js'

// useSchema - fetches schema for all known namespaces.
// Flow: GET /namespaces -> GET /schema/:namespace for each.
// Re-fetches on 'namespace-added' event so the tree stays in sync without a page refresh.
function useSchema() {
    const [schema, setSchema] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    const backendReady = useBackendReady()

    const load = useCallback(async () => {
        try {
            setLoading(true)
            setError(null)

            // Fetch namespaces and pinned list together - pinned datasets are single flat
            // tables with no meaningful schema or ERD, so we exclude them entirely.
            const [nsResult, pinResult] = await Promise.allSettled([
                fetch('/namespaces').then((r) => {
                    if (!r.ok) throw new Error('Failed to fetch namespaces')
                    return r.json()
                }),
                fetch('/pin').then((r) => (r.ok ? r.json() : { pinned: [] })),
            ])

            if (nsResult.status === 'rejected')
                throw new Error(nsResult.reason?.message ?? 'Failed to fetch namespaces')

            const raw = nsResult.value
            const pinnedSet = new Set(
                pinResult.status === 'fulfilled' ? (pinResult.value.pinned ?? []) : []
            )

            const namespaces = raw
                .map((ns) => (typeof ns === 'string' ? ns : ns.name))
                .filter((name) => !pinnedSet.has(name))

            if (namespaces.length === 0) {
                setSchema([])
                return
            }

            const results = await Promise.allSettled(
                namespaces.map((name) =>
                    fetch(`/schema/${name}`).then((r) => {
                        if (!r.ok) throw new Error(`Failed to fetch schema for ${name}`)
                        return r.json()
                    })
                )
            )

            const schemas = results
                .map((result, i) => {
                    if (result.status === 'fulfilled') return result.value
                    console.warn(`Schema fetch failed for ${namespaces[i]}:`, result.reason)
                    return null
                })
                .filter(Boolean)

            setSchema(schemas)
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }, [])

    // Fetch on mount - gated on backendReady so the schema panel never fires
    // requests before App.jsx completes its health-check + settle sequence.
    useEffect(() => {
        if (!backendReady) return
        load()
    }, [load, backendReady])

    // Re-fetch whenever a connection is added or removed
    useEffect(() => {
        window.addEventListener('namespace-added', load)
        return () => window.removeEventListener('namespace-added', load)
    }, [load])

    return { schema, loading, error, refresh: load }
}

export default useSchema
