import { useState, useEffect, useRef } from 'react'
import useConfigModalStore from '../../store/useConfigModalStore.js'

const DB_TYPES = [
    { value: 'mysql',    label: 'MySQL',       defaultPort: 3306,  backendType: 'mysql'                },
    { value: 'postgres', label: 'PostgreSQL',  defaultPort: 5432,  backendType: 'postgresql'           },
    { value: 'sqlite',   label: 'SQLite',      defaultPort: null,  backendType: 'sqlite'               },
    { value: 'oracle',   label: 'Oracle',      defaultPort: 1521,  backendType: 'oracle'               },
    { value: 'mssql',    label: 'SQL Server',  defaultPort: 1433,  backendType: 'microsoft-sql-server' },
]

const EMPTY_FORM = { namespace: '', type: 'mysql', host: 'localhost', port: '3306', database: '', username: '', password: '' }

function Field({ label, error, children }) {
    return (
        <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</label>
            {children}
            {error && <span className="text-xs text-red-500 dark:text-red-400">{error}</span>}
        </div>
    )
}

function Input({ className = '', ...props }) {
    return (
        <input className={`
            w-full px-3 py-2 rounded text-sm font-mono
            bg-gray-50 dark:bg-gray-800
            border border-gray-200 dark:border-gray-700
            text-gray-800 dark:text-gray-100
            placeholder-gray-300 dark:placeholder-gray-600
            focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
            focus:border-transparent transition-colors
            ${className}
        `} {...props} />
    )
}

function validate(form) {
    const errors = {}
    if (!form.namespace.trim())
        errors.namespace = 'Namespace name is required'
    else if (!/^[a-z0-9_]+$/.test(form.namespace))
        errors.namespace = 'Only lowercase letters, numbers and underscores'
    if (form.type !== 'sqlite') {
        if (!form.host.trim())    errors.host = 'Host is required'
        if (!form.port || isNaN(form.port) || +form.port < 1 || +form.port > 65535)
            errors.port = 'Port must be between 1 and 65535'
        if (!form.username.trim()) errors.username = 'Username is required'
    }
    if (!form.database.trim())
        errors.database = form.type === 'sqlite' ? 'File path is required' : 'Database name is required'
    return errors
}

function buildPayload(form) {
    const dbType = DB_TYPES.find(d => d.value === form.type)
    return {
        namespace: form.namespace,
        type:      dbType?.backendType ?? form.type,
        host:      form.host,
        port:      form.port ? parseInt(form.port, 10) : undefined,
        database:  form.database,
        username:  form.username,
        password:  form.password,
    }
}

