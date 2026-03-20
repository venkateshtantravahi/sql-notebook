/**
 * Load Test: Notebook Run-All Simulation
 *
 * Models a single user clicking "Run All" on a notebook.  Each VU represents
 * one notebook cell.  All cells fire their WebSocket queries simultaneously
 * (per-vu-iterations with 1 iteration = each VU runs exactly once).
 *
 * There is no ramp-up, no looping, and no artificial think-time between
 * iterations - this is a single burst, exactly like the real app sends N
 * WebSocket messages in a tight loop when the user hits Run All.
 *
 * What is measured:
 *   - Whether all cells complete successfully (target: 100%)
 *   - Per-cell query duration distribution (p50 / p95)
 *   - Whether any cell times out under concurrent load
 *
 * Install k6:  brew install k6
 * Run:         k6 run load-tests/k6/ws-concurrent-queries.js
 *
 * Change NAMESPACE to match a namespace you have registered.
 * Add more entries to CELLS to simulate a larger notebook.
 */

import ws from 'k6/ws'
import { check } from 'k6'
import { Trend, Rate, Counter } from 'k6/metrics'

const cellDuration  = new Trend('cell_duration_ms', true)
const cellSuccess   = new Rate('cell_success_rate')
const cellErrors    = new Counter('cell_errors')
const cellTimeouts  = new Counter('cell_timeouts')

const WS_URL    = 'ws://localhost:8080/ws/query'
const NAMESPACE = 'employees'  // change to a registered namespace

// One entry per notebook cell.  VU 1 runs CELLS[0], VU 2 runs CELLS[1], etc.
// Add or remove cells to match the notebook you want to simulate.
const CELLS = [
  { id: 'cell-01', sql: 'SELECT * FROM employees LIMIT 50' },
  { id: 'cell-02', sql: 'SELECT COUNT(*) AS total FROM employees' },
  { id: 'cell-03', sql: 'SELECT * FROM employees LIMIT 100' },
  { id: 'cell-04', sql: 'SELECT * FROM employees ORDER BY 1 DESC LIMIT 25' },
  { id: 'cell-05', sql: 'SELECT * FROM employees LIMIT 200' },
  { id: 'cell-06', sql: 'SELECT COUNT(*) FROM employees WHERE 1=1' },
  { id: 'cell-07', sql: 'SELECT * FROM employees LIMIT 10' },
  { id: 'cell-08', sql: 'SELECT * FROM employees LIMIT 75' },
  { id: 'cell-09', sql: 'SELECT * FROM employees ORDER BY 1 ASC LIMIT 30' },
  { id: 'cell-10', sql: 'SELECT COUNT(*) FROM employees' },
  { id: 'cell-11', sql: 'SELECT * FROM employees LIMIT 150' },
  { id: 'cell-12', sql: 'SELECT * FROM employees LIMIT 20' },
]

export const options = {
  scenarios: {
    // One iteration per VU, all VUs start simultaneously.
    // vus must equal CELLS.length so each VU maps to exactly one cell.
    run_all: {
      executor: 'per-vu-iterations',
      vus: CELLS.length,
      iterations: 1,
      maxDuration: '30s',
    },
  },
  thresholds: {
    'cell_duration_ms':  ['p(95)<5000'],  // all cells should finish within 5s
    'cell_success_rate': ['rate>=0.99'],  // 100% expected - this is one user
  },
}

export default function () {
  // __VU is 1-based, so subtract 1 to index into CELLS
  const cell    = CELLS[(__VU - 1) % CELLS.length]
  const payload = JSON.stringify({
    cellId:    cell.id,
    namespace: NAMESPACE,
    sql:       cell.sql,
  })

  let startTime
  let resolved = false

  const res = ws.connect(WS_URL, {}, (socket) => {
    socket.on('open', () => {
      startTime = Date.now()
      socket.send(payload)
    })

    socket.on('message', (raw) => {
      let msg
      try { msg = JSON.parse(raw) } catch { return }
      if (msg.status === 'running') return

      if (msg.status === 'done') {
        cellDuration.add(Date.now() - startTime)
        cellSuccess.add(1)
        resolved = true
        socket.close()

      } else if (msg.status === 'error') {
        cellErrors.add(1)
        cellSuccess.add(0)
        console.warn('[' + cell.id + '] query error: ' + msg.error)
        resolved = true
        socket.close()
      }
    })

    socket.on('error', (e) => {
      cellErrors.add(1)
      cellSuccess.add(0)
    })

    // 10s timeout per cell - if a query takes longer than this something is wrong
    socket.setTimeout(() => {
      if (!resolved) {
        cellTimeouts.add(1)
        cellSuccess.add(0)
        console.warn('[' + cell.id + '] timed out after 10s')
        socket.close()
      }
    }, 10000)
  })

  check(res, { 'WebSocket connected': (r) => r && r.status === 101 })
}
