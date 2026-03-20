/**
 * Wraps a label, input slot, and optional validation error message.
 * Pass the actual input element as children.
 *
 * @param {{ label: string, htmlFor?: string, error?: string, children: React.ReactNode }} props
 */
export function Field({ label, htmlFor, error, children }) {
    return (
        <div className="flex flex-col gap-1">
            <label
                htmlFor={htmlFor}
                className="text-xs font-medium text-gray-600 dark:text-gray-400"
            >
                {label}
            </label>
            {children}
            {error && <span className="text-xs text-red-500 dark:text-red-400">{error}</span>}
        </div>
    )
}

/**
 * Styled text/password/number input with consistent theme-aware appearance.
 * Accepts all standard HTML input attributes via spread.
 *
 * @param {{ className?: string } & React.InputHTMLAttributes<HTMLInputElement>} props
 */
export function Input({ className = '', ...props }) {
    return (
        <input
            className={`
            w-full px-3 py-2 rounded text-sm font-mono
            bg-gray-50 dark:bg-gray-800
            border border-gray-200 dark:border-gray-700
            text-gray-800 dark:text-gray-100
            placeholder-gray-300 dark:placeholder-gray-600
            focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
            focus:border-transparent transition-colors
            ${className}
        `}
            {...props}
        />
    )
}
