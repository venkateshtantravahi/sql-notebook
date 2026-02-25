import { useMemo, useRef, useState, useEffect, useCallback } from 'react'

//  layout constants
const COL_WIDTH    = 220   // table box width
const ROW_HEIGHT   = 24    // height per column row in table box
const HEADER_H     = 32    // table header height
const H_GAP        = 80    // horizontal gap between levels
const V_GAP        = 40    // vertical gap between tables in same level
const PADDING      = 40    // canvas padding

// colour helpers
function typeColor(type) {
    if (!type) return '#9ca3af'
    const t = type.toUpperCase()
    if (t.includes('INT'))                        return '#60a5fa' // blue
    if (t.includes('VARCHAR') || t.includes('TEXT') || t.includes('NVAR')) return '#34d399' // green
    if (t.includes('DATE') || t.includes('TIME')) return '#a78bfa' // purple
    if (t.includes('BOOL'))                       return '#fbbf24' // yellow
    if (t.includes('DECIMAL') || t.includes('NUMERIC') ||
        t.includes('FLOAT')   || t.includes('REAL') ||
        t.includes('MONEY')   || t.includes('NUMERIC'))  return '#fb923c' // orange
    return '#9ca3af'
}

// layout engine
/**
 * Assigns each table to a horizontal level based on FK dependencies.
 * Tables with no incoming FKs are level 0, tables that depend only on
 * level-0 tables are level 1, and so on. Within each level tables are
 * stacked vertically in alphabetical order.
 */
function computeLayout(tables) {
    if (!tables || tables.length === 0) return { nodes: [], edges: [] }

    // Build a map of tableName -> table for fast lookup
    const byName = {}
    tables.forEach(t => { byName[t.name] = t })

    // Count incoming FK references per table
    const incomingCount = {}
    tables.forEach(t => { incomingCount[t.name] = 0 })

    tables.forEach(t => {
        t.columns.forEach(col => {
            if (col.foreignKey && col.referencedTable && byName[col.referencedTable]) {
                incomingCount[t.name] = (incomingCount[t.name] || 0) + 0 // just ensure key exists
            }
        })
    })

    // BFS-style level assignment
    const level = {}
    tables.forEach(t => { level[t.name] = 0 })

    // Repeatedly propagate: if table A has FK to table B, A.level >= B.level + 1
    for (let pass = 0; pass < tables.length; pass++) {
        tables.forEach(t => {
            t.columns.forEach(col => {
                if (col.foreignKey && col.referencedTable && byName[col.referencedTable]) {
                    const refLevel = level[col.referencedTable] ?? 0
                    if ((level[t.name] ?? 0) <= refLevel) {
                        level[t.name] = refLevel + 1
                    }
                }
            })
        })
    }

    // Group tables by level
    const byLevel = {}
    tables.forEach(t => {
        const l = level[t.name] ?? 0
        if (!byLevel[l]) byLevel[l] = []
        byLevel[l].push(t)
    })

    // Sort tables within each level alphabetically for stability
    Object.values(byLevel).forEach(arr => arr.sort((a, b) => a.name.localeCompare(b.name)))

    // Compute x/y positions
    const nodes = []
    const levelKeys = Object.keys(byLevel).map(Number).sort((a, b) => a - b)

    levelKeys.forEach(l => {
        const tablesInLevel = byLevel[l]
        const x = PADDING + l * (COL_WIDTH + H_GAP)

        // Total height of all tables in this level
        tablesInLevel.forEach((t, i) => {
            const tableH = HEADER_H + t.columns.length * ROW_HEIGHT
            const y = PADDING + tablesInLevel
                .slice(0, i)
                .reduce((sum, prev) => sum + HEADER_H + prev.columns.length * ROW_HEIGHT + V_GAP, 0)

            nodes.push({ table: t, x, y, width: COL_WIDTH, height: tableH, level: l })
        })
    })

    // Build edges — one per FK column
    const edges = []
    nodes.forEach(srcNode => {
        srcNode.table.columns.forEach((col, colIdx) => {
            if (!col.foreignKey || !col.referencedTable) return
            const dstNode = nodes.find(n => n.table.name === col.referencedTable)
            if (!dstNode) return

            // Find which row the referenced column is on
            const dstColIdx = dstNode.table.columns.findIndex(c => c.name === col.referencedColumn)

            // Source port: right edge of source column row
            const srcY = srcNode.y + HEADER_H + colIdx * ROW_HEIGHT + ROW_HEIGHT / 2
            const srcX = srcNode.x + srcNode.width

            // Dest port: left edge of referenced column row (or header if not found)
            const dstRowIdx = dstColIdx >= 0 ? dstColIdx : 0
            const dstY = dstNode.y + HEADER_H + dstRowIdx * ROW_HEIGHT + ROW_HEIGHT / 2
            const dstX = dstNode.x

            edges.push({
                id:      `${srcNode.table.name}.${col.name}->${col.referencedTable}.${col.referencedColumn}`,
                srcX, srcY, dstX, dstY,
                srcTable: srcNode.table.name,
                dstTable: col.referencedTable,
            })
        })
    })

    // Total canvas size
    const maxX = Math.max(...nodes.map(n => n.x + n.width))  + PADDING
    const maxY = Math.max(...nodes.map(n => n.y + n.height)) + PADDING

    return { nodes, edges, canvasW: maxX, canvasH: maxY }
}

