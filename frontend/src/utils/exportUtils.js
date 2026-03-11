/**
 * Triggers a file download in the browser by creating a temporary object URL.
 *
 * @param {string} content - The file content.
 * @param {string} filename - Suggested download filename.
 * @param {string} mime - MIME type (e.g. 'text/csv', 'application/json').
 */
export function download(content, filename, mime) {
    const blob = URL.createObjectURL(new Blob([content], { type: mime }))
    const a = Object.assign(document.createElement('a'), { href: blob, download: filename })
    a.click()
    URL.revokeObjectURL(blob)
}

/**
 * Exports query results as a RFC 4180 CSV file and triggers a browser download.
 * Values containing commas, double-quotes, or newlines are escaped with double-quoting.
 *
 * @param {{ columns: string[], rows: Array<Array<*>|Object> }} results
 */
export function exportCSV(results) {
    if (!results) return
    const header = results.columns.join(',')
    const rows = results.rows.map((row) =>
        results.columns
            .map((col, i) => {
                const val = Array.isArray(row) ? row[i] : row[col]
                if (val === null || val === undefined) return ''
                const str = String(val)
                return str.includes(',') || str.includes('"') || str.includes('\n')
                    ? `"${str.replace(/"/g, '""')}"`
                    : str
            })
            .join(',')
    )
    download([header, ...rows].join('\n'), 'results.csv', 'text/csv')
}

/**
 * Exports query results as a JSON array of row objects and triggers a browser download.
 * Each row is converted to { columnName: value, ... } using the columns array.
 *
 * @param {{ columns: string[], rows: Array<Array<*>|Object> }} results
 */
export function exportJSON(results) {
    if (!results) return
    const objects = results.rows.map((row) =>
        Object.fromEntries(
            results.columns.map((col, i) => [col, Array.isArray(row) ? row[i] : row[col]])
        )
    )
    download(JSON.stringify(objects, null, 2), 'results.json', 'application/json')
}
