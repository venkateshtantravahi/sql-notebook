import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { IoKeySharp } from "react-icons/io5";
import {FaLink} from "react-icons/fa";
import { BsThreeDots } from "react-icons/bs";

// layout constants
const COL_WIDTH  = 230
const ROW_HEIGHT = 24
const HEADER_H   = 32
const H_GAP      = 100
const V_GAP      = 48
const PADDING    = 48

// colour helpers
function typeColor(type) {
    if (!type) return '#9ca3af'
    const t = type.toUpperCase().trim()

    // Integer / serial / rowid
    // Check specific multi-word forms before bare INT
    if (t.startsWith('INTERVAL'))                        return '#a78bfa'  // before INT check
    if (t === 'INTEGER' || t === 'INT')                  return '#60a5fa'
    if (t.startsWith('TINYINT'))                         return '#60a5fa'
    if (t.startsWith('SMALLINT'))                        return '#60a5fa'
    if (t.startsWith('MEDIUMINT'))                       return '#60a5fa'
    if (t.startsWith('BIGINT'))                          return '#60a5fa'
    if (t.startsWith('INT2') || t.startsWith('INT4') ||
        t.startsWith('INT8'))                            return '#60a5fa'
    if (t.startsWith('SERIAL') || t.startsWith('BIGSERIAL') ||
        t.startsWith('SMALLSERIAL'))                     return '#60a5fa'
    if (t.startsWith('ROWID') || t.startsWith('UROWID')) return '#60a5fa'
    // Catch remaining INT* forms (INT, INT UNSIGNED, etc.)
    if (t.startsWith('INT'))                             return '#60a5fa'

    //  Numeric / float / money
    if (t.startsWith('DECIMAL') || t.startsWith('NUMERIC'))  return '#fb923c'
    if (t.startsWith('DOUBLE'))                               return '#fb923c'
    if (t.startsWith('FLOAT'))                                return '#fb923c'
    if (t.startsWith('REAL'))                                 return '#fb923c'
    if (t.startsWith('BINARY_FLOAT') ||
        t.startsWith('BINARY_DOUBLE'))                        return '#fb923c'
    if (t.startsWith('SMALLMONEY') || t.startsWith('MONEY'))  return '#fb923c'
    if (t === 'NUMBER')                                        return '#fb923c'

    // Text / string / char
    // Most specific multi-word first
    if (t.startsWith('CHARACTER VARYING'))  return '#34d399'
    if (t.startsWith('NVARCHAR2'))          return '#34d399'
    if (t.startsWith('VARCHAR2'))           return '#34d399'
    if (t.startsWith('NVARCHAR'))           return '#34d399'
    if (t.startsWith('VARCHAR'))            return '#34d399'
    if (t.startsWith('NCHAR'))              return '#34d399'
    if (t.startsWith('CITEXT'))             return '#34d399'
    if (t.startsWith('CHARACTER'))          return '#34d399'  // after CHARACTER VARYING
    if (t.startsWith('CHAR'))               return '#34d399'  // after all CHAR* variants
    if (t.startsWith('TINYTEXT'))           return '#34d399'
    if (t.startsWith('MEDIUMTEXT'))         return '#34d399'
    if (t.startsWith('LONGTEXT'))           return '#34d399'
    if (t.startsWith('NTEXT'))              return '#34d399'
    if (t.startsWith('TEXT'))               return '#34d399'
    if (t.startsWith('CLOB') || t.startsWith('NCLOB')) return '#34d399'
    if (t === 'LONG')                       return '#34d399'  // Oracle LONG
    if (t === 'STRING')                     return '#34d399'  // SQLite affinity alias

    // Date / time / interval
    // Multi-word and compound forms first
    if (t.startsWith('DATETIMEOFFSET'))     return '#a78bfa'
    if (t.startsWith('SMALLDATETIME'))      return '#a78bfa'
    if (t.startsWith('DATETIME2'))          return '#a78bfa'
    if (t.startsWith('DATETIME'))           return '#a78bfa'
    if (t.startsWith('TIMESTAMPTZ') ||
        t.startsWith('TIMESTAMP WITH'))     return '#a78bfa'
    if (t.startsWith('TIMESTAMP'))          return '#a78bfa'
    if (t.startsWith('TIMETZ') ||
        t.startsWith('TIME WITH'))          return '#a78bfa'
    if (t.startsWith('TIME'))               return '#a78bfa'
    if (t.startsWith('DATE'))               return '#a78bfa'
    if (t.startsWith('INTERVAL'))           return '#a78bfa'
    if (t === 'YEAR')                       return '#a78bfa'  // MySQL YEAR

    // Boolean / bit
    if (t.startsWith('BOOLEAN') || t === 'BOOL') return '#fbbf24'
    if (t.startsWith('BIT'))                     return '#fbbf24'  // BIT, BIT(1), BIT VARYING

    // Binary / blob / raw
    if (t.startsWith('TINYBLOB'))    return '#f87171'
    if (t.startsWith('MEDIUMBLOB'))  return '#f87171'
    if (t.startsWith('LONGBLOB'))    return '#f87171'
    if (t.startsWith('BLOB'))        return '#f87171'
    if (t.startsWith('VARBINARY'))   return '#f87171'
    if (t.startsWith('BINARY'))      return '#f87171'
    if (t.startsWith('BYTEA'))       return '#f87171'
    if (t === 'IMAGE')               return '#f87171'  // MSSQL legacy
    if (t.startsWith('RAW'))         return '#f87171'  // Oracle RAW / LONG RAW
    if (t.startsWith('BFILE'))       return '#f87171'  // Oracle BFILE

    // JSON / XML / UUID / network / geo / spatial
    if (t.startsWith('JSONB') || t.startsWith('JSON')) return '#22d3ee'
    if (t.startsWith('XMLTYPE') || t.startsWith('XML')) return '#22d3ee'
    if (t.startsWith('UUID') || t.startsWith('UNIQUEIDENTIFIER')) return '#22d3ee'
    if (t.startsWith('INET') || t.startsWith('CIDR') ||
        t.startsWith('MACADDR'))                        return '#22d3ee'
    if (t.startsWith('POINT') || t.startsWith('LINE')  ||
        t.startsWith('LSEG')  || t.startsWith('BOX')   ||
        t.startsWith('PATH')  || t.startsWith('POLYGON') ||
        t.startsWith('CIRCLE'))                         return '#22d3ee'
    if (t.startsWith('GEOGRAPHY') || t.startsWith('GEOMETRY') ||
        t.startsWith('HIERARCHYID'))                    return '#22d3ee'
    if (t.startsWith('OID'))                            return '#22d3ee'
    if (t === 'ROWVERSION')                             return '#22d3ee'  // MSSQL

    // Enum / set / array / special
    if (t.startsWith('ENUM') || t.startsWith('SET'))    return '#f472b6'
    if (t.startsWith('ARRAY'))                          return '#f472b6'
    if (t.startsWith('TSVECTOR') || t.startsWith('TSQUERY')) return '#f472b6'
    if (t.startsWith('HSTORE'))                         return '#f472b6'
    if (t.includes('USER-DEFINED') || t.includes('USER DEFINED')) return '#f472b6'
    if (t === 'SQL_VARIANT')                            return '#f472b6'  // MSSQL
    if (t === 'NUMERIC')                                return '#fb923c'  // SQLite affinity

    // Fallback
    return '#9ca3af'
}