//  table box
function TableBox({ node, highlighted, onClick, isDark }) {
    const { table, x, y, width, height } = node
    const isHighlighted = highlighted === table.name

    const headerBg  = isDark
        ? (isHighlighted ? '#1e40af' : '#1e293b')
        : (isHighlighted ? '#2563eb' : '#f97316')
    const borderColor = isDark
        ? (isHighlighted ? '#3b82f6' : '#334155')
        : (isHighlighted ? '#1d4ed8' : '#ea580c')
    const bodyBg = isDark ? '#0f172a' : '#fff'
    const textColor = isDark ? '#e2e8f0' : '#1e293b'
    const rowHoverBg = isDark ? '#1e293b' : '#fff7ed'

    return (
        <g
            transform={`translate(${x},${y})`}
            onClick={() => onClick(table.name)}
            style={{ cursor: 'pointer' }}
        >
            {/* Shadow */}
            <rect
                x={3} y={3}
                width={width} height={height}
                rx={6}
                fill={isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.08)'}
            />
            {/* Body */}
            <rect
                width={width} height={height}
                rx={6}
                fill={bodyBg}
                stroke={borderColor}
                strokeWidth={isHighlighted ? 2 : 1}
            />
            {/* Header */}
            <rect
                width={width} height={HEADER_H}
                rx={6}
                fill={headerBg}
            />
            <rect
                y={HEADER_H - 6} width={width} height={6}
                fill={headerBg}
            />
            {/* Table name */}
            <text
                x={10} y={HEADER_H / 2 + 5}
                fontSize={12}
                fontWeight="bold"
                fontFamily="JetBrains Mono, Fira Code, monospace"
                fill="#fff"
            >
                {table.name}
            </text>
            {/* Column count badge */}
            <text
                x={width - 8} y={HEADER_H / 2 + 5}
                fontSize={10}
                fontFamily="monospace"
                fill="rgba(255,255,255,0.6)"
                textAnchor="end"
            >
                {table.columns.length}
            </text>

            {/* Column rows */}
            {table.columns.map((col, i) => {
                const rowY = HEADER_H + i * ROW_HEIGHT
                const icon = col.primaryKey ? '🔑' : col.foreignKey ? '🔗' : null
                return (
                    <g key={col.name}>
                        <rect
                            y={rowY} width={width} height={ROW_HEIGHT}
                            fill="transparent"
                        />
                        {/* Row separator */}
                        {i > 0 && (
                            <line
                                x1={0} y1={rowY}
                                x2={width} y2={rowY}
                                stroke={isDark ? '#1e293b' : '#f3f4f6'}
                                strokeWidth={1}
                            />
                        )}
                        {/* Icon */}
                        {icon && (
                            <text x={6} y={rowY + ROW_HEIGHT / 2 + 4} fontSize={9}>
                                {icon}
                            </text>
                        )}
                        {/* Column name */}
                        <text
                            x={icon ? 22 : 8}
                            y={rowY + ROW_HEIGHT / 2 + 4}
                            fontSize={10}
                            fontFamily="JetBrains Mono, Fira Code, monospace"
                            fill={textColor}
                        >
                            {col.name.length > 18 ? col.name.slice(0, 16) + '…' : col.name}
                        </text>
                        {/* Type badge */}
                        <text
                            x={width - 6}
                            y={rowY + ROW_HEIGHT / 2 + 4}
                            fontSize={9}
                            fontFamily="monospace"
                            fill={typeColor(col.type)}
                            textAnchor="end"
                        >
                            {col.type.length > 12 ? col.type.slice(0, 10) + '…' : col.type}
                        </text>
                    </g>
                )
            })}
        </g>
    )
}

