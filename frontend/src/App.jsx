import useThemeStore from "./store/useThemeStore.js";

function App() {
    const { theme, toggleTheme } = useThemeStore()
    return (
        <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 transition-colors duration-200">

            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <span className="text-sm font-semibold tracking-wide text-gray-700 dark:text-gray-200">
          sql-notebook
        </span>
                <button
                    onClick={toggleTheme}
                    className="text-xs px-3 py-1.5 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                    {theme === 'dark' ? '☀ Light' : '☾ Dark'}
                </button>
            </div>

            <div className="p-6">
                <p className="text-sm text-gray-400 dark:text-gray-500">
                    Scaffold ready — theme: {theme}
                </p>
            </div>

        </div>
    )
}

export default App