function ConfigModal() {
    const { isOpen, close } = useConfigModalStore()
    const [form, setForm]           = useState(EMPTY_FORM)
    const [errors, setErrors]       = useState({})
    const [status, setStatus]       = useState(null)
    const [statusMsg, setStatusMsg] = useState('')
    const [homeDir, setHomeDir]     = useState('')
    const [separator, setSeparator] = useState('/')
    const overlayRef = useRef(null)
    const isSQLite   = form.type === 'sqlite'

    // Fetch server home dir once — used to pre-fill the SQLite path field
    useEffect(() => {
        fetch('/system/info')
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data?.homeDir)   setHomeDir(data.homeDir)
                if (data?.separator) setSeparator(data.separator)
            })
            .catch(() => {})
    }, [])

    useEffect(() => {
        if (isOpen) { setForm(EMPTY_FORM); setErrors({}); setStatus(null); setStatusMsg('') }
    }, [isOpen])

    useEffect(() => {
        if (!isOpen) return
        const handle = e => { if (e.key === 'Escape') close() }
        document.addEventListener('keydown', handle)
        return () => document.removeEventListener('keydown', handle)
    }, [isOpen, close])

    function handleOverlayClick(e) { if (e.target === overlayRef.current) close() }

    function handleChange(field, value) {
        setForm(prev => {
            const next = { ...prev, [field]: value }
            if (field === 'type') {
                const dbType = DB_TYPES.find(d => d.value === value)
                next.port = dbType?.defaultPort?.toString() ?? ''
                // When switching to SQLite, pre-fill path with homeDir so user
                // just appends the filename — e.g. /Users/alice/chinook.db
                next.database = value === 'sqlite' && homeDir
                    ? `${homeDir}${separator}`
                    : ''
            }
            return next
        })
        setErrors(prev => ({ ...prev, [field]: undefined }))
    }

    async function handleTestConnection() {
        const errs = validate(form)
        if (Object.keys(errs).length > 0) { setErrors(errs); return }
        setStatus('testing'); setStatusMsg('')
        try {
            const res  = await fetch('/connections/test', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildPayload(form)),
            })
            const data = await res.json()
            if (data.success) { setStatus('success'); setStatusMsg('✓ ' + (data.message ?? 'Connection successful')) }
            else              { setStatus('error');   setStatusMsg('✗ ' + (data.message ?? 'Connection failed')) }
        } catch {
            setStatus('error'); setStatusMsg('✗ Could not reach backend')
        }
    }

    async function handleConnect() {
        const errs = validate(form)
        if (Object.keys(errs).length > 0) { setErrors(errs); return }
        setStatus('connecting'); setStatusMsg('')
        try {
            const res  = await fetch('/connections/add', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildPayload(form)),
            })
            const data = await res.json()
            if (res.status === 201) {
                setStatus('success'); setStatusMsg('✓ Connection added')
                window.dispatchEvent(new CustomEvent('namespace-added'))
                setTimeout(close, 900)
            } else if (res.status === 409) {
                setStatus('error'); setStatusMsg('✗ Namespace already exists')
            } else {
                setStatus('error'); setStatusMsg('✗ ' + (data.error ?? 'Failed to add connection'))
            }
        } catch {
            setStatus('error'); setStatusMsg('✗ Could not reach backend')
        }
    }

    if (!isOpen) return null

    return (
        <div
            ref={overlayRef}
            onClick={handleOverlayClick}
            className="fixed inset-0 z-50 bg-black/50 dark:bg-black/70 flex items-center justify-center p-4"
        >
            <div className="
                w-full max-w-md bg-white dark:bg-gray-900
                rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700
                flex flex-col max-h-[90vh] overflow-y-auto
            ">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                    <div>
                        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Add Database Connection</h2>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Configure a new namespace to query against</p>
                    </div>
                    <button onClick={close} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-lg leading-none transition-colors">✕</button>
                </div>

                {/* Form */}
                <div className="px-5 py-4 flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Namespace name *" error={errors.namespace}>
                            <Input type="text" placeholder="prod_mysql" value={form.namespace}
                                   onChange={e => handleChange('namespace', e.target.value)} />
                        </Field>
                        <Field label="Database type *">
                            <select value={form.type} onChange={e => handleChange('type', e.target.value)}
                                    className="w-full px-3 py-2 rounded text-sm font-mono bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors">
                                {DB_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                            </select>
                        </Field>
                    </div>

                    {!isSQLite && (
                        <div className="grid grid-cols-3 gap-3">
                            <div className="col-span-2">
                                <Field label="Host *" error={errors.host}>
                                    <Input type="text" placeholder="localhost" value={form.host}
                                           onChange={e => handleChange('host', e.target.value)} />
                                </Field>
                            </div>
                            <Field label="Port *" error={errors.port}>
                                <Input type="number" placeholder="3306" value={form.port}
                                       onChange={e => handleChange('port', e.target.value)} />
                            </Field>
                        </div>
                    )}

                    {/* Database / file path */}
                    <Field label={isSQLite ? 'File path *' : 'Database name *'} error={errors.database}>
                        <Input
                            type="text"
                            // SQLite: cursor lands after the trailing separator so user
                            // just types the filename — /Users/alice/|  → chinook.db
                            placeholder={
                                isSQLite
                                    ? (homeDir ? `${homeDir}${separator}chinook.db` : '/absolute/path/to/database.db')
                                    : 'mydb'
                            }
                            value={form.database}
                            onChange={e => handleChange('database', e.target.value)}
                        />
                        {isSQLite && (
                            <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5 font-mono">
                                Full absolute path required — e.g. {homeDir || '/home/user'}{separator}chinook.db
                            </p>
                        )}
                    </Field>

                    {!isSQLite && (
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Username *" error={errors.username}>
                                <Input type="text" placeholder="root" value={form.username}
                                       onChange={e => handleChange('username', e.target.value)} />
                            </Field>
                            <Field label="Password">
                                <Input type="password" placeholder="••••••••" value={form.password}
                                       onChange={e => handleChange('password', e.target.value)} />
                            </Field>
                        </div>
                    )}

                    {statusMsg && (
                        <div className={`text-xs px-3 py-2 rounded font-mono ${
                            status === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                                : status === 'error' ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                                    : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                        }`}>
                            {statusMsg}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 dark:border-gray-800">
                    <button onClick={handleTestConnection}
                            disabled={status === 'testing' || status === 'connecting'}
                            className="text-xs px-4 py-2 rounded transition-colors border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed">
                        {status === 'testing' ? 'Testing...' : 'Test Connection'}
                    </button>
                    <div className="flex items-center gap-2">
                        <button onClick={close}
                                className="text-xs px-4 py-2 rounded transition-colors text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                            Cancel
                        </button>
                        <button onClick={handleConnect}
                                disabled={status === 'testing' || status === 'connecting'}
                                className="text-xs px-4 py-2 rounded transition-colors bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                            {status === 'connecting' ? 'Connecting...' : 'Connect'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default ConfigModal