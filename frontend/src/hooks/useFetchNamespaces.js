import { useState, useEffect, useCallback } from 'react'
import { useNamespaceRefresh } from './useNamespaceRefresh.js'

/**
 * Fetches the list of registered namespaces from the backend, including ephemeral
 * DuckDB file/remote sources and pinned datasets. Normalises the response to an
 * array of name strings regardless of whether the server returns objects or plain strings.
 *
 * Automatically re-fetches whenever a 'namespace-added' window event is dispatched
 * so callers stay in sync after uploads, remote registrations, or pins.
 *
 * @returns {string[]} Array of namespace name strings.
 */
export function useFetchNamespaces() {
    const [namespaces, setNamespaces] = useState([])
    const [tick, setTick] = useState(0)

    const fetchNamespaces = useCallback(() => {
        fetch('/namespaces?all=true')
            .then((r) => (r.ok ? r.json() : []))
            .then((data) => {
                if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
                    setNamespaces(data.map((ns) => ns.name))
                } else {
                    setNamespaces(Array.isArray(data) ? data : [])
                }
            })
            .catch(() => setNamespaces([]))
    }, [])

    useEffect(() => {
        fetchNamespaces()
    }, [tick, fetchNamespaces])

    // Re-fetch whenever any part of the app fires 'namespace-added'
    useNamespaceRefresh(() => setTick((t) => t + 1))

    return namespaces
}
