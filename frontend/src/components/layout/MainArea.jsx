import { useState } from 'react'
import { LuChevronUp, LuChevronDown } from 'react-icons/lu'
import useCellStore from '../../store/useCellStore.js'
import SqlCell from '../cell/SqlCell.jsx'
import MarkdownCell from '../cell/MarkdownCell.jsx'

// Hover zone at the bottom of each cell — reveals "+ SQL" and "+ Markdown" insert buttons
function InsertBar({ afterId }) {
    const { insertAfter } = useCellStore()
    const [visible, setVisible] = useState(false)

    return (
        <div
            className="relative h-5 flex items-center"
            onMouseEnter={() => setVisible(true)}
            onMouseLeave={() => setVisible(false)}
        >
            {visible ? (
                <div className="w-full flex items-center gap-2">
                    <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                    <button
                        onClick={() => insertAfter(afterId, 'sql')}
                        className="
                            text-xs px-2 py-0.5 rounded
                            border border-gray-300 dark:border-gray-600
                            text-gray-500 dark:text-gray-400
                            hover:border-blue-400 dark:hover:border-blue-500
                            hover:text-blue-600 dark:hover:text-blue-400
                            bg-white dark:bg-gray-900
                            transition-colors whitespace-nowrap
                        "
                    >
                        + SQL
                    </button>
                    <button
                        onClick={() => insertAfter(afterId, 'markdown')}
                        className="
                            text-xs px-2 py-0.5 rounded
                            border border-gray-300 dark:border-gray-600
                            text-gray-500 dark:text-gray-400
                            hover:border-blue-400 dark:hover:border-blue-500
                            hover:text-blue-600 dark:hover:text-blue-400
                            bg-white dark:bg-gray-900
                            transition-colors whitespace-nowrap
                        "
                    >
                        + Markdown
                    </button>
                    <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                </div>
            ) : (
                <div className="w-full h-px bg-transparent" />
            )}
        </div>
    )
}

// Wraps a cell with move ↑↓ buttons visible on hover
function CellWrapper({ cell, isFirst, isLast, children }) {
    const { moveUp, moveDown } = useCellStore()
    const [hovered, setHovered] = useState(false)

    return (
        <div
            className="relative group"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {/* Move buttons — float to the left of the cell */}
            <div
                className={`
                    absolute -left-8 top-1/2 -translate-y-1/2
                    flex flex-col gap-0.5
                    transition-opacity
                    ${hovered ? 'opacity-100' : 'opacity-0'}
                `}
            >
                <button
                    onClick={() => moveUp(cell.id)}
                    disabled={isFirst}
                    title="Move cell up"
                    className="
                        w-6 h-6 flex items-center justify-center rounded
                        text-gray-400 dark:text-gray-600
                        hover:text-gray-700 dark:hover:text-gray-300
                        hover:bg-gray-100 dark:hover:bg-gray-800
                        disabled:opacity-0 disabled:cursor-default
                        transition-colors
                    "
                >
                    <LuChevronUp size={13} />
                </button>
                <button
                    onClick={() => moveDown(cell.id)}
                    disabled={isLast}
                    title="Move cell down"
                    className="
                        w-6 h-6 flex items-center justify-center rounded
                        text-gray-400 dark:text-gray-600
                        hover:text-gray-700 dark:hover:text-gray-300
                        hover:bg-gray-100 dark:hover:bg-gray-800
                        disabled:opacity-0 disabled:cursor-default
                        transition-colors
                    "
                >
                    <LuChevronDown size={13} />
                </button>
            </div>

            {children}
        </div>
    )
}

function AddCellBar() {
    const { addCell } = useCellStore()
    return (
        <div className="flex items-center gap-2">
            <button
                onClick={() => addCell('sql')}
                className="
                    flex-1 py-2 rounded-lg
                    border border-dashed border-gray-300 dark:border-gray-700
                    text-xs text-gray-400 dark:text-gray-600
                    hover:border-blue-400 dark:hover:border-blue-600
                    hover:text-blue-500 dark:hover:text-blue-400
                    transition-colors
                "
            >
                + SQL
            </button>
            <button
                onClick={() => addCell('markdown')}
                className="
                    flex-1 py-2 rounded-lg
                    border border-dashed border-gray-300 dark:border-gray-700
                    text-xs text-gray-400 dark:text-gray-600
                    hover:border-blue-400 dark:hover:border-blue-600
                    hover:text-blue-500 dark:hover:text-blue-400
                    transition-colors
                "
            >
                + Markdown
            </button>
        </div>
    )
}

function MainArea() {
    const { cells, addCell } = useCellStore()

    return (
        <main
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
                    <div className="flex items-center gap-2 mt-2">
                        <button
                            onClick={() => addCell('sql')}
                            className="
                                text-xs px-4 py-2 rounded
                                bg-blue-600 hover:bg-blue-500
                                text-white font-medium transition-colors
                            "
                        >
                            + SQL cell
                        </button>
                        <button
                            onClick={() => addCell('markdown')}
                            className="
                                text-xs px-4 py-2 rounded
                                bg-gray-600 hover:bg-gray-500
                                text-white font-medium transition-colors
                            "
                        >
                            + Markdown cell
                        </button>
                    </div>
                </div>
            ) : (
                <div className="p-6 pl-14 flex flex-col gap-1 max-w-4xl mx-auto">
                    {cells.map((cell, idx) => (
                        <div key={cell.id}>
                            <CellWrapper
                                cell={cell}
                                isFirst={idx === 0}
                                isLast={idx === cells.length - 1}
                            >
                                {cell.type === 'markdown' ? (
                                    <MarkdownCell cell={cell} />
                                ) : (
                                    <SqlCell cell={cell} />
                                )}
                            </CellWrapper>
                            <InsertBar afterId={cell.id} />
                        </div>
                    ))}
                    <AddCellBar />
                </div>
            )}
        </main>
    )
}

export default MainArea
