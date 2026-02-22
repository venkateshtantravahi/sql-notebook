import useThemeStore from "../../store/useThemeStore.js";

function Header() {
    const { theme, toggleTheme } = useThemeStore()

    return (
        <header className="
      fixed top-0 left-0 right-0 z-50 h-12
      flex items-center justify-between px-4
      bg-white dark:bg-gray-900
      border-b border-gray-200 dark:border-gray-800
    ">
            {/* Left — logo + app name */}
            <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">S</span>
                </div>
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 tracking-wide">
          sql-notebook
        </span>
            </div>

            {/* Center — placeholder for menus (feat/header-menu) */}
            <div className="flex items-center gap-1">
                {['File', 'View', 'Help'].map((item) => (
                    <button
                        key={item}
                        className="
              text-xs px-3 py-1.5 rounded
              text-gray-500 dark:text-gray-400
              hover:bg-gray-100 dark:hover:bg-gray-800
              hover:text-gray-800 dark:hover:text-gray-100
              transition-colors
            "
                    >
                        {item}
                    </button>
                ))}
            </div>

            {/* Right — theme toggle + new cell button */}
            <div className="flex items-center gap-2">
                <button
                    onClick={toggleTheme}
                    className="
            text-xs px-3 py-1.5 rounded
            text-gray-500 dark:text-gray-400
            hover:bg-gray-100 dark:hover:bg-gray-800
            hover:text-gray-700 dark:hover:text-gray-200
            transition-colors
          "
                >
                    {theme === 'dark' ? '☀ Light' : '☾ Dark'}
                </button>
                <button
                    className="
            text-xs px-3 py-1.5 rounded
            bg-blue-600 hover:bg-blue-500
            text-white font-medium
            transition-colors
          "
                >
                    + Cell
                </button>
            </div>
        </header>
    )
}

export default Header