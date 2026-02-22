import SchemaExplorer from "../sidebar/SchemaExplorer.jsx";

function Sidebar() {
    return (
        <aside className="
      fixed top-12 left-0 bottom-10 w-64
      bg-gray-50 dark:bg-gray-900
      border-r border-gray-200 dark:border-gray-800
      flex flex-col overflow-hidden
    ">
            {/* Schema Explorer */}
            <div className="flex-1 overflow-y-auto">
                <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800 sticky top-0 bg-gray-50 dark:bg-gray-900 z-10">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Schema Explorer
          </span>
                </div>
                <SchemaExplorer />
            </div>

            {/* Pinned Datasets */}
            <div className="border-t border-gray-200 dark:border-gray-800 flex-shrink-0">
                <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-800">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Pinned Datasets
          </span>
                </div>
                <div className="p-3">
                    <p className="text-xs text-gray-400 dark:text-gray-600 italic">
                        No pinned datasets yet
                    </p>
                </div>
            </div>
        </aside>
    )
}

export default Sidebar