//  bezier edge
function Edge({ edge, highlighted, isDark }) {
    const isHighlighted =
        highlighted === edge.srcTable || highlighted === edge.dstTable

    const { srcX, srcY, dstX, dstY } = edge
    const cp1x = srcX + Math.abs(dstX - srcX) * 0.5
    const cp2x = dstX - Math.abs(dstX - srcX) * 0.5
    const d     = `M ${srcX} ${srcY} C ${cp1x} ${srcY}, ${cp2x} ${dstY}, ${dstX} ${dstY}`

    const color = isHighlighted
        ? (isDark ? '#3b82f6' : '#2563eb')
        : (isDark ? '#334155' : '#d1d5db')

    return (
        <g>
            {/* Wider invisible hit area */}
            <path d={d} fill="none" stroke="transparent" strokeWidth={8} />
            <path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={isHighlighted ? 2 : 1}
                strokeDasharray={isHighlighted ? 'none' : '4 3'}
                opacity={isHighlighted ? 1 : 0.6}
            />
            {/* Arrow at destination */}
            <circle
                cx={dstX} cy={dstY} r={3}
                fill={color}
                opacity={isHighlighted ? 1 : 0.5}
            />
        </g>
    )
}

//  mini-map
function MiniMap({ nodes, canvasW, canvasH, pan, zoom, viewW, viewH, isDark }) {
    const mapW = 120
    const mapH = 80
    const scale = Math.min(mapW / canvasW, mapH / canvasH)

    // Viewport indicator
    const vpX  = -pan.x / zoom * scale
    const vpY  = -pan.y / zoom * scale
    const vpW  = viewW  / zoom * scale
    const vpH  = viewH  / zoom * scale

    return (
        <svg
            width={mapW} height={mapH}
            style={{
                position: 'absolute', bottom: 8, right: 8,
                background: isDark ? 'rgba(15,23,42,0.85)' : 'rgba(255,255,255,0.85)',
                border: `1px solid ${isDark ? '#334155' : '#e5e7eb'}`,
                borderRadius: 6,
                backdropFilter: 'blur(4px)',
            }}
        >
            {nodes.map(n => (
                <rect
                    key={n.table.name}
                    x={n.x * scale} y={n.y * scale}
                    width={n.width * scale} height={n.height * scale}
                    fill={isDark ? '#1e293b' : '#f97316'}
                    rx={1}
                    opacity={0.7}
                />
            ))}
            {/* Viewport indicator */}
            <rect
                x={Math.max(0, vpX)} y={Math.max(0, vpY)}
                width={Math.min(mapW, vpW)} height={Math.min(mapH, vpH)}
                fill="none"
                stroke={isDark ? '#3b82f6' : '#2563eb'}
                strokeWidth={1.5}
                rx={2}
            />
        </svg>
    )
}

