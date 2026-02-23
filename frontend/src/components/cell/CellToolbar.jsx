const NAMESPACES = ['prod_mysql', 'analytics_pg', 'local_sqlite']

function CellToolbar({ cell, onRun, onDelete, onNamespaceChange }) {
    const isRunning = cell.status === 'running'

    return (
        <div className="
      flex items-center justify-between
      px-3 py-2
      border-b border-gray-200 dark:border-gray-700
      bg-gray-50 dark:bg-gray-800
      rounded-t-lg
    ">
            {/* Left — namespace dropdown */}
            <select
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
                <option value="" disabled>Select namespace</option>
                {NAMESPACES.map(ns => (
                    <option key={ns} value={ns}>{ns}</option>
                ))}
            </select>

            {/* Right — run + delete */}
            <div className="flex items-center gap-2">
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
                        ? <><span className="animate-spin">⟳</span> Running</>
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