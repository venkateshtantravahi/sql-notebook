import { useEffect, useRef, useCallback } from 'react'
import useCellStore from '../store/useCellStore.js'

/**
 * useQuerySocket
 *
 * Manages a singleton WebSocket connection to the backend query endpoint.
 * Returns a `runQuery(cellId, namespace, query)` function.
 *
 * Resilience strategy:
 *   - If the socket closes unexpectedly, reconnect with exponential backoff
 *     (1s → 2s → 4s, max 3 attempts before giving up)
 *   - If a query is in-flight when the socket dies, surface an error on that
 *     cell immediately rather than leaving it spinning forever
 *   - On reconnect, the caller can re-run the query — cells are not auto-retried
 *     because a failed query mid-execution may have had partial side effects
 *     (e.g. partial INSERT) and auto-retry could be dangerous
 *   - Intentional close (component unmount) does not trigger reconnect
 *
 * Protocol:
 *   Send:    { cellId: string, namespace: string, query: string }
 *   Receive: { cellId, status: 'running' }
 *            { cellId, status: 'done',  result: { columns, rows, rowCount, duration } }
 *            { cellId, status: 'error', error: string }
 */


// singleton socket
let socket         = null
let reconnectTimer = null
let pingInterval   = null
let retryCount = 0
let intentionalStop = false
let inFlightCellId = null

const MAX_RETRIES = 3
const BASE_BACKOFF_MS = 1000

function getWsUrl() {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    return `${proto}://${window.location.host}/ws/query`
}

// hook

export function useQuerySocket() {
    const { setRunning, setResults, setError } = useCellStore()
    const handlersRef = useRef({ setRunning, setResults, setError })

    useEffect(() => {
        handlersRef.current = { setRunning, setResults, setError }
    }, [setRunning, setResults, setError])

    useEffect(() => {
        intentionalStop = false

        function connect() {
            if (socket && (socket.readyState === WebSocket.OPEN ||
                socket.readyState === WebSocket.CONNECTING)) return

            const url = getWsUrl()
            console.debug('[WS] connecting to', url)
            socket = new WebSocket(url)

            socket.onopen = () => {
                console.debug('[WS] connected')
                retryCount = 0
                // Ping every 20s to prevent Jetty's 30s idle timeout
                clearInterval(pingInterval)
                pingInterval = setInterval(() => {
                    if (socket?.readyState === WebSocket.OPEN) {
                        socket.send(JSON.stringify({ type: 'ping' }))
                    } else {
                        clearInterval(pingInterval)
                    }
                }, 20000)
            }

            socket.onmessage = (event) => {
                console.debug('[WS] message:', event.data)
                let msg
                try { msg = JSON.parse(event.data) } catch (e) {
                    console.error('[WS] failed to parse message:', event.data, e)
                    return
                }

                // Ignore server-side pong replies
                if (msg.type === 'pong') return

                const { cellId, status, result, message } = msg
                if (cellId === undefined || cellId === null) return

                // Normalise to number — cell store uses numeric ids
                const id = typeof cellId === 'string' ? parseInt(cellId, 10) : cellId
                const { setRunning, setResults, setError } = handlersRef.current

                if (status === 'running') {
                    inFlightCellId = id
                    setRunning(id)
                } else if (status === 'done') {
                    inFlightCellId = null
                    if (result?.success) {
                        setResults(id, {
                            columns:  result.columns  ?? [],
                            rows:     result.rows     ?? [],
                            rowCount: result.rows?.length ?? 0,
                            duration: result.executionTimeMs ?? 0,
                        })
                    } else {
                        setError(id, result?.errorMessage ?? 'Query failed')
                    }
                } else if (status === 'error') {
                    inFlightCellId = null
                    setError(id, message ?? 'Unknown error')
                }
            }

            socket.onclose = (event) => {
                console.debug('[ws] closed — code:', event.code)
                clearInterval(pingInterval)
                socket = null

                // If a query was in-flight, error it immediately —
                // don't leave the cell spinning with no feedback
                if (inFlightCellId != null) {
                    handlersRef.current.setError(
                        inFlightCellId,
                        'Connection lost while query was running. ' +
                        'Check the backend is running and try again.'
                    )
                    inFlightCellId = null
                }

                // Intentional unmount — don't reconnect
                if (intentionalStop) return

                // Exponential backoff reconnect
                if (retryCount >= MAX_RETRIES) {
                    console.warn(
                        `[ws] Giving up after ${MAX_RETRIES} attempts. ` +
                        'Reload the page or restart the backend.'
                    )
                    return
                }

                const delay = BASE_BACKOFF_MS * Math.pow(2, retryCount)
                retryCount++
                console.info(
                    `[ws] Reconnecting in ${delay}ms ` +
                    `(attempt ${retryCount}/${MAX_RETRIES})…`
                )
                reconnectTimer = setTimeout(connect, delay)
            }

            socket.onerror = (error) => {
                console.error('[WS] error:', error)
                socket.close()
            }
        }

        connect()

        return () => {
            clearTimeout(reconnectTimer)
            clearInterval(pingInterval)
            intentionalStop = true
        }
    }, [])

    const runQuery = useCallback((cellId, namespace, sql) => {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            console.warn('[WS] socket not ready, retrying in 300ms')
            setTimeout(() => runQuery(cellId, namespace, sql), 300)
            return
        }
        const payload = { cellId, namespace, sql }
        console.debug('[WS] sending:', payload)
        socket.send(JSON.stringify(payload))
    }, [])

    return runQuery
}