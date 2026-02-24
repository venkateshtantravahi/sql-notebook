import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { sql } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorState } from '@codemirror/state'
import useThemeStore from '../../store/useThemeStore.js'
import useCellStore from '../../store/useCellStore.js'
import CellToolbar from './CellToolbar.jsx'
import ResultsTable from './ResultsTable.jsx'
import useZoomStore from '../../store/useZoomStore.js'
import { useQuerySocket } from '../../hooks/useQuerySocket.js'

function SqlCell({ cell }) {
    const { theme } = useThemeStore()
    const { updateQuery, updateNamespace, deleteCell } = useCellStore()
    const editorRef = useRef(null)
    const viewRef   = useRef(null)
    const { level } = useZoomStore()
    const runQuery  = useQuerySocket()

    // Build CodeMirror editor once on mount
    useEffect(() => {
        if (!editorRef.current) return

        const view = new EditorView({
            state: EditorState.create({
                doc: cell.query,
                extensions: [
                    basicSetup,
                    sql(),
                    theme === 'dark' ? oneDark : [],
                    EditorView.theme({
                        '&': {
                            fontSize: `${level * 13}px`,
                            minHeight: '80px',
                        },
                        '.cm-editor':  { borderRadius: '0' },
                        '.cm-scroller': {
                            fontFamily: 'JetBrains Mono, Fira Code, Menlo, monospace'
                        },
                    }),
                    EditorView.updateListener.of(update => {
                        if (update.docChanged) {
                            updateQuery(cell.id, update.state.doc.toString())
                        }
                    }),
                ],
            }),
            parent: editorRef.current,
        })

        viewRef.current = view
        return () => view.destroy()
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Sync zoom level without remounting editor
    useEffect(() => {
        const editorEl = editorRef.current?.querySelector('.cm-editor')
        if (editorEl) editorEl.style.fontSize = `${level * 13}px`
    }, [level, theme])

    function handleRun() {
        if (!cell.namespace || !cell.query.trim()) return
        runQuery(cell.id, cell.namespace, cell.query.trim())
    }

    return (
        <div className="
            rounded-lg border border-gray-200 dark:border-gray-700
            bg-white dark:bg-gray-900
            shadow-sm
            overflow-hidden
        ">
            <CellToolbar
                cell={cell}
                onRun={handleRun}
                onDelete={() => deleteCell(cell.id)}
                onNamespaceChange={ns => updateNamespace(cell.id, ns)}
            />

            {/* CodeMirror editor mount point */}
            <div
                ref={editorRef}
                className="border-b border-gray-200 dark:border-gray-700"
            />

            <ResultsTable
                results={cell.results}
                error={cell.error}
                status={cell.status}
            />
        </div>
    )
}

export default SqlCell