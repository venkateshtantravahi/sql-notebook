
function BottomBar() {
    return (
        <footer className="
      fixed bottom-0 left-0 right-0 h-10
      flex items-center px-4 gap-6
      bg-white dark:bg-gray-900
      border-t border-gray-200 dark:border-gray-800
    ">
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
        Namespace Health
      </span>

            {/* Placeholder namespace indicators */}
            <div className="flex items-center gap-4">
                {['prod', 'staging', 'local'].map((ns) => (
                    <div key={ns} className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
                        <span className="text-xs text-gray-400 dark:text-gray-600 font-mono">
              {ns}
            </span>
                    </div>
                ))}
            </div>

            {/* Right side — version */}
            <div className="ml-auto">
        <span className="text-xs text-gray-300 dark:text-gray-700 font-mono">
          v0.1.0
        </span>
            </div>
        </footer>
    )
}

export default BottomBar