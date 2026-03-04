import { useState, useEffect } from 'react'
import useZoomStore from '../../store/useZoomStore.js'

function exportCSV(results) {
    if (!results) return
    const header = results.columns.join(',')
    const rows   = results.rows.map((row, _) =>
        results.columns.map((col, colIdx) => {
            const val = Array.isArray(row) ? row[colIdx] : row[col]
            if (val === null || val === undefined) return ''
            const str = String(val)
            return str.includes(',') || str.includes('"') || str.includes('\n')
                ? `"${str.replace(/"/g, '""')}"`
                : str
        }).join(',')
    )
    download([header, ...rows].join('\n'), 'results.csv', 'text/csv')
}

function exportJSON(results) {
    if (!results) return
    const objects = results.rows.map(row =>
        Object.fromEntries(
            results.columns.map((col, i) => [col, Array.isArray(row) ? row[i] : row[col]])
        )
    )
    download(JSON.stringify(objects, null, 2), 'results.json', 'application/json')
}

function download(content, filename, type) {
    const blob = URL.createObjectURL(new Blob([content], { type }))
    const a    = Object.assign(document.createElement('a'), { href: blob, download: filename })
    a.click()
    URL.revokeObjectURL(blob)
}

function CellToolbar({ cell, onRun, onDelete, onNamespaceChange }) {
    const { level }  = useZoomStore()
    const [namespaces, setNamespaces] = useState([])
    const isRunning  = cell.status === 'running'
    const hasResults = cell.status === 'done' && cell.results

    // Fetch live namespaces from backend
    useEffect(() => {
        fetch('/namespaces')
            .then(r => r.ok ? r.json() : [])
            .then(data => {
                if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
                    setNamespaces(data.map(ns => ns.name))
                } else {
                    setNamespaces(data)
                }
                })
            .catch(() => setNamespaces([]))
    }, [])

    return (
        <div
            style={{ fontSize: `${level}em` }}
            className="
        flex items-center justify-between
        px-3 py-2
        border-b border-gray-200 dark:border-gray-700
        bg-gray-50 dark:bg-gray-800
        rounded-t-lg
      "
        >
            {/* Left — namespace dropdown */}
            <select
                id={`namespace-${cell.id}`}
                name={`namespace-${cell.id}`}
                value={cell.namespace ?? ''}
                onChange={e => onNamespaceChange(e.target.value)}
                className="
          text-xs font-mono px-2 py-1 rounded
          bg-white dark:bg-gray-700
          border border-gray-200 dark:border-gray-600
          text-gray-700 dark:text-gray-300
          focus:outline-none focus:ring-2 focus:ring-blue-500
          transition-colors
        "
            >
                <option value="" disabled>
                    {namespaces.length === 0 ? 'No namespaces — click ⚙ Config' : 'Select namespace'}
                </option>
                {namespaces.map(ns => (
                    <option key={ns} value={ns}>{ns}</option>
                ))}
            </select>

            {/* Right — export + run + delete */}
            <div className="flex items-center gap-2">
                {hasResults && (
                    <div className="flex items-center gap-1 mr-1">
                        <button
                            onClick={() => exportCSV(cell.results)}
                            className="
                text-xs px-2 py-1 rounded font-mono
                text-gray-500 dark:text-gray-400
                hover:bg-gray-200 dark:hover:bg-gray-700
                hover:text-gray-700 dark:hover:text-gray-200
                transition-colors
              "
                            title="Export as CSV"
                        >
                            ↓ CSV
                        </button>
                        <button
                            onClick={() => exportJSON(cell.results)}
                            className="
                text-xs px-2 py-1 rounded font-mono
                text-gray-500 dark:text-gray-400
                hover:bg-gray-200 dark:hover:bg-gray-700
                hover:text-gray-700 dark:hover:text-gray-200
                transition-colors
              "
                            title="Export as JSON"
                        >
                            ↓ JSON
                        </button>
                    </div>
                )}

                <button
                    onClick={onRun}
                    disabled={isRunning || !cell.namespace}
                    className="
            flex items-center gap-1.5
            text-xs px-3 py-1 rounded
            bg-blue-600 hover:bg-blue-500
            disabled:opacity-40 disabled:cursor-not-allowed
            text-white font-medium transition-colors
          "
                >
                    {isRunning
                        ? <><span className="animate-spin inline-block">⟳</span> Running</>
                        : <><span>▶</span> Run</>
                    }
                </button>

                <button
                    onClick={onDelete}
                    className="
            text-xs px-2 py-1 rounded
            text-gray-400 dark:text-gray-500
            hover:bg-red-50 dark:hover:bg-red-900/20
            hover:text-red-500 dark:hover:text-red-400
            transition-colors
          "
                >
                    ✕
                </button>
            </div>
        </div>
    )
}

export default CellToolbar