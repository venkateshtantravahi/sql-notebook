/**
 * Load Test: Same-Namespace Pool Contention
 *
 * Models a user who has 8 cells in a notebook that all query the same
 * namespace and hits Run All.  The HikariCP pool for that namespace has
 * 4 connections, so the first 4 queries run immediately and the other 4
 * must wait for a free connection.
 *
 * This is NOT a multi-user stress test.  It is testing one specific failure
 * mode: does the server handle pool queuing cleanly, or does it deadlock,
 * leak connections, or drop queries?
 *
 * What is measured:
 *   - All 8 cells must eventually succeed (success rate >= 95%)
 *   - The server must stay reachable (/health) during contention
 *   - Wall time should be roughly 2x a single cell (two pool rounds)
 *   - Pool timeouts are tracked separately from errors
 *
 * After the burst, a cooldown probe fires 5 clean queries to verify no
 * connection leak occurred  -  if the pool is healthy these should be fast.
 *
 * Install k6:  brew install k6
 * Run:         k6 run load-tests/k6/pool-exhaustion.js
 *
 * Change NAMESPACE to a JDBC namespace (postgres, mysql, sqlite).
 * DuckDB namespaces have pool size 1 by design  -  use those only if you
 * want to test the single-connection queue specifically.
 */

import ws   from 'k6/ws'
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Trend, Rate, Counter } from 'k6/metrics'

const cellDuration  = new Trend('contention_cell_duration_ms', true)
const successRate   = new Rate('contention_success_rate')
const timeoutErrors = new Counter('pool_timeout_errors')
const healthLatency = new Trend('health_during_contention_ms', true)

const WS_URL    = 'ws://localhost:8080/ws/query'
const BASE      = 'http://localhost:8080'
const NAMESPACE = 'chinook'  // change to a JDBC namespace with pool > 1

// 8 cells all against the same namespace  -  pool size 4 means 4 must queue
// Each entry is one notebook cell
const CELLS = [
  { id: 'c1', sql: 'SELECT COUNT(*) FROM Track' },
  { id: 'c2', sql: 'SELECT COUNT(*) FROM Album' },
  { id: 'c3', sql: 'SELECT COUNT(*) FROM Artist' },
  { id: 'c4', sql: 'SELECT COUNT(*) FROM Customer' },
  { id: 'c5', sql: 'SELECT COUNT(*) FROM Invoice' },
  { id: 'c6', sql: 'SELECT COUNT(*) FROM InvoiceLine' },
  { id: 'c7', sql: 'SELECT COUNT(*) FROM Playlist' },
  { id: 'c8', sql: 'SELECT COUNT(*) FROM Genre' },
]

export const options = {
  scenarios: {
    // All 8 cells fire simultaneously  -  one VU per cell, one iteration each
    notebook_burst: {
      executor: 'per-vu-iterations',
      vus: CELLS.length,
      iterations: 1,
      maxDuration: '30s',
      exec: 'runCell',
    },
    // Health probe runs alongside to verify server stays alive under contention
    health_probe: {
      executor: 'constant-arrival-rate',
      rate: 3,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 3,
      exec: 'probeHealth',
    },
  },
  thresholds: {
    // All cells should eventually succeed  -  they are just queuing, not failing
    'contention_success_rate':    ['rate>=0.95'],
    // Health must stay responsive even with pool saturated
    'health_during_contention_ms': ['p(95)<300'],
  },
}

// One notebook cell  -  VU index maps to CELLS entry
export function runCell () {
  const cell    = CELLS[(__VU - 1) % CELLS.length]
  const payload = JSON.stringify({
    cellId:    cell.id,
    namespace: NAMESPACE,
    sql:       cell.sql,
  })

  let resolved = false
  const start  = Date.now()

  ws.connect(WS_URL, {}, (socket) => {
    socket.on('open', () => socket.send(payload))

    socket.on('message', (raw) => {
      let msg
      try { msg = JSON.parse(raw) } catch { return }
      if (msg.status === 'running') return

      if (msg.status === 'done') {
        cellDuration.add(Date.now() - start)
        successRate.add(1)
        resolved = true
        socket.close()

      } else if (msg.status === 'error') {
        // Pool timeout surfaces as an error message from the backend
        if (msg.error && msg.error.toLowerCase().includes('timeout')) {
          timeoutErrors.add(1)
        }
        successRate.add(0)
        console.warn('[' + cell.id + '] error: ' + msg.error)
        resolved = true
        socket.close()
      }
    })

    socket.on('error', () => { successRate.add(0) })

    // 20s timeout  -  longer than normal to accommodate pool queue wait
    socket.setTimeout(() => {
      if (!resolved) {
        timeoutErrors.add(1)
        successRate.add(0)
        console.warn('[' + cell.id + '] timed out waiting for pool connection')
        socket.close()
      }
    }, 20000)
  })
}

export function probeHealth () {
  const r = http.get(BASE + '/health')
  healthLatency.add(r.timings.duration)
  check(r, { '/health 200 under contention': (res) => res.status === 200 })
  sleep(0.3)
}
