import useNotebookStore from "../store/useNotebookStore.js";
import useCellStore from "../store/useCellStore.js";
import {useEffect, useRef} from "react";


const AUTOSAVE_INTERVAL_MS = 30_000

/**
 * Wires a 30-second autosave interval.
 * Only saves when the notebook is dirty (has unsaved changes).
 * Saves to localStorage via useNotebookStore.save() — same path
 * the explicit Cmd+S save uses, so they don't conflict.
*/
function useAutoSave() {
    const { isDirty, save } = useNotebookStore()
    const { getSnapshot } = useCellStore()

    // keep a ref to isDirty so the interval closure always sees the latest value
    const isDirtyRef = useRef(isDirty)
    useEffect(() => { isDirtyRef.current = isDirty}, [isDirty])

    useEffect(() => {
        const interval = setInterval(() => {
            if (!isDirtyRef.current) return
            const snapshots = getSnapshot()
            save(snapshots)
            console.debug('[autosave] notebook saved at', new Date().toLocaleTimeString())
        }, AUTOSAVE_INTERVAL_MS)
        return () => clearInterval(interval)
    }, [save, getSnapshot])
}

export default useAutoSave