import { useEffect, useRef, useCallback } from 'react'
import useCellStore from '../store/useCellStore.js'

// singleton socket
let socket         = null
let reconnectTimer = null
let pingInterval   = null

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
        function connect() {
            if (socket && (socket.readyState === WebSocket.OPEN ||
                socket.readyState === WebSocket.CONNECTING)) return

            const url = getWsUrl()
            console.debug('[WS] connecting to', url)
            socket = new WebSocket(url)

            socket.onopen = () => {
                console.debug('[WS] connected')
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

                const { cellId, status, result, message } = msg
                if (cellId === undefined || cellId === null) return

                // Normalise to number — cell store uses numeric ids
                const id = typeof cellId === 'string' ? parseInt(cellId, 10) : cellId
                const { setRunning, setResults, setError } = handlersRef.current

                if (status === 'running') {
                    setRunning(id)
                } else if (status === 'done') {
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
                    setError(id, message ?? 'Unknown error')
                }
            }

            socket.onclose = (event) => {
                console.debug('[WS] closed — code:', event.code)
                clearInterval(pingInterval)
                reconnectTimer = setTimeout(connect, 2000)
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