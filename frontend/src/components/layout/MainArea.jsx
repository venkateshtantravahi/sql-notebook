import useCellStore from '../../store/useCellStore.js'
import SqlCell from '../cell/SqlCell.jsx'

function MainArea() {
    const { cells, addCell } = useCellStore()

    return (
        <main
            // Zoom is handled by useZoomStore writing to document.documentElement font-size
            // Always offset by at least the rail; panel width is added via --sidebar-width
            style={{ left: 'var(--sidebar-width, 40px)' }}
            className="
                absolute top-12 bottom-10 right-0 overflow-y-auto
                bg-gray-50 dark:bg-gray-950
                transition-[left] duration-200
            "
        >
            {cells.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
                        <span className="text-white text-lg font-bold">S</span>
                    </div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Welcome to sql-notebook
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-600 text-center max-w-xs">
                        Add a cell to start writing SQL across your connected databases
                    </p>
                    <button
                        onClick={addCell}
                        className="
                            mt-2 text-xs px-4 py-2 rounded
                            bg-blue-600 hover:bg-blue-500
                            text-white font-medium transition-colors
                        "
                    >
                        + Add your first cell
                    </button>
                </div>
            ) : (
                <div className="p-6 flex flex-col gap-4 max-w-4xl mx-auto">
                    {cells.map((cell) => (
                        <SqlCell key={cell.id} cell={cell} />
                    ))}
                    <button
                        onClick={addCell}
                        className="
                            w-full py-2 rounded-lg
                            border border-dashed border-gray-300 dark:border-gray-700
                            text-xs text-gray-400 dark:text-gray-600
                            hover:border-blue-400 dark:hover:border-blue-600
                            hover:text-blue-500 dark:hover:text-blue-400
                            transition-colors
                        "
                    >
                        + Add cell
                    </button>
                </div>
            )}
        </main>
    )
}

export default MainArea
