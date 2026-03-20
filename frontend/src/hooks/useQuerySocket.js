import { useEffect, useRef, useCallback } from 'react'
import useCellStore from '../store/useCellStore.js'
import { useBackendReady } from './useBackendReady.js'

// useQuerySocket - manages a singleton WebSocket to the backend query endpoint.
// Returns runQuery(cellId, namespace, query).
// Reconnects with exponential backoff on unexpected close (max 3 attempts).
// In-flight queries surface an error immediately if the socket dies.
// Protocol - send: { cellId, namespace, query }
//           receive: { cellId, status: 'running' | 'done' | 'error', result?, error? }

// singleton socket
let socket = null
let reconnectTimer = null
let pingInterval = null
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
    const backendReady = useBackendReady()

    useEffect(() => {
        handlersRef.current = { setRunning, setResults, setError }
    }, [setRunning, setResults, setError])

    // Gate on backendReady:
    //  - Without this, the socket burns all MAX_RETRIES during the JVM startup
    //    window and then gives up permanently, leaving queries broken until
    //    the user manually reloads.
    //  - retryCount is reset to 0 each time so the full retry budget is
    //    available after readiness (e.g. after a backend restart).
    useEffect(() => {
        if (!backendReady) return

        intentionalStop = false
        retryCount = 0

        function connect() {
            if (
                socket &&
                (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
            )
                return

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
                try {
                    msg = JSON.parse(event.data)
                } catch (e) {
                    console.error('[WS] failed to parse message:', event.data, e)
                    return
                }

                // Ignore server-side pong replies
                if (msg.type === 'pong') return

                // Backend sends: { cellId, status, result, error }
                // (field is "error", not "message")
                const { cellId, status, result, error: backendError } = msg
                if (cellId === undefined || cellId === null) return

                // cellId is an opaque string - use it as-is
                const id = String(cellId)

                const { setRunning, setResults, setError } = handlersRef.current

                if (status === 'running') {
                    inFlightCellId = id
                    setRunning(id)
                } else if (status === 'done') {
                    inFlightCellId = null
                    if (result?.success) {
                        setResults(id, {
                            columns: result.columns ?? [],
                            rows: result.rows ?? [],
                            rowCount: result.rows?.length ?? 0,
                            duration: result.executionTimeMs ?? 0,
                        })
                    } else {
                        setError(id, result?.errorMessage ?? 'Query failed')
                    }
                } else if (status === 'error') {
                    inFlightCellId = null
                    setError(id, backendError ?? 'Unknown error')
                }
            }

            socket.onclose = (event) => {
                console.debug('[ws] closed - code:', event.code)
                clearInterval(pingInterval)
                socket = null

                // If a query was in-flight, error it immediately -
                // don't leave the cell spinning with no feedback
                if (inFlightCellId != null) {
                    handlersRef.current.setError(
                        inFlightCellId,
                        'Connection lost while query was running. ' +
                            'Check the backend is running and try again.'
                    )
                    inFlightCellId = null
                }

                // Intentional unmount - don't reconnect
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
                    `[ws] Reconnecting in ${delay}ms ` + `(attempt ${retryCount}/${MAX_RETRIES})...`
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
    }, [backendReady])

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
