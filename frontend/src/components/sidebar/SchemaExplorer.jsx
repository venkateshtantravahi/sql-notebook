import useSchema from '../../hooks/useSchema.js'

// ── column type badge ────────────────────────────────────────────────────────

function TypeBadge({ type }) {
    const color =
        type.includes('INT')     ? 'text-blue-400 dark:text-blue-400' :
            type.includes('VARCHAR') ? 'text-green-400 dark:text-green-400' :
                type.includes('TEXT')    ? 'text-green-400 dark:text-green-400' :
                    type.includes('DATE')    ? 'text-purple-400 dark:text-purple-400' :
                        type.includes('TIME')    ? 'text-purple-400 dark:text-purple-400' :
                            type.includes('BOOL')    ? 'text-yellow-400 dark:text-yellow-400' :
                                type.includes('DECIMAL') ? 'text-orange-400 dark:text-orange-400' :
                                    type.includes('NUMERIC') ? 'text-orange-400 dark:text-orange-400' :
                                        type.includes('FLOAT')   ? 'text-orange-400 dark:text-orange-400' :
                                            type.includes('MONEY')   ? 'text-orange-400 dark:text-orange-400' :
                                                'text-gray-400 dark:text-gray-500'

    return (
        <span className={`font-mono text-xs ${color}`}>
      {type}
    </span>
    )
}

// ── single column row ────────────────────────────────────────────────────────

function ColumnRow({ column }) {
    const icon = column.primaryKey ? '🔑' : column.foreignKey ? '🔗' : null

    return (
        <div className="
      flex items-center justify-between
      pl-6 pr-3 py-0.5
      group cursor-pointer
      hover:bg-gray-100 dark:hover:bg-gray-800
      rounded
    ">
            <div className="flex items-center gap-1.5 min-w-0">
                {icon ? (
                    <span className="text-xs w-4 flex-shrink-0">{icon}</span>
                ) : (
                    <span className="w-4 flex-shrink-0" />
                )}
                <span className="
          font-mono text-xs truncate
          text-gray-700 dark:text-gray-300
          group-hover:text-gray-900 dark:group-hover:text-gray-100
        ">
          {column.name}
        </span>
            </div>
            <TypeBadge type={column.type} />
        </div>
    )
}

// ── single table block ───────────────────────────────────────────────────────

function TableBlock({ table }) {
    return (
        <div className="mb-1">
            {/* Table name row */}
            <div className="
        flex items-center gap-1.5
        px-3 py-1
        cursor-pointer
        hover:bg-gray-100 dark:hover:bg-gray-800
        rounded
        group
      ">
                <span className="text-gray-400 dark:text-gray-600 text-xs">▼</span>
                <span className="
          text-xs font-semibold
          text-gray-700 dark:text-gray-200
          group-hover:text-gray-900 dark:group-hover:text-gray-100
          font-mono
        ">
          {table.name}
        </span>
                <span className="ml-auto text-xs text-gray-300 dark:text-gray-700">
          {table.columns.length}
        </span>
            </div>

            {/* Column rows */}
            <div>
                {table.columns.map(col => (
                    <ColumnRow key={col.name} column={col} />
                ))}
            </div>
        </div>
    )
}

// ── single namespace block ───────────────────────────────────────────────────

function NamespaceBlock({ ns }) {
    return (
        <div className="mb-4">
            {/* Namespace header */}
            <div className="
        px-3 py-1.5 mb-1
        flex items-center gap-2
      ">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                <span className="
          text-xs font-bold uppercase tracking-wider
          text-gray-500 dark:text-gray-400
          font-mono
        ">
          {ns.namespace}
        </span>
                <span className="ml-auto text-xs text-gray-300 dark:text-gray-700">
          {ns.tables.length} tables
        </span>
            </div>

            {/* Tables */}
            <div className="px-1">
                {ns.tables.map(table => (
                    <TableBlock key={table.name} table={table} />
                ))}
            </div>
        </div>
    )
}

// ── main component ───────────────────────────────────────────────────────────

function SchemaExplorer() {
    const { schema, loading, error } = useSchema()

    if (loading) {
        return (
            <div className="p-3 space-y-2">
                {[1, 2, 3].map(i => (
                    <div key={i} className="animate-pulse">
                        <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-3/4 mb-1.5" />
                        <div className="h-2.5 bg-gray-100 dark:bg-gray-850 rounded w-full mb-1" />
                        <div className="h-2.5 bg-gray-100 dark:bg-gray-850 rounded w-5/6 mb-1" />
                        <div className="h-2.5 bg-gray-100 dark:bg-gray-850 rounded w-4/6" />
                    </div>
                ))}
            </div>
        )
    }

    if (error) {
        return (
            <div className="p-3">
                <p className="text-xs text-red-400 dark:text-red-500">
                    Failed to load schema
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-600 mt-1 font-mono break-all">
                    {error}
                </p>
            </div>
        )
    }

    if (schema.length === 0) {
        return (
            <div className="p-3">
                <p className="text-xs text-gray-400 dark:text-gray-600 italic">
                    No namespaces configured
                </p>
            </div>
        )
    }

    return (
        <div className="py-2">
            {schema.map(ns => (
                <NamespaceBlock key={ns.namespace} ns={ns} />
            ))}
        </div>
    )
}

export default SchemaExplorer