function tableHeight(t) { return HEADER_H + t.columns.length * ROW_HEIGHT }

// layout engine
/**
 * 1. Assign horizontal levels via FK propagation.
 * 2. Tables with any FK relationship go in their computed level column.
 * 3. Orphan tables (no FK in or out) go in a grid BELOW the connected section
 *    so they're never floating in the middle of the canvas.
 * 4. Positions are fully deterministic — sorted by name within each level.
 */
function computeLayout(tables) {
    if (!tables || tables.length === 0) return { nodes: [], edges: [], canvasW: 0, canvasH: 0 }

    const byName = {}
    tables.forEach(t => { byName[t.name] = t })

    // Level assignment via FK propagation
    const level = {}
    tables.forEach(t => { level[t.name] = 0 })

    for (let pass = 0; pass < tables.length; pass++) {
        tables.forEach(t => {
            t.columns.forEach(col => {
                if (col.foreignKey && col.referencedTable && byName[col.referencedTable]) {
                    const refLevel = level[col.referencedTable] ?? 0
                    if ((level[t.name] ?? 0) <= refLevel) level[t.name] = refLevel + 1
                }
            })
        })
    }

    // Classify which tables have any FK relationship (in or out)
    const hasFK = {}
    tables.forEach(t => { hasFK[t.name] = false })
    tables.forEach(t => {
        t.columns.forEach(col => {
            if (col.foreignKey && col.referencedTable && byName[col.referencedTable]) {
                hasFK[t.name]              = true
                hasFK[col.referencedTable] = true
            }
        })
    })

    const connected = tables.filter(t =>  hasFK[t.name]).sort((a, b) => a.name.localeCompare(b.name))
    const orphans   = tables.filter(t => !hasFK[t.name]).sort((a, b) => a.name.localeCompare(b.name))

    // Place connected tables in their level columns
    const byLevel = {}
    connected.forEach(t => {
        const l = level[t.name] ?? 0
        if (!byLevel[l]) byLevel[l] = []
        byLevel[l].push(t)
    })

    const nodes = []
    const levelKeys = Object.keys(byLevel).map(Number).sort((a, b) => a - b)
    let connectedMaxY = 0

    levelKeys.forEach(l => {
        const group = byLevel[l]
        const x = PADDING + l * (COL_WIDTH + H_GAP)
        let y = PADDING
        group.forEach(t => {
            const h = tableHeight(t)
            nodes.push({ table: t, x, y, width: COL_WIDTH, height: h, level: l, orphan: false })
            y += h + V_GAP
            if (y > connectedMaxY) connectedMaxY = y
        })
    })

    // Place orphans in a compact grid below connected tables
    if (orphans.length > 0) {
        const ORPHAN_COLS  = Math.max(1, Math.ceil(Math.sqrt(orphans.length)))
        const orphanStartY = connectedMaxY > 0 ? connectedMaxY + V_GAP * 2 : PADDING

        orphans.forEach((t, i) => {
            const col = i % ORPHAN_COLS
            const row = Math.floor(i / ORPHAN_COLS)
            nodes.push({
                table: t,
                x: PADDING + col * (COL_WIDTH + H_GAP),
                y: orphanStartY + row * (tableHeight(t) + V_GAP),
                width: COL_WIDTH, height: tableHeight(t),
                level: -1, orphan: true,
            })
        })
    }

    // Build edges
    const edges = []
    nodes.forEach(srcNode => {
        srcNode.table.columns.forEach((col, colIdx) => {
            if (!col.foreignKey || !col.referencedTable) return
            const dstNode = nodes.find(n => n.table.name === col.referencedTable)
            if (!dstNode) return

            const dstColIdx = dstNode.table.columns.findIndex(c => c.name === col.referencedColumn)
            const dstRowIdx = dstColIdx >= 0 ? dstColIdx : 0

            const srcRowMidY = srcNode.y + HEADER_H + colIdx   * ROW_HEIGHT + ROW_HEIGHT / 2
            const dstRowMidY = dstNode.y + HEADER_H + dstRowIdx * ROW_HEIGHT + ROW_HEIGHT / 2

            const sameColumn = Math.abs(srcNode.x - dstNode.x) < 10
            const backRef    = !sameColumn && srcNode.x > dstNode.x

            let srcX, srcY, dstX, dstY
            if (sameColumn) {
                // Both ports exit the right side, loop around
                srcX = srcNode.x + srcNode.width; srcY = srcRowMidY
                dstX = dstNode.x + dstNode.width; dstY = dstRowMidY
            } else if (backRef) {
                // Reverse direction: exit left, arrive right
                srcX = srcNode.x;                 srcY = srcRowMidY
                dstX = dstNode.x + dstNode.width; dstY = dstRowMidY
            } else {
                // Normal: exit right, arrive left
                srcX = srcNode.x + srcNode.width; srcY = srcRowMidY
                dstX = dstNode.x;                 dstY = dstRowMidY
            }

            edges.push({
                id: `${srcNode.table.name}.${col.name}->${col.referencedTable}.${col.referencedColumn}`,
                srcX, srcY, dstX, dstY,
                srcTable: srcNode.table.name,
                dstTable: col.referencedTable,
                sameColumn, backRef,
            })
        })
    })

    const maxX = nodes.length ? Math.max(...nodes.map(n => n.x + n.width))  + PADDING : PADDING * 2
    const maxY = nodes.length ? Math.max(...nodes.map(n => n.y + n.height)) + PADDING : PADDING * 2

    return { nodes, edges, canvasW: maxX, canvasH: maxY }
}

