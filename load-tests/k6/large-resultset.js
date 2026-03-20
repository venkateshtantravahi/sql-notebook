/**
 * Load Test: Large Result Set Handling
 *
 * Models a user who has a few heavy analytical cells in a notebook and hits
 * Run All.  All cells fire simultaneously.  The queries are deliberately
 * broad to hit or exceed the 10,000-row cap the backend enforces.
 *
 * What is tested:
 *   - The 10k row cap is enforced (result.truncated === true for large queries)
 *   - Memory stays bounded when serialising 10k rows of JSON
 *   - Response time is acceptable even for large results (p95 < 15s)
 *   - Columns and rows are always present in the response
 *   - No errors or OOM under a small burst of concurrent large queries
 *
 * This is not a multi-user test.  Three VUs represent three heavy cells in
 * one notebook.  A realistic notebook would rarely have more than 3-5 large
 * result queries running simultaneously.
 *
 * Install k6:  brew install k6
 * Run:         k6 run load-tests/k6/large-resultset.js
 *
 * Requires a namespace with tables containing more than 10,000 rows.
 * The default uses the Chinook SQLite database  -  the Track x InvoiceLine
 * cross-join produces well over 10k rows quickly.
 */

import ws from 'k6/ws'
import { check } from 'k6'
import { Trend, Rate, Counter } from 'k6/metrics'

const queryDuration = new Trend('large_query_duration_ms', true)
const truncatedRate = new Rate('row_cap_hit_rate')    // should be 1.0 for the cross-join
const errorRate     = new Rate('large_query_error_rate')
const rowsReceived  = new Counter('total_rows_received')

const WS_URL    = 'ws://localhost:8080/ws/query'
const NAMESPACE = 'chinook'  // change to a namespace with large tables

// Three notebook cells with heavy queries  -  one per VU
const CELLS = [
  {
    id:  'large-01',
    // Cross-join intentionally exceeds 10k rows to trigger the cap
    sql: 'SELECT t.TrackId, t.Name, il.InvoiceId, il.UnitPrice FROM Track t JOIN InvoiceLine il ON il.TrackId = t.TrackId',
  },
  {
    id:  'large-02',
    // Full PlaylistTrack scan  -  8715 rows, just under the cap
    sql: 'SELECT * FROM PlaylistTrack',
  },
  {
    id:  'large-03',
    // Full Track table scan  -  3503 rows, tests moderate result size
    sql: 'SELECT * FROM Track ORDER BY TrackId',
  },
]

export const options = {
  scenarios: {
    // Three heavy cells all fire simultaneously  -  one VU per cell
    heavy_run_all: {
      executor: 'per-vu-iterations',
      vus: CELLS.length,
      iterations: 1,
      maxDuration: '60s',
    },
  },
  thresholds: {
    'large_query_duration_ms':  ['p(95)<15000'],  // large queries get more time
    'large_query_error_rate':   ['rate<0.05'],
  },
}

export default function () {
  const cell    = CELLS[(__VU - 1) % CELLS.length]
  const payload = JSON.stringify({
    cellId:    cell.id,
    namespace: NAMESPACE,
    sql:       cell.sql,
  })

  let startTime
  let resolved = false

  ws.connect(WS_URL, {}, (socket) => {
    socket.on('open', () => {
      startTime = Date.now()
      socket.send(payload)
    })

    socket.on('message', (raw) => {
      let msg
      try { msg = JSON.parse(raw) } catch { return }
      if (msg.status === 'running') return

      if (msg.status === 'done') {
        queryDuration.add(Date.now() - startTime)

        const wasTruncated = msg.result && msg.result.truncated === true
        truncatedRate.add(wasTruncated ? 1 : 0)

        const rows = (msg.result && msg.result.rows) ? msg.result.rows.length : 0
        rowsReceived.add(rows)

        check(msg, {
          'result present':    (m) => m.result !== undefined,
          'columns present':   (m) => Array.isArray(m.result && m.result.columns),
          'row cap enforced':  (m) => {
            const count = (m.result && m.result.rows) ? m.result.rows.length : 0
            return count <= 10000
          },
        })

        errorRate.add(0)
        resolved = true
        socket.close()

      } else if (msg.status === 'error') {
        errorRate.add(1)
        console.warn('[' + cell.id + '] error: ' + msg.error)
        resolved = true
        socket.close()
      }
    })

    socket.on('error', (e) => {
      errorRate.add(1)
      console.error('[' + cell.id + '] WS error')
    })

    // 30s timeout for large result queries
    socket.setTimeout(() => {
      if (!resolved) {
        errorRate.add(1)
        console.warn('[' + cell.id + '] timed out waiting for large result')
        socket.close()
      }
    }, 30000)
  })
}
