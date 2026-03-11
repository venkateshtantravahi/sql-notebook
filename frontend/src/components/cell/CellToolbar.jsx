import { MdPlayArrow, MdClose, MdDownload } from 'react-icons/md'
import { CgSpinner } from 'react-icons/cg'
import useZoomStore from '../../store/useZoomStore.js'
import { exportCSV, exportJSON } from '../../utils/exportUtils.js'
import { useFetchNamespaces } from '../../hooks/useFetchNamespaces.js'

function CellToolbar({ cell, onRun, onDelete, onNamespaceChange }) {
    const { level } = useZoomStore()
    const namespaces = useFetchNamespaces()
    const isRunning = cell.status === 'running'
    const hasResults = cell.status === 'done' && cell.results

    // While the fetch is pending, the cell's saved namespace may not be in the list yet.
    // Add it as a fallback so the select shows the correct value immediately on load.
    const visibleNamespaces =
        cell.namespace && !namespaces.includes(cell.namespace)
            ? [cell.namespace, ...namespaces]
            : namespaces

    return (
        <div
            style={{ fontSize: `${level}em` }}
            className="
        flex items-center justify-between
        px-3 py-2
        border-b border-gray-200 dark:border-gray-700
        bg-gray-50 dark:bg-[#1a2540]
        rounded-t-lg
      "
        >
            {/* Left — namespace dropdown */}
            <select
                id={`namespace-${cell.id}`}
                name={`namespace-${cell.id}`}
                value={cell.namespace ?? ''}
                onChange={(e) => onNamespaceChange(e.target.value)}
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
                    {visibleNamespaces.length === 0
                        ? 'No namespaces — click ⚙ Config'
                        : 'Select namespace'}
                </option>
                {visibleNamespaces.map((ns) => (
                    <option key={ns} value={ns}>
                        {ns}
                    </option>
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
                            <MdDownload className="inline" /> CSV
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
                            <MdDownload className="inline" /> JSON
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
                    {isRunning ? (
                        <>
                            <CgSpinner className="animate-spin text-white" /> Running
                        </>
                    ) : (
                        <>
                            <MdPlayArrow className="text-white" /> Run
                        </>
                    )}
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
                    <MdClose className="text-gray-400 dark:text-gray-500 hover:text-red-400 dark:hover:text-red-400" />
                </button>
            </div>
        </div>
    )
}

export default CellToolbar
