import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { sql } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorState } from '@codemirror/state'
import useThemeStore from '../../store/useThemeStore.js'
import useCellStore from '../../store/useCellStore.js'
import CellToolbar from './CellToolbar.jsx'
import ResultsTable from './ResultsTable.jsx'

// Mock results for UI testing — replaced by real WS response in feat/cell-core-ws
const MOCK_RESULTS = {
    columns:  ['customerID', 'firstName', 'lastName', 'birthDate'],
    rows: [
        { customerID: 1, firstName: 'John',  lastName: 'Doe',   birthDate: '1990-01-01' },
        { customerID: 2, firstName: 'Jane',  lastName: 'Smith', birthDate: '1985-06-15' },
        { customerID: 3, firstName: 'Bob',   lastName: 'Jones', birthDate: '1978-03-22' },
    ],
    rowCount: 3,
    duration: 42,
}

function SqlCell({ cell }) {
    const { theme } = useThemeStore()
    const { updateQuery, updateNamespace, setRunning, setResults, deleteCell } = useCellStore()
    const editorRef  = useRef(null)
    const viewRef    = useRef(null)

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
                            fontSize: '13px',
                            minHeight: '80px',
                        },
                        '.cm-editor': { borderRadius: '0' },
                        '.cm-scroller': { fontFamily: 'JetBrains Mono, Fira Code, Menlo, monospace' },
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

    // Swap theme without remounting editor
    useEffect(() => {
        if (!viewRef.current) return
        viewRef.current.dispatch({
            effects: [],
        })
    }, [theme])

    function handleRun() {
        if (!cell.namespace || !cell.query.trim()) return
        setRunning(cell.id)
        // TODO: fire WebSocket in feat/cell-core-ws
        // For now show mock results after a short delay
        setTimeout(() => {
            setResults(cell.id, MOCK_RESULTS)
        }, 800)
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