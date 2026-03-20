import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { sql } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorState, Compartment } from '@codemirror/state'
import useThemeStore from '../../store/useThemeStore.js'
import useCellStore from '../../store/useCellStore.js'
import CellToolbar from './CellToolbar.jsx'
import ResultsTable from './ResultsTable.jsx'
import useZoomStore from '../../store/useZoomStore.js'
import { useQuerySocket } from '../../hooks/useQuerySocket.js'
import { useFetchNamespaces } from '../../hooks/useFetchNamespaces.js'

const themeCompartment = new Compartment()
const fontCompartment = new Compartment()

function buildThemeExt(isDark) {
    return isDark ? oneDark : []
}

function buildFontExt(level) {
    return EditorView.theme({
        '&': { fontSize: `${level * 13}px`, minHeight: '80px' },
        '.cm-editor': { borderRadius: '0' },
        '.cm-scroller': { fontFamily: 'JetBrains Mono, Fira Code, Menlo, monospace' },
    })
}

function SqlCell({ cell }) {
    const { theme } = useThemeStore()
    const { level } = useZoomStore()
    const { updateSource, updateNamespace, deleteCell } = useCellStore()
    const editorRef = useRef(null)
    const viewRef = useRef(null)
    const runQuery = useQuerySocket()
    const namespaces = useFetchNamespaces()

    // Build editor ONCE - theme and font go through Compartments so they
    // can be hot-swapped when the stores change without remounting.
    useEffect(() => {
        if (!editorRef.current) return

        const view = new EditorView({
            state: EditorState.create({
                doc: cell.source,
                extensions: [
                    basicSetup,
                    sql(),
                    themeCompartment.of(buildThemeExt(theme === 'dark')),
                    fontCompartment.of(buildFontExt(level)),
                    EditorView.updateListener.of((update) => {
                        if (update.docChanged) {
                            updateSource(cell.id, update.state.doc.toString())
                        }
                    }),
                ],
            }),
            parent: editorRef.current,
        })

        viewRef.current = view
        return () => view.destroy()
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Hot-swap theme when store changes - no remount needed
    useEffect(() => {
        viewRef.current?.dispatch({
            effects: themeCompartment.reconfigure(buildThemeExt(theme === 'dark')),
        })
    }, [theme])

    // Hot-swap font size when zoom changes - no remount needed
    useEffect(() => {
        viewRef.current?.dispatch({
            effects: fontCompartment.reconfigure(buildFontExt(level)),
        })
    }, [level])

    function isFederatedQuery(sql) {
        if (!sql || namespaces.length === 0) return false
        const pattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\./g
        const found = new Set()
        let m
        while ((m = pattern.exec(sql)) !== null) {
            if (namespaces.includes(m[1])) found.add(m[1])
        }
        return found.size >= 2
    }

    function handleRun() {
        const sql = cell.source.trim()
        if (!sql) return
        const federated = isFederatedQuery(sql)
        if (!federated && !cell.namespace) return
        // Federated queries send namespace=null - backend routes to FederatedQueryExecutor
        runQuery(cell.id, federated ? null : cell.namespace, sql)
    }

    return (
        <div
            className="
            rounded-lg border border-gray-200 dark:border-gray-700
            bg-white dark:bg-[#161f2e]
            shadow-sm overflow-hidden
        "
        >
            <CellToolbar
                cell={cell}
                namespaces={namespaces}
                onRun={handleRun}
                onDelete={() => deleteCell(cell.id)}
                onNamespaceChange={(ns) => updateNamespace(cell.id, ns)}
            />
            <div ref={editorRef} className="border-b border-gray-200 dark:border-gray-700" />
            <ResultsTable results={cell.results} error={cell.error} status={cell.status} />
        </div>
    )
}

export default SqlCell
