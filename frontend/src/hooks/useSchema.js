import { useState, useEffect } from 'react'

/**
 * Fetches schema for all known namespaces.
 * Flow: GET /namespaces → for each namespace GET /schema/:namespace
 * Returns combined result as an array of namespace schema objects.
 */
function useSchema() {
    const [schema, setSchema]   = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError]     = useState(null)

    useEffect(() => {
        let cancelled = false

        async function load() {
            try {
                setLoading(true)
                setError(null)

                // Step 1 — get all namespace names
                const nsResp = await fetch('/namespaces')
                if (!nsResp.ok) throw new Error('Failed to fetch namespaces')
                const namespaces = await nsResp.json()

                // Step 2 — fetch schema for each namespace in parallel
                const results = await Promise.allSettled(
                    namespaces.map(ns =>
                        fetch(`/schema/${ns}`).then(r => {
                            if (!r.ok) throw new Error(`Failed to fetch schema for ${ns}`)
                            return r.json()
                        })
                    )
                )

                if (cancelled) return

                // Keep fulfilled results, log failures individually
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
        }

        load()
        return () => { cancelled = true }
    }, [])

    return { schema, loading, error }
}

export default useSchema