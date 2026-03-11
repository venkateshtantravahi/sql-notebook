import { useState, useEffect } from 'react'

/**
 * Fetches the list of registered namespaces from the backend, including ephemeral
 * DuckDB file/remote sources. Normalises the response to an array of name strings
 * regardless of whether the server returns objects or plain strings.
 *
 * @returns {string[]} Array of namespace name strings.
 */
export function useFetchNamespaces() {
    const [namespaces, setNamespaces] = useState([])

    useEffect(() => {
        fetch('/namespaces?all=true')
            .then((r) => (r.ok ? r.json() : []))
            .then((data) => {
                if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
                    setNamespaces(data.map((ns) => ns.name))
                } else {
                    setNamespaces(data)
                }
            })
            .catch(() => setNamespaces([]))
    }, [])

    return namespaces
}
