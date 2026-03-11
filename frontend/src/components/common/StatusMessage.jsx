/**
 * Displays a themed status banner for success, error, or in-progress states.
 * Renders nothing when message is falsy.
 *
 * @param {{ status: 'success' | 'error' | string | null, message: string }} props
 */
export function StatusMessage({ status, message }) {
    if (!message) return null
    const cls =
        status === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
            : status === 'error'
              ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
              : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
    return <div className={`text-xs px-3 py-2 rounded font-mono ${cls}`}>{message}</div>
}
