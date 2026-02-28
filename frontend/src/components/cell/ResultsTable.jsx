import { useState, useEffect } from "react";

const PAGE_SIZE = 100

function ResultsTable({ results, error, status }) {
    const [page, setPage] = useState(1)

    // Reset to page 1 whenever results change
    useEffect(() => { setPage(1) }, [results])

    if (status === 'idle') return null

    if (status === 'running') {
        return (
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                    <span className="animate-spin text-blue-500">⟳</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
            Running query...
          </span>
                </div>
            </div>
        )
    }

    if (status === 'error') {
        return (
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs font-mono text-red-500 dark:text-red-400">
                    {error}
                </p>
            </div>
        )
    }

    if (!results || results.rows.length === 0) {
        return (
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                    Query returned no rows
                </p>
            </div>
        )
    }

    const totalRows = results.rows.length
    const totalPages = Math.ceil(totalRows / PAGE_SIZE)
    const start = (page - 1) * PAGE_SIZE
    const end = Math.min(start + PAGE_SIZE, totalRows)
    const pageRows = results.rows.slice(start, end)

    function goTo(p) { setPage(Math.max(1, Math.min(totalPages, p)))}

    return (
        <div className="border-t border-gray-200 dark:border-gray-700">
            {/* Results meta */}
            <div className="
        flex items-center justify-between
        px-3 py-1.5
        bg-gray-50 dark:bg-gray-800
        border-b border-gray-100 dark:border-gray-700
      ">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Results
        </span>
                <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
          {totalRows.toLocaleString()} rows . {results.duration}ms
        </span>
            </div>

            {/* Table */}
            <div className="overflow-x-auto max-h-64">
                <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                    <tr>
                        {results.columns.map(col => (
                            <th
                                key={col}
                                className="
                    px-3 py-2 text-left font-semibold
                    text-gray-500 dark:text-gray-400
                    border-b border-gray-200 dark:border-gray-700
                    font-mono whitespace-nowrap
                  "
                            >
                                {col}
                            </th>
                        ))}
                    </tr>
                    </thead>
                    <tbody>
                    {pageRows.map((row, rowIndex) => (
                        <tr key={start + rowIndex}
                            className="
                  border-b border-gray-100 dark:border-gray-800
                  hover:bg-blue-50 dark:hover:bg-blue-900/10
                  transition-colors
                "
                        >
                            {results.columns.map((col, colIndex) => {
                                // Rows arrive from backend as arrays e.g. [1, "Alice", ...]
                                // Access by position, not by column name
                                const value = Array.isArray(row) ? row[colIndex] : row[col]
                                return (
                                    <td
                                        key={col}
                                        className="
                                                px-3 py-1.5 font-mono
                                                text-gray-700 dark:text-gray-300
                                                whitespace-nowrap
                                            "
                                    >
                                        {value === null || value === undefined
                                            ? <span className="text-gray-300 dark:text-gray-600 italic">null</span>
                                            : String(value)
                                        }
                                    </td>
                                )
                            })}
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
            {/* Pagination only shown when results exceed one page */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
                    {/* Row range label */}
                    <span className="text-xs font-mono text-gray-400 dark:text-gray-500">
                        {(start + 1).toLocaleString()}-{end.toLocaleString()} of {totalRows.toLocaleString()}
                    </span>
                    {/* Page controls */}
                    <div className="flex items-center gap-1">
                        <PagBtn onClick={() => goTo(1)}       disabled={page === 1}          title="First page">«</PagBtn>
                        <PagBtn onClick={() => goTo(page - 1)} disabled={page === 1}          title="Previous page">‹</PagBtn>

                        {/* Page number pills */}
                        {buildPageRange(page, totalPages).map((p, i) =>
                            p === '…' ? (
                                <span key={`ellipsis-${i}`} className="text-xs text-gray-300 dark:text-gray-700 px-1">…</span>
                            ) : (
                                <button
                                    key={p}
                                    onClick={() => goTo(p)}
                                    className={`min-w-[24px] h-6 px-1.5 rounded text-xs font-mono transition-colors ${
                                        p === page
                                            ? 'bg-blue-600 text-white'
                                            : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    {p}
                                </button>
                            )
                        )}

                        <PagBtn onClick={() => goTo(page + 1)} disabled={page === totalPages} title="Next page">›</PagBtn>
                        <PagBtn onClick={() => goTo(totalPages)} disabled={page === totalPages} title="Last page">»</PagBtn>
                    </div>
                </div>

            )}

        </div>
    )
}

// Small pagination button
function PagBtn({ onClick, disabled, title, children }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
            className="w-6 h-6 flex items-center justify-center rounded text-xs font-mono text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
            {children}
        </button>
    )
}

/**
 * Builds a compact page number array with ellipsis.
 * e.g. page=5, total=20 → [1, '…', 4, 5, 6, '…', 20]
 */
function buildPageRange(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
    const pages = new Set([1, total, current, current - 1, current + 1].filter(p => p >= 1 && p <= total))
    const sorted = Array.from(pages).sort((a, b) => a - b)
    const result = []
    for (let i = 0; i < sorted.length; i++) {
        if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('…')
        result.push(sorted[i])
    }
    return result
}

export default ResultsTable