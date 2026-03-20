import { useMemo, useEffect } from 'react'
import { LuKey, LuLink2 } from 'react-icons/lu'
import ReactFlow, {
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    useReactFlow,
    ReactFlowProvider,
    Position,
    Handle,
    MarkerType,
} from 'reactflow'
import 'reactflow/dist/style.css'

// layout constants
const COL_WIDTH = 230
const ROW_HEIGHT = 26
const HEADER_H = 36
const H_GAP = 100
const V_GAP = 50
const PADDING = 60

// colour helpers
function typeColor(type) {
    if (!type) return '#9ca3af'
    const t = type.toUpperCase().trim()

    // Integer / serial / rowid
    // Check specific multi-word forms before bare INT
    if (t.startsWith('INTERVAL')) return '#a78bfa' // before INT check
    if (t === 'INTEGER' || t === 'INT') return '#60a5fa'
    if (t.startsWith('TINYINT')) return '#60a5fa'
    if (t.startsWith('SMALLINT')) return '#60a5fa'
    if (t.startsWith('MEDIUMINT')) return '#60a5fa'
    if (t.startsWith('BIGINT')) return '#60a5fa'
    if (t.startsWith('INT2') || t.startsWith('INT4') || t.startsWith('INT8')) return '#60a5fa'
    if (t.startsWith('SERIAL') || t.startsWith('BIGSERIAL') || t.startsWith('SMALLSERIAL'))
        return '#60a5fa'
    if (t.startsWith('ROWID') || t.startsWith('UROWID')) return '#60a5fa'
    // Catch remaining INT* forms (INT, INT UNSIGNED, etc.)
    if (t.startsWith('INT')) return '#60a5fa'

    //  Numeric / float / money
    if (t.startsWith('DECIMAL') || t.startsWith('NUMERIC')) return '#fb923c'
    if (t.startsWith('DOUBLE')) return '#fb923c'
    if (t.startsWith('FLOAT')) return '#fb923c'
    if (t.startsWith('REAL')) return '#fb923c'
    if (t.startsWith('BINARY_FLOAT') || t.startsWith('BINARY_DOUBLE')) return '#fb923c'
    if (t.startsWith('SMALLMONEY') || t.startsWith('MONEY')) return '#fb923c'
    if (t === 'NUMBER') return '#fb923c'

    // Text / string / char
    // Most specific multi-word first
    if (t.startsWith('CHARACTER VARYING')) return '#34d399'
    if (t.startsWith('NVARCHAR2')) return '#34d399'
    if (t.startsWith('VARCHAR2')) return '#34d399'
    if (t.startsWith('NVARCHAR')) return '#34d399'
    if (t.startsWith('VARCHAR')) return '#34d399'
    if (t.startsWith('NCHAR')) return '#34d399'
    if (t.startsWith('CITEXT')) return '#34d399'
    if (t.startsWith('CHARACTER')) return '#34d399' // after CHARACTER VARYING
    if (t.startsWith('CHAR')) return '#34d399' // after all CHAR* variants
    if (t.startsWith('TINYTEXT')) return '#34d399'
    if (t.startsWith('MEDIUMTEXT')) return '#34d399'
    if (t.startsWith('LONGTEXT')) return '#34d399'
    if (t.startsWith('NTEXT')) return '#34d399'
    if (t.startsWith('TEXT')) return '#34d399'
    if (t.startsWith('CLOB') || t.startsWith('NCLOB')) return '#34d399'
    if (t === 'LONG') return '#34d399' // Oracle LONG
    if (t === 'STRING') return '#34d399' // SQLite affinity alias

    // Date / time / interval
    // Multi-word and compound forms first
    if (t.startsWith('DATETIMEOFFSET')) return '#a78bfa'
    if (t.startsWith('SMALLDATETIME')) return '#a78bfa'
    if (t.startsWith('DATETIME2')) return '#a78bfa'
    if (t.startsWith('DATETIME')) return '#a78bfa'
    if (t.startsWith('TIMESTAMPTZ') || t.startsWith('TIMESTAMP WITH')) return '#a78bfa'
    if (t.startsWith('TIMESTAMP')) return '#a78bfa'
    if (t.startsWith('TIMETZ') || t.startsWith('TIME WITH')) return '#a78bfa'
    if (t.startsWith('TIME')) return '#a78bfa'
    if (t.startsWith('DATE')) return '#a78bfa'
    if (t.startsWith('INTERVAL')) return '#a78bfa'
    if (t === 'YEAR') return '#a78bfa' // MySQL YEAR

    // Boolean / bit
    if (t.startsWith('BOOLEAN') || t === 'BOOL') return '#fbbf24'
    if (t.startsWith('BIT')) return '#fbbf24' // BIT, BIT(1), BIT VARYING

    // Binary / blob / raw
    if (t.startsWith('TINYBLOB')) return '#f87171'
    if (t.startsWith('MEDIUMBLOB')) return '#f87171'
    if (t.startsWith('LONGBLOB')) return '#f87171'
    if (t.startsWith('BLOB')) return '#f87171'
    if (t.startsWith('VARBINARY')) return '#f87171'
    if (t.startsWith('BINARY')) return '#f87171'
    if (t.startsWith('BYTEA')) return '#f87171'
    if (t === 'IMAGE') return '#f87171' // MSSQL legacy
    if (t.startsWith('RAW')) return '#f87171' // Oracle RAW / LONG RAW
    if (t.startsWith('BFILE')) return '#f87171' // Oracle BFILE

    // JSON / XML / UUID / network / geo / spatial
    if (t.startsWith('JSONB') || t.startsWith('JSON')) return '#22d3ee'
    if (t.startsWith('XMLTYPE') || t.startsWith('XML')) return '#22d3ee'
    if (t.startsWith('UUID') || t.startsWith('UNIQUEIDENTIFIER')) return '#22d3ee'
    if (t.startsWith('INET') || t.startsWith('CIDR') || t.startsWith('MACADDR')) return '#22d3ee'
    if (
        t.startsWith('POINT') ||
        t.startsWith('LINE') ||
        t.startsWith('LSEG') ||
        t.startsWith('BOX') ||
        t.startsWith('PATH') ||
        t.startsWith('POLYGON') ||
        t.startsWith('CIRCLE')
    )
        return '#22d3ee'
    if (t.startsWith('GEOGRAPHY') || t.startsWith('GEOMETRY') || t.startsWith('HIERARCHYID'))
        return '#22d3ee'
    if (t.startsWith('OID')) return '#22d3ee'
    if (t === 'ROWVERSION') return '#22d3ee' // MSSQL

    // Enum / set / array / special
    if (t.startsWith('ENUM') || t.startsWith('SET')) return '#f472b6'
    if (t.startsWith('ARRAY')) return '#f472b6'
    if (t.startsWith('TSVECTOR') || t.startsWith('TSQUERY')) return '#f472b6'
    if (t.startsWith('HSTORE')) return '#f472b6'
    if (t.includes('USER-DEFINED') || t.includes('USER DEFINED')) return '#f472b6'
    if (t === 'SQL_VARIANT') return '#f472b6' // MSSQL
    if (t === 'NUMERIC') return '#fb923c' // SQLite affinity

    // Fallback
    return '#9ca3af'
}