//  main ERD component
function SchemaErd({ tables, isDark }) {
    const containerRef = useRef(null)
    const [pan,  setPan]  = useState({ x: PADDING, y: PADDING })
    const [zoom, setZoom] = useState(1)
    const [highlighted, setHighlighted] = useState(null)
    const [viewSize, setViewSize] = useState({ w: 600, h: 400 })
    const dragging = useRef(false)
    const lastPos  = useRef({ x: 0, y: 0 })

    const { nodes, edges, canvasW, canvasH } = useMemo(
        () => computeLayout(tables),
        [tables]
    )

    // Track container size for mini-map
    useEffect(() => {
        if (!containerRef.current) return
        const ro = new ResizeObserver(entries => {
            const { width, height } = entries[0].contentRect
            setViewSize({ w: width, h: height })
        })
        ro.observe(containerRef.current)
        return () => ro.disconnect()
    }, [])

    //  pan
    const onMouseDown = useCallback(e => {
        if (e.button !== 0) return
        dragging.current = true
        lastPos.current  = { x: e.clientX, y: e.clientY }
        e.preventDefault()
    }, [])

    useEffect(() => {
        function onMouseMove(e) {
            if (!dragging.current) return
            const dx = e.clientX - lastPos.current.x
            const dy = e.clientY - lastPos.current.y
            lastPos.current = { x: e.clientX, y: e.clientY }
            setPan(p => ({ x: p.x + dx, y: p.y + dy }))
        }
        function onMouseUp() { dragging.current = false }
        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseup',   onMouseUp)
        return () => {
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseup',   onMouseUp)
        }
    }, [])

    // scroll zoom
    const onWheel = useCallback(e => {
        e.preventDefault()
        const factor = e.deltaY > 0 ? 0.9 : 1.1
        setZoom(z => Math.min(2, Math.max(0.2, z * factor)))
    }, [])

    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        el.addEventListener('wheel', onWheel, { passive: false })
        return () => el.removeEventListener('wheel', onWheel)
    }, [onWheel])

    // fit to view on load
    useEffect(() => {
        if (!canvasW || !canvasH || !viewSize.w) return
        const zoomFit = Math.min(
            viewSize.w / canvasW,
            viewSize.h / canvasH,
            1
        ) * 0.9
        setZoom(zoomFit)
        setPan({
            x: (viewSize.w - canvasW * zoomFit) / 2,
            y: (viewSize.h - canvasH * zoomFit) / 2,
        })
    }, [canvasW, canvasH, viewSize.w, viewSize.h])

    function handleTableClick(name) {
        setHighlighted(h => h === name ? null : name)
    }

    if (!nodes.length) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-xs text-gray-400 dark:text-gray-600 italic">
                    No tables to display
                </p>
            </div>
        )
    }

    return (
        <div
            ref={containerRef}
            onMouseDown={onMouseDown}
            style={{
                width: '100%', height: '100%',
                overflow: 'hidden',
                cursor: dragging.current ? 'grabbing' : 'grab',
                position: 'relative',
                background: isDark ? '#020617' : '#f8fafc',
            }}
        >
            <svg
                width="100%" height="100%"
                style={{ position: 'absolute', inset: 0 }}
            >
                <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
                    {/* Edges behind table boxes */}
                    <g>
                        {edges.map(edge => (
                            <Edge
                                key={edge.id}
                                edge={edge}
                                highlighted={highlighted}
                                isDark={isDark}
                            />
                        ))}
                    </g>
                    {/* Table boxes */}
                    <g>
                        {nodes.map(node => (
                            <TableBox
                                key={node.table.name}
                                node={node}
                                highlighted={highlighted}
                                onClick={handleTableClick}
                                isDark={isDark}
                            />
                        ))}
                    </g>
                </g>
            </svg>

            {/* Zoom controls */}
            <div style={{
                position: 'absolute', bottom: 8, left: 8,
                display: 'flex', flexDirection: 'column', gap: 2,
            }}>
                {[
                    { label: '+', action: () => setZoom(z => Math.min(2,   z * 1.2)) },
                    { label: '⊡', action: () => {
                            const zf = Math.min(viewSize.w / canvasW, viewSize.h / canvasH, 1) * 0.9
                            setZoom(zf)
                            setPan({ x: (viewSize.w - canvasW * zf) / 2, y: (viewSize.h - canvasH * zf) / 2 })
                        }},
                    { label: '−', action: () => setZoom(z => Math.max(0.2, z * 0.8)) },
                ].map(({ label, action }) => (
                    <button
                        key={label}
                        onClick={action}
                        style={{
                            width: 24, height: 24,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 14, fontWeight: 'bold',
                            background: isDark ? '#1e293b' : '#fff',
                            border: `1px solid ${isDark ? '#334155' : '#e5e7eb'}`,
                            borderRadius: 4,
                            color: isDark ? '#94a3b8' : '#374151',
                            cursor: 'pointer',
                        }}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* Mini-map */}
            <MiniMap
                nodes={nodes}
                canvasW={canvasW}
                canvasH={canvasH}
                pan={pan}
                zoom={zoom}
                viewW={viewSize.w}
                viewH={viewSize.h}
                isDark={isDark}
            />

            {/* Hint */}
            <div style={{
                position: 'absolute', top: 6, left: '50%',
                transform: 'translateX(-50%)',
                fontSize: 10, opacity: 0.4,
                color: isDark ? '#94a3b8' : '#6b7280',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
            }}>
                Scroll to zoom · Drag to pan · Click table to highlight
            </div>
        </div>
    )
}

export default SchemaErd