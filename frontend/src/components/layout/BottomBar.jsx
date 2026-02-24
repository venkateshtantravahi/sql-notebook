import { useState, useEffect } from 'react'
import { useNamespaceRefresh } from '../../hooks/useNamespaceRefresh.js'

function BottomBar() {
    const [namespaces, setNamespaces] = useState([])

    function fetchNs() {
        fetch('/namespaces')
            .then(r => r.ok ? r.json() : [])
            .then(setNamespaces)
            .catch(() => setNamespaces([]))
    }

    useEffect(() => {
        fetchNs()
        // Re-poll every 30 seconds so new connections appear without refresh
        const interval = setInterval(fetchNs, 30000)
        return () => clearInterval(interval)
    }, [])

    useNamespaceRefresh(fetchNs)

    return (
        <footer className="
      fixed bottom-0 left-0 right-0 h-10
      flex items-center px-4 gap-6
      bg-white dark:bg-gray-900
      border-t border-gray-200 dark:border-gray-800
    ">
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
        Namespace Health
      </span>

            <div className="flex items-center gap-4">
                {namespaces.length === 0 ? (
                    <span className="text-xs text-gray-300 dark:text-gray-700 italic">
            No connections configured
          </span>
                ) : (
                    namespaces.map(ns => (
                        <div key={ns} className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                {ns}
              </span>
                        </div>
                    ))
                )}
            </div>

            <div className="ml-auto">
        <span className="text-xs text-gray-300 dark:text-gray-700 font-mono">
          v0.1.0
        </span>
            </div>
        </footer>
    )
}

export default BottomBar