function computeLayout(tables) {
    if (!tables?.length) return { rfNodes: [], rfEdges: [] }

    const byName = Object.fromEntries(tables.map((t) => [t.name, t]))

    // Level assignment via FK propagation
    const level = Object.fromEntries(tables.map((t) => [t.name, 0]))
    for (let pass = 0; pass < tables.length; pass++) {
        tables.forEach((t) => {
            t.columns.forEach((col) => {
                if (col.foreignKey && col.referencedTable && byName[col.referencedTable]) {
                    const refLevel = level[col.referencedTable] ?? 0
                    if ((level[t.name] ?? 0) <= refLevel) {
                        level[t.name] = refLevel + 1
                    }
                }
            })
        })
    }

    // Group tables by level, sort alphabetically within level
    const byLevel = {}
    tables.forEach((t) => {
        const l = level[t.name] ?? 0
        ;(byLevel[l] = byLevel[l] ?? []).push(t)
    })
    Object.values(byLevel).forEach((arr) => arr.sort((a, b) => a.name.localeCompare(b.name)))

    // Compute x/y positions
    const positions = {}
    Object.keys(byLevel)
        .map(Number)
        .sort((a, b) => a - b)
        .forEach((l) => {
            let yOffset = PADDING
            byLevel[l].forEach((t) => {
                positions[t.name] = {
                    x: PADDING + l * (COL_WIDTH + H_GAP),
                    y: yOffset,
                }
                yOffset += HEADER_H + t.columns.length * ROW_HEIGHT + V_GAP
            })
        })

    // React Flow nodes
    const rfNodes = tables.map((t) => ({
        id: t.name,
        type: 'tableNode',
        position: positions[t.name] ?? { x: PADDING, y: PADDING },
        data: { table: t },
        deletable: false,
    }))

    // React Flow edges - one per FK column
    const rfEdges = []
    tables.forEach((t) => {
        t.columns.forEach((col) => {
            if (!col.foreignKey || !col.referencedTable || !byName[col.referencedTable]) return
            rfEdges.push({
                id: `${t.name}.${col.name}->${col.referencedTable}`,
                source: t.name,
                target: col.referencedTable,
                sourceHandle: `src-${t.name}`,
                targetHandle: `tgt-${col.referencedTable}`,
                type: 'smoothstep',
                animated: false,
                markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10 },
                label: `${col.name} -> ${col.referencedColumn ?? ''}`,
                labelStyle: { fontSize: 9, fill: '#9ca3af' },
                labelBgStyle: { fill: 'transparent' },
                style: { strokeWidth: 1.5 },
            })
        })
    })

    return { rfNodes, rfEdges }
}

