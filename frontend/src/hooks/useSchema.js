import { useState, useEffect, useCallback } from 'react'

// useSchema — fetches schema for all known namespaces.
// Flow: GET /namespaces → GET /schema/:namespace for each.
// Re-fetches on 'namespace-added' event so the tree stays in sync without a page refresh.
function useSchema() {
    const [schema, setSchema] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    const load = useCallback(async () => {
        let cancelled = false

        try {
            setLoading(true)
            setError(null)

            const nsResp = await fetch('/namespaces')
            if (!nsResp.ok) throw new Error('Failed to fetch namespaces')
            const raw = await nsResp.json()

            // /namespaces now returns health objects [{name, healthy, latencyMs}]
            // Extract just the name strings for schema fetching
            const namespaces = raw.map((ns) => (typeof ns === 'string' ? ns : ns.name))

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

        return () => {
            cancelled = true
        }
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
