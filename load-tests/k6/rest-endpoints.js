/**
 * Load Test: REST Responsiveness During Active Query
 *
 * The sidebar polls /namespaces every 30s and /workspace every 5s.
 * The schema explorer fires /schema/:ns on demand.  All of this happens
 * while the user may also have an active query running over WebSocket.
 *
 * This test runs two scenarios in parallel:
 *
 *   active_query  -  one VU fires a WebSocket query every 3-5s, simulating
 *                    a user running cells one by one through a notebook.
 *
 *   background_rest  -  one VU polls /health, /namespaces, and /schema at
 *                       realistic rates, simulating sidebar + schema explorer
 *                       activity running alongside the query engine.
 *
 * What is measured:
 *   - /health latency must stay under 200ms p95 (it should always be instant)
 *   - /namespaces latency must stay under 500ms p95
 *   - /schema latency must stay under 1s p95
 *   - Error rate across REST calls must be near zero
 *
 * Install k6:  brew install k6
 * Run:         k6 run load-tests/k6/rest-endpoints.js
 */

import ws   from 'k6/ws'
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Trend, Rate } from 'k6/metrics'

const healthLatency     = new Trend('health_latency_ms', true)
const namespacesLatency = new Trend('namespaces_latency_ms', true)
const schemaLatency     = new Trend('schema_latency_ms', true)
const restErrorRate     = new Rate('rest_error_rate')
const querySuccess      = new Rate('query_success_rate')

const BASE   = 'http://localhost:8080'
const WS_URL = 'ws://localhost:8080/ws/query'

// setup() runs once before the test starts.
// It picks the first available namespace from /namespaces so the test works
// regardless of what connections the user has registered.
// The returned object is passed as the first argument to runQuery and pollRest.
export function setup() {
  const r = http.get(BASE + '/namespaces')
  if (!r || r.status !== 200) {
    console.error('Could not reach /namespaces  -  is the server running?')
    return { namespace: 'employees' }
  }
  const list = JSON.parse(r.body)
  if (!Array.isArray(list) || list.length === 0) {
    console.error('No namespaces registered  -  add a connection first')
    return { namespace: 'employees' }
  }
  const ns = list[0].name
  console.log('Using namespace: ' + ns)
  return { namespace: ns }
}

export const options = {
  scenarios: {
    // One VU runs notebook cells one at a time (3-5s apart)
    active_query: {
      executor: 'constant-vus',
      vus: 1,
      duration: '40s',
      exec: 'runQuery',
    },
    // One VU polls REST endpoints at realistic sidebar/schema rates
    background_rest: {
      executor: 'constant-vus',
      vus: 1,
      duration: '40s',
      exec: 'pollRest',
    },
  },
  thresholds: {
    'health_latency_ms':     ['p(95)<200'],
    'namespaces_latency_ms': ['p(95)<500'],
    'schema_latency_ms':     ['p(95)<1000'],
    'rest_error_rate':       ['rate<0.01'],
    'query_success_rate':    ['rate>=0.95'],
  },
}

// Simulates user running cells one by one  -  one query every 3-5s
export function runQuery (data) {
  const ns      = data.namespace
  const cellId  = 'cell-' + Date.now()
  const queries = [
    'SELECT * FROM ' + ns + ' LIMIT 100',
    'SELECT COUNT(*) FROM ' + ns,
    'SELECT * FROM ' + ns + ' ORDER BY 1 DESC LIMIT 50',
    'SELECT * FROM ' + ns + ' LIMIT 200',
  ]
  const sql     = queries[Math.floor(Math.random() * queries.length)]
  const payload = JSON.stringify({ cellId, namespace: ns, sql })

  let resolved = false

  const res = ws.connect(WS_URL, {}, (socket) => {
    socket.on('open', () => socket.send(payload))

    socket.on('message', (raw) => {
      let msg
      try { msg = JSON.parse(raw) } catch { return }
      if (msg.status === 'running') return

      if (msg.status === 'done') {
        querySuccess.add(1)
        resolved = true
        socket.close()
      } else if (msg.status === 'error') {
        querySuccess.add(0)
        console.warn('[query] error: ' + msg.error)
        resolved = true
        socket.close()
      }
    })

    socket.on('error', () => { querySuccess.add(0) })

    socket.setTimeout(() => {
      if (!resolved) {
        querySuccess.add(0)
        socket.close()
      }
    }, 10000)
  })

  check(res, { 'ws connected': (r) => r && r.status === 101 })

  // Pause between cells  -  realistic user think time
  sleep(3 + Math.random() * 2)
}

// Simulates sidebar + schema explorer background polling
export function pollRest (data) {
  const ns     = data.namespace
  const choice = Math.random()

  if (choice < 0.40) {
    // /health  -  browser dev tools shows this fires often
    const r = http.get(BASE + '/health')
    healthLatency.add(r.timings.duration)
    const ok = check(r, { '/health 200': (res) => res.status === 200 })
    restErrorRate.add(ok ? 0 : 1)

  } else if (choice < 0.70) {
    // /namespaces  -  sidebar polls every 30s; we compress to test under load
    const r = http.get(BASE + '/namespaces', { timeout: '5000ms' })
    namespacesLatency.add(r.timings.duration)
    const ok = check(r, { '/namespaces 200': (res) => res.status === 200 })
    restErrorRate.add(ok ? 0 : 1)

  } else {
    // /schema/:ns  -  schema explorer fires on demand when user browses tables
    const r = http.get(BASE + '/schema/' + ns, { timeout: '5000ms' })
    schemaLatency.add(r.timings.duration)
    const ok = check(r, { '/schema 200': (res) => res.status === 200 })
    restErrorRate.add(ok ? 0 : 1)
  }

  // Realistic polling pause  -  sidebar polls are spread seconds apart
  sleep(1 + Math.random() * 2)
}
