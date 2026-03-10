import { useState } from 'react'
import useSchema from '../../hooks/useSchema.js'
import useThemeStore from '../../store/useThemeStore.js'
import SchemaErd from './SchemaErd.jsx'
import { LuKey, LuLink2 } from 'react-icons/lu'
import { MdAccountTree, MdExpandMore, MdChevronRight } from 'react-icons/md'
import { TbTopologyComplex } from 'react-icons/tb'

// type badge
function TypeBadge({ type }) {
    const color = type.includes('INT')
        ? 'text-blue-400'
        : type.includes('VARCHAR')
          ? 'text-green-400'
          : type.includes('TEXT')
            ? 'text-green-400'
            : type.includes('NVAR')
              ? 'text-green-400'
              : type.includes('DATE')
                ? 'text-purple-400'
                : type.includes('TIME')
                  ? 'text-purple-400'
                  : type.includes('BOOL')
                    ? 'text-yellow-400'
                    : type.includes('DECIMAL')
                      ? 'text-orange-400'
                      : type.includes('NUMERIC')
                        ? 'text-orange-400'
                        : type.includes('FLOAT')
                          ? 'text-orange-400'
                          : type.includes('MONEY')
                            ? 'text-orange-400'
                            : 'text-gray-400 dark:text-gray-500'
    return <span className={`font-mono text-xs ${color}`}>{type}</span>
}

// column row
function ColumnRow({ column }) {
    const icon = column.primaryKey ? (
        <LuKey className="text-amber-400 flex-shrink-0" size={11} />
    ) : column.foreignKey ? (
        <LuLink2 className="text-blue-400 flex-shrink-0" size={11} />
    ) : null
    return (
        <div
            className="
            flex items-center justify-between
            pl-6 pr-3 py-0.5 rounded group cursor-pointer
            hover:bg-gray-100 dark:hover:bg-gray-800
        "
        >
            <div className="flex items-center gap-1.5 min-w-0">
                {icon ? (
                    <span className="w-4 flex-shrink-0 flex items-center">{icon}</span>
                ) : (
                    <span className="w-4 flex-shrink-0" />
                )}
                <span className="font-mono text-xs truncate text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100">
                    {column.name}
                </span>
            </div>
            <TypeBadge type={column.type} />
        </div>
    )
}

// table block
function TableBlock({ table }) {
    const [open, setOpen] = useState(true)
    return (
        <div className="mb-1">
            <div
                className="flex items-center gap-1.5 px-3 py-1 rounded cursor-pointer group hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() => setOpen((o) => !o)}
            >
                {open ? (
                    <MdExpandMore
                        className="text-gray-400 dark:text-gray-600 flex-shrink-0"
                        size={14}
                    />
                ) : (
                    <MdChevronRight
                        className="text-gray-400 dark:text-gray-600 flex-shrink-0"
                        size={14}
                    />
                )}
                <span className="text-xs font-semibold font-mono text-gray-700 dark:text-gray-200 group-hover:text-gray-900 dark:group-hover:text-gray-100">
                    {table.name}
                </span>
                <span className="ml-auto text-xs text-gray-300 dark:text-amber-50">
                    {table.columns.length}
                </span>
            </div>
            {open && (
                <div>
                    {table.columns.map((col) => (
                        <ColumnRow key={col.name} column={col} />
                    ))}
                </div>
            )}
        </div>
    )
}

//  namespace block
function NamespaceBlock({ ns }) {
    const [open, setOpen] = useState(true)
    return (
        <div className="mb-4">
            <div
                className="px-3 py-1.5 mb-1 flex items-center gap-2 cursor-pointer rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() => setOpen((o) => !o)}
            >
                {open ? (
                    <MdExpandMore className="text-emerald-400 flex-shrink-0" size={14} />
                ) : (
                    <MdChevronRight className="text-emerald-400 flex-shrink-0" size={14} />
                )}
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-white font-mono">
                    {ns.namespace}
                </span>
                <span className="ml-auto text-xs text-gray-300 dark:text-white">
                    {ns.tables.length} tables
                </span>
            </div>
            {open && (
                <div className="px-1">
                    {ns.tables.map((table) => (
                        <TableBlock key={table.name} table={table} />
                    ))}
                </div>
            )}
        </div>
    )
}

// main component

/**
 * @param {string|null} activeNamespace  Filter to single namespace (set by Sidebar).
 */
function SchemaExplorer({ activeNamespace }) {
    const { schema, loading, error } = useSchema()
    const { theme } = useThemeStore()
    const [view, setView] = useState('tree') // 'tree' | 'erd'
    const isDark = theme === 'dark'

    if (loading) {
        return (
            <div className="p-3 space-y-2">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse">
                        <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-3/4 mb-1.5" />
                        <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded w-full mb-1" />
                        <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded w-5/6 mb-1" />
                        <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded w-4/6" />
                    </div>
                ))}
            </div>
        )
    }

    if (error) {
        return (
            <div className="p-3">
                <p className="text-xs text-red-400 dark:text-red-500">Failed to load schema</p>
                <p className="text-xs text-gray-400 dark:text-gray-600 mt-1 font-mono break-all">
                    {error}
                </p>
            </div>
        )
    }

    const visible = activeNamespace
        ? schema.filter((ns) => ns.namespace === activeNamespace)
        : schema

    if (visible.length === 0) {
        return (
            <div className="p-3">
                <p className="text-xs text-gray-400 dark:text-gray-600 italic">
                    {schema.length === 0
                        ? 'No namespaces configured'
                        : `No schema for "${activeNamespace}"`}
                </p>
            </div>
        )
    }

    // Collect all tables for the active namespace(s) for ERD view
    const erdTables = visible.flatMap((ns) => ns.tables)

    return (
        <div className="flex flex-col h-full">
            {/*  View toggle  */}
            <div
                className="
                flex-shrink-0 flex items-center gap-1 px-3 py-1.5
                border-b border-gray-200 dark:border-gray-800
                bg-gray-50 dark:bg-gray-900
            "
            >
                {['tree', 'erd'].map((v) => (
                    <button
                        key={v}
                        onClick={() => setView(v)}
                        className={`
                            px-2.5 py-0.5 rounded text-xs font-medium transition-colors
                            ${
                                view === v
                                    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-white'
                                    : 'text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400'
                            }
                        `}
                    >
                        <span className="flex items-center gap-1">
                            {v === 'tree' ? (
                                <>
                                    <MdAccountTree size={13} /> Tree
                                </>
                            ) : (
                                <>
                                    <TbTopologyComplex size={13} /> ERD
                                </>
                            )}
                        </span>
                    </button>
                ))}
            </div>

            {/*  Content  */}
            {view === 'tree' ? (
                <div className="flex-1 overflow-y-auto py-2">
                    {visible.map((ns) => (
                        <NamespaceBlock key={ns.namespace} ns={ns} />
                    ))}
                </div>
            ) : (
                // ERD fills remaining height — user can resize sidebar for more space
                <div className="flex-1 overflow-hidden">
                    <SchemaErd tables={erdTables} isDark={isDark} />
                </div>
            )}
        </div>
    )
}

export default SchemaExplorer