//  edge path
function buildPath({ srcX, srcY, dstX, dstY, sameColumn, backRef }) {
    if (sameColumn) {
        const loopX = Math.max(srcX, dstX) + 64
        return `M ${srcX} ${srcY} C ${loopX} ${srcY}, ${loopX} ${dstY}, ${dstX} ${dstY}`
    }
    const spread = Math.abs(dstX - srcX) * 0.45
    const cp1x = srcX + (backRef ? -spread :  spread)
    const cp2x = dstX - (backRef ? -spread :  spread)
    return `M ${srcX} ${srcY} C ${cp1x} ${srcY}, ${cp2x} ${dstY}, ${dstX} ${dstY}`
}

//  TableBox
function TableBox({ node, highlighted, onClick, onColumnEnter, onColumnLeave, isDark }) {
    const { table, x, y, width, height } = node
    const isHL = highlighted === table.name

    const headerBg    = isDark ? (isHL ? '#1e40af' : '#1e3a5f') : (isHL ? '#2563eb' : '#f97316')
    const borderColor = isDark ? (isHL ? '#60a5fa' : '#2d4a6e') : (isHL ? '#1d4ed8' : '#ea580c')
    const bodyBg      = isDark ? '#0f1e2e' : '#fff'
    const textColor   = isDark ? '#f1f5f9' : '#1e293b'
    const sepColor    = isDark ? '#1e3a5f' : '#f3f4f6'

    return (
        <g transform={`translate(${x},${y})`} onClick={() => onClick(table.name)}
           style={{ cursor: 'pointer', opacity: node.orphan ? 0.75 : 1 }}>
            {/* Shadow */}
            <rect x={3} y={3} width={width} height={height} rx={6}
                  fill={isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.07)'} />
            {/* Body */}
            <rect width={width} height={height} rx={6}
                  fill={bodyBg} stroke={borderColor} strokeWidth={isHL ? 2 : 1} />
            {/* Header */}
            <rect width={width} height={HEADER_H} rx={6} fill={headerBg} />
            <rect y={HEADER_H - 6} width={width} height={6} fill={headerBg} />
            {/* Title */}
            <text x={10} y={HEADER_H / 2 + 5} fontSize={12} fontWeight="bold"
                  fontFamily="JetBrains Mono, Fira Code, monospace" fill="#fff">
                {table.name.length > 22 ? table.name.slice(0, 20) + '…' : table.name}
            </text>
            <text x={width - 8} y={HEADER_H / 2 + 5} fontSize={10}
                  fontFamily="monospace" fill="rgba(255,255,255,0.5)" textAnchor="end">
                {table.columns.length}
            </text>

            {/* Columns */}
            {table.columns.map((col, i) => {
                const rowY       = HEADER_H + i * ROW_HEIGHT
                const icon       = col.primaryKey ? '🔑' : col.foreignKey ? '🔗' : null
                const dispName   = col.name.length > 20  ? col.name.slice(0, 19) + <BsThreeDots /> : col.name
                const dispType   = (col.type ?? '').length > 12 ? col.type.slice(0, 11) + <BsThreeDots /> : (col.type ?? '')
                const fullLabel  = [
                    col.name, col.type ?? '',
                    col.primaryKey ? 'PK' : '',
                    col.foreignKey ? `FK → ${col.referencedTable}.${col.referencedColumn}` : '',
                ].filter(Boolean).join('  ')

                return (
                    <g key={col.name}
                       onMouseEnter={e => onColumnEnter(e, fullLabel)}
                       onMouseLeave={onColumnLeave}>
                        <rect y={rowY} width={width} height={ROW_HEIGHT} fill="transparent" />
                        {i > 0 && <line x1={0} y1={rowY} x2={width} y2={rowY} stroke={sepColor} strokeWidth={1} />}
                        {icon && <text x={6} y={rowY + ROW_HEIGHT / 2 + 4} fontSize={9}>{icon}</text>}
                        <text x={icon ? 22 : 8} y={rowY + ROW_HEIGHT / 2 + 4}
                              fontSize={10} fontFamily="JetBrains Mono, Fira Code, monospace" fill={textColor}>
                            {dispName}
                        </text>
                        <text x={width - 6} y={rowY + ROW_HEIGHT / 2 + 4}
                              fontSize={9} fontFamily="monospace" fill={typeColor(col.type)} textAnchor="end">
                            {dispType}
                        </text>
                    </g>
                )
            })}
        </g>
    )
}

