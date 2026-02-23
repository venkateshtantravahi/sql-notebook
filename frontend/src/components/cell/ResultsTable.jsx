function ResultsTable({ results, error, status }) {

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
          {results.rowCount} rows · {results.duration}ms
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
                    {results.rows.map((row, i) => (
                        <tr
                            key={i}
                            className="
                  border-b border-gray-100 dark:border-gray-800
                  hover:bg-blue-50 dark:hover:bg-blue-900/10
                  transition-colors
                "
                        >
                            {results.columns.map(col => (
                                <td
                                    key={col}
                                    className="
                      px-3 py-1.5 font-mono
                      text-gray-700 dark:text-gray-300
                      whitespace-nowrap
                    "
                                >
                                    {row[col] === null
                                        ? <span className="text-gray-300 dark:text-gray-600 italic">null</span>
                                        : String(row[col])
                                    }
                                </td>
                            ))}
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

export default ResultsTable