// Custom table node
function TableNode({ data, selected }) {
    const { table } = data

    return (
        <div
            style={{
                width: COL_WIDTH,
                borderRadius: 8,
                overflow: 'hidden',
                boxShadow: selected
                    ? '0 0 0 2px #3b82f6, 0 4px 16px rgba(0,0,0,0.3)'
                    : '0 2px 8px rgba(0,0,0,0.2)',
                border: `1px solid ${selected ? '#3b82f6' : 'var(--erd-border)'}`,
                background: 'var(--erd-body)',
                fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            }}
        >
            {/* Table-level handles */}
            <Handle
                type="source"
                position={Position.Right}
                id={`src-${table.name}`}
                style={{ opacity: 0, pointerEvents: 'none' }}
            />
            <Handle
                type="target"
                position={Position.Left}
                id={`tgt-${table.name}`}
                style={{ opacity: 0, pointerEvents: 'none' }}
            />

            {/* Header */}
            <div
                style={{
                    background: 'var(--erd-header)',
                    padding: '0 10px',
                    height: HEADER_H,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                <span
                    style={{
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 700,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: COL_WIDTH - 40,
                    }}
                >
                    {table.name}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>
                    {table.columns.length}
                </span>
            </div>

            {/* Column rows */}
            {table.columns.map((col, i) => (
                <div
                    key={col.name}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0 8px',
                        height: ROW_HEIGHT,
                        borderTop: i === 0 ? 'none' : '1px solid var(--erd-row-border)',
                        background: 'var(--erd-body)',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            overflow: 'hidden',
                        }}
                    >
                        {col.primaryKey && (
                            <LuKey
                                style={{ color: '#fbbf24', flexShrink: 0, width: 10, height: 10 }}
                            />
                        )}
                        {col.foreignKey && !col.primaryKey && (
                            <LuLink2
                                style={{ color: '#60a5fa', flexShrink: 0, width: 10, height: 10 }}
                            />
                        )}
                        <span
                            style={{
                                fontSize: 10,
                                color: 'var(--erd-text)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: 130,
                            }}
                        >
                            {col.name}
                        </span>
                    </div>

                    <span
                        style={{
                            fontSize: 9,
                            color: typeColor(col.type),
                            flexShrink: 0,
                            maxWidth: 80,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {col.type?.length > 14 ? col.type.slice(0, 12) + '...' : col.type}
                    </span>
                </div>
            ))}
        </div>
    )
}

const nodeTypes = { tableNode: TableNode }

// Inner component
function ErdInner({ tables, isDark }) {
    const { rfNodes, rfEdges } = useMemo(() => computeLayout(tables), [tables])

    const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes)
    const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges)
    const { fitView } = useReactFlow()

    // Sync when namespace switches - fitView/setNodes/setEdges are stable React Flow refs
    useEffect(() => {
        const { rfNodes: newNodes, rfEdges: newEdges } = computeLayout(tables)
        setNodes(newNodes)
        setEdges(newEdges)
        setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 50)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tables])

    // CSS variables drive light/dark without threading isDark into every node
    const cssVars = isDark
        ? {
              '--erd-bg': '#020617',
              '--erd-body': '#0f172a',
              '--erd-header': '#1e293b',
              '--erd-border': '#334155',
              '--erd-row-border': '#1e293b',
              '--erd-text': '#e2e8f0',
              '--erd-edge': '#475569',
          }
        : {
              '--erd-bg': '#f8fafc',
              '--erd-body': '#ffffff',
              '--erd-header': '#f97316',
              '--erd-border': '#e2e8f0',
              '--erd-row-border': '#f1f5f9',
              '--erd-text': '#1e293b',
              '--erd-edge': '#94a3b8',
          }

    if (!tables?.length) {
        return (
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    background: isDark ? '#020617' : '#f8fafc',
                }}
            >
                <p style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>
                    No tables to display
                </p>
            </div>
        )
    }

    return (
        <div style={{ width: '100%', height: '100%', ...cssVars }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.15 }}
                minZoom={0.05}
                maxZoom={2}
                proOptions={{ hideAttribution: true }}
                style={{ background: 'var(--erd-bg)' }}
                defaultEdgeOptions={{
                    type: 'smoothstep',
                    style: { stroke: 'var(--erd-edge)', strokeWidth: 1.5 },
                    markerEnd: {
                        type: MarkerType.ArrowClosed,
                        color: 'var(--erd-edge)',
                    },
                }}
                connectOnClick={false}
                nodesConnectable={false}
            >
                <Background
                    color={isDark ? '#1e293b' : '#e2e8f0'}
                    gap={20}
                    size={1}
                    variant="dots"
                />
                <Controls
                    showInteractive={false}
                    style={{
                        background: isDark ? '#1e293b' : '#fff',
                        border: `1px solid ${isDark ? '#334155' : '#e5e7eb'}`,
                        borderRadius: 6,
                    }}
                />
                <MiniMap
                    nodeColor={() => (isDark ? '#1e293b' : '#f97316')}
                    maskColor={isDark ? 'rgba(2,6,23,0.75)' : 'rgba(248,250,252,0.75)'}
                    style={{
                        background: isDark ? '#0f172a' : '#fff',
                        border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                        borderRadius: 6,
                    }}
                />
            </ReactFlow>
        </div>
    )
}

// Public export
function SchemaErd({ tables, isDark }) {
    return (
        <ReactFlowProvider>
            <ErdInner tables={tables} isDark={isDark} />
        </ReactFlowProvider>
    )
}

export default SchemaErd