//  Edge
function Edge({ edge, highlighted, isDark }) {
    const isHL  = highlighted === edge.srcTable || highlighted === edge.dstTable
    const d     = buildPath(edge)
    const color = isHL ? (isDark ? '#60a5fa' : '#2563eb') : (isDark ? '#4a6080' : '#d1d5db')

    return (
        <g>
            <path d={d} fill="none" stroke="transparent" strokeWidth={8} />
            <path d={d} fill="none" stroke={color}
                  strokeWidth={isHL ? 2 : 1}
                  strokeDasharray={isHL ? undefined : '4 3'}
                  opacity={isHL ? 1 : 0.55} />
            <circle cx={edge.dstX} cy={edge.dstY} r={3}
                    fill={color} opacity={isHL ? 1 : 0.45} />
        </g>
    )
}

// MiniMap
function MiniMap({ nodes, canvasW, canvasH, pan, zoom, viewW, viewH, isDark }) {
    const W = 120, H = 80
    const s = Math.min(W / Math.max(canvasW, 1), H / Math.max(canvasH, 1))
    return (
        <svg width={W} height={H} style={{
            position: 'absolute', bottom: 8, right: 8,
            background: isDark ? 'rgba(15,23,42,0.85)' : 'rgba(255,255,255,0.85)',
            border: `1px solid ${isDark ? '#334155' : '#e5e7eb'}`,
            borderRadius: 6, backdropFilter: 'blur(4px)',
        }}>
            {nodes.map(n => (
                <rect key={n.table.name} x={n.x * s} y={n.y * s}
                      width={n.width * s} height={n.height * s}
                      fill={n.orphan ? (isDark ? '#0f172a' : '#e5e7eb') : (isDark ? '#1e293b' : '#f97316')}
                      rx={1} opacity={0.8} />
            ))}
            <rect
                x={Math.max(0, -pan.x / zoom * s)} y={Math.max(0, -pan.y / zoom * s)}
                width={Math.min(W, viewW / zoom * s)} height={Math.min(H, viewH / zoom * s)}
                fill="none" stroke={isDark ? '#3b82f6' : '#2563eb'} strokeWidth={1.5} rx={2} />
        </svg>
    )
}

// Tooltip
function ColumnTooltip({ tooltip }) {
    if (!tooltip.visible) return null
    return (
        <div style={{
            position: 'absolute', left: tooltip.x + 14, top: tooltip.y - 10,
            background: '#1e293b', color: '#e2e8f0',
            fontSize: 11, fontFamily: 'JetBrains Mono, Fira Code, monospace',
            padding: '3px 8px', borderRadius: 4,
            pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 100,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}>
            {tooltip.text}
        </div>
    )
}

//Main component
function SchemaErd({ tables, isDark }) {
    const containerRef  = useRef(null)
    const dragging      = useRef(false)
    const lastPos       = useRef({ x: 0, y: 0 })

    const [pan,         setPan]         = useState({ x: PADDING, y: PADDING })
    const [zoom,        setZoom]        = useState(1)
    const [highlighted, setHighlighted] = useState(null)
    const [viewSize,    setViewSize]    = useState({ w: 600, h: 400 })
    const [tooltip,     setTooltip]     = useState({ visible: false, x: 0, y: 0, text: '' })
    const [fitted,      setFitted]      = useState(false)

    // Stable memoisation — only recompute layout when table names change
    const tableKey = useMemo(() => tables?.map(t => t.name).sort().join(',') ?? '', [tables])
    const { nodes, edges, canvasW, canvasH } = useMemo(() => computeLayout(tables), [tableKey]) // eslint-disable-line

    // Observe container size
    useEffect(() => {
        if (!containerRef.current) return
        const ro = new ResizeObserver(([e]) => {
            setViewSize({ w: e.contentRect.width, h: e.contentRect.height })
        })
        ro.observe(containerRef.current)
        return () => ro.disconnect()
    }, [])

    // Fit once when both layout & container are ready
    useEffect(() => {
        if (fitted || !canvasW || !canvasH || viewSize.w < 10) return
        const zf = Math.min(viewSize.w / canvasW, viewSize.h / canvasH, 1) * 0.9
        setZoom(zf)
        setPan({ x: (viewSize.w - canvasW * zf) / 2, y: (viewSize.h - canvasH * zf) / 2 })
        setFitted(true)
    }, [canvasW, canvasH, viewSize.w, viewSize.h, fitted])

    // Reset fit when tables change
    useEffect(() => { setFitted(false) }, [tableKey])

    // Pan
    const onMouseDown = useCallback(e => {
        if (e.button !== 0) return
        dragging.current = true
        lastPos.current  = { x: e.clientX, y: e.clientY }
        e.preventDefault()
    }, [])

    useEffect(() => {
        const onMove = e => {
            if (!dragging.current) return
            setPan(p => ({ x: p.x + e.clientX - lastPos.current.x, y: p.y + e.clientY - lastPos.current.y }))
            lastPos.current = { x: e.clientX, y: e.clientY }
        }
        const onUp = () => { dragging.current = false }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup',   onUp)
        return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    }, [])

    // Zoom
    const onWheel = useCallback(e => {
        e.preventDefault()
        setZoom(z => Math.min(2.5, Math.max(0.15, z * (e.deltaY > 0 ? 0.9 : 1.1))))
    }, [])

    useEffect(() => {
        const el = containerRef.current; if (!el) return
        el.addEventListener('wheel', onWheel, { passive: false })
        return () => el.removeEventListener('wheel', onWheel)
    }, [onWheel])

    // Column tooltip
    const onColEnter = useCallback((e, text) => {
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return
        setTooltip({ visible: true, x: e.clientX - rect.left, y: e.clientY - rect.top, text })
    }, [])
    const onColLeave = useCallback(() => setTooltip(t => ({ ...t, visible: false })), [])

    function fitView() {
        const zf = Math.min(viewSize.w / canvasW, viewSize.h / canvasH, 1) * 0.9
        setZoom(zf)
        setPan({ x: (viewSize.w - canvasW * zf) / 2, y: (viewSize.h - canvasH * zf) / 2 })
    }

    if (!nodes.length) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-xs text-gray-400 dark:text-white italic">No tables to display</p>
            </div>
        )
    }

    const orphanCount    = nodes.filter(n =>  n.orphan).length
    const connectedCount = nodes.filter(n => !n.orphan).length
    const firstOrphan    = nodes.find(n => n.orphan)

    return (
        <div ref={containerRef} onMouseDown={onMouseDown} style={{
            width: '100%', height: '100%', overflow: 'hidden', position: 'relative',
            cursor: 'grab', background: isDark ? '#020617' : '#f8fafc', userSelect: 'none',
        }}>
            <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
                <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

                    {/* Section label for orphans */}
                    {orphanCount > 0 && connectedCount > 0 && firstOrphan && (
                        <text x={PADDING} y={firstOrphan.y - 14}
                              fontSize={11} fontFamily="monospace"
                              fill={isDark ? '#334155' : '#9ca3af'}>
                            ── Disconnected tables ({orphanCount}) ──
                        </text>
                    )}

                    {/* Edges */}
                    {edges.map(edge => (
                        <Edge key={edge.id} edge={edge} highlighted={highlighted} isDark={isDark} />
                    ))}

                    {/* Tables */}
                    {nodes.map(node => (
                        <TableBox key={node.table.name} node={node} highlighted={highlighted}
                                  onClick={name => setHighlighted(h => h === name ? null : name)}
                                  onColumnEnter={onColEnter} onColumnLeave={onColLeave}
                                  isDark={isDark} />
                    ))}
                </g>
            </svg>

            {/* Zoom controls */}
            <div style={{ position: 'absolute', bottom: 8, left: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {[
                    { label: '+', fn: () => setZoom(z => Math.min(2.5, z * 1.2)) },
                    { label: '⊡', fn: fitView },
                    { label: '−', fn: () => setZoom(z => Math.max(0.15, z * 0.8)) },
                ].map(({ label, fn }) => (
                    <button key={label} onClick={fn} style={{
                        width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontWeight: 'bold', cursor: 'pointer',
                        background: isDark ? '#1e293b' : '#fff',
                        border: `1px solid ${isDark ? '#334155' : '#e5e7eb'}`,
                        borderRadius: 4, color: isDark ? '#94a3b8' : '#374151',
                    }}>{label}</button>
                ))}
            </div>

            <MiniMap nodes={nodes} canvasW={canvasW} canvasH={canvasH}
                     pan={pan} zoom={zoom} viewW={viewSize.w} viewH={viewSize.h} isDark={isDark} />

            <ColumnTooltip tooltip={tooltip} />

            <div style={{
                position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)',
                fontSize: 10, opacity: 0.35, pointerEvents: 'none', whiteSpace: 'nowrap',
                color: isDark ? '#94a3b8' : '#6b7280',
            }}>
                {nodes.length} tables · {edges.length} relationships
                {orphanCount > 0 ? ` · ${orphanCount} disconnected` : ''}
                {'  ·  Scroll to zoom · Drag to pan · Click to highlight'}
            </div>
        </div>
    )
}

export default SchemaErd