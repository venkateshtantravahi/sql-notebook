import { MdCheckCircle, MdErrorOutline, MdClose } from 'react-icons/md'
import { LuFolderOpen } from 'react-icons/lu'
import { useState, useEffect, useRef } from 'react'
import useConfigModalStore from '../../store/useConfigModalStore.js'
import FileBrowserModal from './FileBrowserModal.jsx'

const DB_TYPES = [
    { value: 'mysql', label: 'MySQL', defaultPort: 3306, backendType: 'mysql' },
    { value: 'postgres', label: 'PostgreSQL', defaultPort: 5432, backendType: 'postgresql' },
    { value: 'sqlite', label: 'SQLite', defaultPort: null, backendType: 'sqlite' },
    { value: 'oracle', label: 'Oracle', defaultPort: 1521, backendType: 'oracle' },
    { value: 'mssql', label: 'SQL Server', defaultPort: 1433, backendType: 'microsoft-sql-server' },
]

const EMPTY_FORM = {
    namespace: '',
    type: 'mysql',
    host: 'localhost',
    port: '3306',
    database: '',
    username: '',
    password: '',
}

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
        <input
            className={`
            w-full px-3 py-2 rounded text-sm font-mono
            bg-gray-50 dark:bg-gray-800
            border border-gray-200 dark:border-gray-700
            text-gray-800 dark:text-gray-100
            placeholder-gray-300 dark:placeholder-gray-600
            focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
            focus:border-transparent transition-colors
            ${className}
        `}
            {...props}
        />
    )
}

function validate(form) {
    const errors = {}
    if (!form.namespace.trim()) errors.namespace = 'Namespace name is required'
    else if (!/^[a-z0-9_]+$/.test(form.namespace))
        errors.namespace = 'Only lowercase letters, numbers and underscores'
    if (form.type !== 'sqlite') {
        if (!form.host.trim()) errors.host = 'Host is required'
        if (!form.port || isNaN(form.port) || +form.port < 1 || +form.port > 65535)
            errors.port = 'Port must be between 1 and 65535'
        if (!form.username.trim()) errors.username = 'Username is required'
    }
    if (!form.database.trim())
        errors.database =
            form.type === 'sqlite' ? 'File path is required' : 'Database name is required'
    return errors
}

function buildPayload(form) {
    const dbType = DB_TYPES.find((d) => d.value === form.type)
    return {
        namespace: form.namespace,
        type: dbType?.backendType ?? form.type,
        host: form.host,
        port: form.port ? parseInt(form.port, 10) : undefined,
        database: form.database,
        username: form.username,
        password: form.password,
    }
}

// Reverse map backend type → form value
function backendTypeToFormValue(backendType) {
    const found = DB_TYPES.find((d) => d.backendType === backendType)
    return found?.value ?? 'mysql'
}

function ConfigModal() {
    const { isOpen, close, editConnection } = useConfigModalStore()
    const isEdit = !!editConnection // editConnection = { namespace, type, host, port, database, username }

    const [form, setForm] = useState(EMPTY_FORM)
    const [errors, setErrors] = useState({})
    const [status, setStatus] = useState(null)
    const [statusMsg, setStatusMsg] = useState('')
    const [homeDir, setHomeDir] = useState('')
    const [separator, setSeparator] = useState('/')
    const [showBrowser, setShowBrowser] = useState(false)
    const overlayRef = useRef(null)
    const isSQLite = form.type === 'sqlite'

    // Fetch server home dir once
    useEffect(() => {
        fetch('/system/info')
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (data?.homeDir) setHomeDir(data.homeDir)
                if (data?.separator) setSeparator(data.separator)
            })
            .catch(() => {})
    }, [])

    // When modal opens reset or pre-fill
    useEffect(() => {
        if (!isOpen) return
        setErrors({})
        setStatus(null)
        setStatusMsg('')
        setShowBrowser(false)

        if (isEdit && editConnection) {
            // Pre-fill form with existing connection data
            setForm({
                namespace: editConnection.namespace ?? '',
                type: backendTypeToFormValue(editConnection.type ?? 'mysql'),
                host: editConnection.host ?? 'localhost',
                port: editConnection.port ? String(editConnection.port) : '3306',
                database: editConnection.database ?? '',
                username: editConnection.username ?? '',
                password: '', // never pre-fill password for security
            })
        } else {
            setForm(EMPTY_FORM)
        }
    }, [isOpen, isEdit, editConnection])

    useEffect(() => {
        if (!isOpen) return
        const handle = (e) => {
            if (e.key === 'Escape' && !showBrowser) close()
        }
        document.addEventListener('keydown', handle)
        return () => document.removeEventListener('keydown', handle)
    }, [isOpen, close, showBrowser])

    function handleOverlayClick(e) {
        if (e.target === overlayRef.current && !showBrowser) close()
    }

    function handleChange(field, value) {
        setForm((prev) => {
            const next = { ...prev, [field]: value }
            if (field === 'type') {
                const dbType = DB_TYPES.find((d) => d.value === value)
                next.port = dbType?.defaultPort?.toString() ?? ''
                next.database =
                    value === 'sqlite' && homeDir && !isEdit
                        ? `${homeDir}${separator}`
                        : prev.database
            }
            return next
        })
        setErrors((prev) => ({ ...prev, [field]: undefined }))
    }

    function handleFilePicked(absolutePath) {
        setForm((prev) => ({ ...prev, database: absolutePath }))
        setErrors((prev) => ({ ...prev, database: undefined }))
        setShowBrowser(false)
    }

    async function handleTestConnection() {
        const errs = validate(form)
        if (Object.keys(errs).length > 0) {
            setErrors(errs)
            return
        }
        setStatus('testing')
        setStatusMsg('')
        try {
            const res = await fetch('/connections/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildPayload(form)),
            })
            const data = await res.json()
            if (data.success) {
                setStatus('success')
                setStatusMsg(
                    <MdCheckCircle className="inline text-emerald-500" /> +
                        (data.message ?? 'Connection successful')
                )
            } else {
                setStatus('error')
                setStatusMsg(
                    <MdErrorOutline className="inline text-red-500" /> +
                        (data.message ?? 'Connection failed')
                )
            }
        } catch {
            setStatus('error')
            setStatusMsg('✗ Could not reach backend')
        }
    }

    async function handleSave() {
        const errs = validate(form)
        if (Object.keys(errs).length > 0) {
            setErrors(errs)
            return
        }
        setStatus('connecting')
        setStatusMsg('')

        try {
            let res, data

            if (isEdit) {
                // PUT /connections/:oldNamespace
                res = await fetch(`/connections/${editConnection.namespace}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(buildPayload(form)),
                })
                data = await res.json()
                if (res.ok) {
                    setStatus('success')
                    setStatusMsg('✓ Connection updated')
                    window.dispatchEvent(new CustomEvent('namespace-added'))
                    setTimeout(close, 900)
                } else {
                    setStatus('error')
                    setStatusMsg(
                        <MdErrorOutline className="inline text-red-500" /> +
                            (data.error ?? 'Update failed')
                    )
                }
            } else {
                // POST /connections/add
                res = await fetch('/connections/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(buildPayload(form)),
                })
                data = await res.json()
                if (res.status === 201) {
                    setStatus('success')
                    setStatusMsg('✓ Connection added')
                    window.dispatchEvent(new CustomEvent('namespace-added'))
                    setTimeout(close, 900)
                } else if (res.status === 409) {
                    setStatus('error')
                    setStatusMsg('✗ Namespace already exists')
                } else {
                    setStatus('error')
                    setStatusMsg(
                        <MdErrorOutline className="inline text-red-500" /> +
                            (data.error ?? 'Failed to add connection')
                    )
                }
            }
        } catch {
            setStatus('error')
            setStatusMsg('✗ Could not reach backend')
        }
    }

    if (!isOpen) return null

    return (
        <>
            <div
                ref={overlayRef}
                onClick={handleOverlayClick}
                className="fixed inset-0 z-50 bg-black/50 dark:bg-black/70 flex items-center justify-center p-4"
            >
                <div
                    className="
                    w-full max-w-md bg-white dark:bg-gray-900
                    rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700
                    flex flex-col max-h-[90vh] overflow-y-auto
                "
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                        <div>
                            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                                {isEdit
                                    ? `Edit Connection — ${editConnection.namespace}`
                                    : 'Add Database Connection'}
                            </h2>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                {isEdit
                                    ? 'Update credentials or rename this namespace'
                                    : 'Configure a new namespace to query against'}
                            </p>
                        </div>
                        <button
                            onClick={close}
                            className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-lg leading-none transition-colors"
                        >
                            <MdClose />
                        </button>
                    </div>

                    {/* Form */}
                    <div className="px-5 py-4 flex flex-col gap-4">
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Namespace name *" error={errors.namespace}>
                                <Input
                                    type="text"
                                    placeholder="prod_mysql"
                                    value={form.namespace}
                                    onChange={(e) => handleChange('namespace', e.target.value)}
                                />
                            </Field>
                            <Field label="Database type *">
                                <select
                                    value={form.type}
                                    onChange={(e) => handleChange('type', e.target.value)}
                                    className="w-full px-3 py-2 rounded text-sm font-mono bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                                >
                                    {DB_TYPES.map((d) => (
                                        <option key={d.value} value={d.value}>
                                            {d.label}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                        </div>

                        {!isSQLite && (
                            <div className="grid grid-cols-3 gap-3">
                                <div className="col-span-2">
                                    <Field label="Host *" error={errors.host}>
                                        <Input
                                            type="text"
                                            placeholder="localhost"
                                            value={form.host}
                                            onChange={(e) => handleChange('host', e.target.value)}
                                        />
                                    </Field>
                                </div>
                                <Field label="Port *" error={errors.port}>
                                    <Input
                                        type="number"
                                        placeholder="3306"
                                        value={form.port}
                                        onChange={(e) => handleChange('port', e.target.value)}
                                    />
                                </Field>
                            </div>
                        )}

                        <Field
                            label={isSQLite ? 'File path *' : 'Database name *'}
                            error={errors.database}
                        >
                            {isSQLite ? (
                                <div className="flex gap-2">
                                    <Input
                                        type="text"
                                        placeholder={
                                            homeDir
                                                ? `${homeDir}${separator}chinook.db`
                                                : '/absolute/path/to/database.db'
                                        }
                                        value={form.database}
                                        onChange={(e) => handleChange('database', e.target.value)}
                                        className="flex-1 min-w-0"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowBrowser(true)}
                                        className="shrink-0 px-3 py-2 rounded text-xs font-mono border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                                        title="Browse filesystem for .db file"
                                    >
                                        <LuFolderOpen size={13} className="inline mr-1" /> Browse
                                    </button>
                                </div>
                            ) : (
                                <Input
                                    type="text"
                                    placeholder="mydb"
                                    value={form.database}
                                    onChange={(e) => handleChange('database', e.target.value)}
                                />
                            )}
                        </Field>

                        {!isSQLite && (
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Username *" error={errors.username}>
                                    <Input
                                        type="text"
                                        placeholder="root"
                                        value={form.username}
                                        onChange={(e) => handleChange('username', e.target.value)}
                                    />
                                </Field>
                                <Field
                                    label={isEdit ? 'Password (leave blank to keep)' : 'Password'}
                                >
                                    <Input
                                        type="password"
                                        placeholder="••••••••"
                                        value={form.password}
                                        onChange={(e) => handleChange('password', e.target.value)}
                                    />
                                </Field>
                            </div>
                        )}

                        {statusMsg && (
                            <div
                                className={`text-xs px-3 py-2 rounded font-mono ${
                                    status === 'success'
                                        ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                                        : status === 'error'
                                          ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                                          : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                                }`}
                            >
                                {statusMsg}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100 dark:border-gray-800">
                        <button
                            onClick={handleTestConnection}
                            disabled={status === 'testing' || status === 'connecting'}
                            className="text-xs px-4 py-2 rounded transition-colors border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {status === 'testing' ? 'Testing...' : 'Test Connection'}
                        </button>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={close}
                                className="text-xs px-4 py-2 rounded transition-colors text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={status === 'testing' || status === 'connecting'}
                                className="text-xs px-4 py-2 rounded transition-colors bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {status === 'connecting'
                                    ? isEdit
                                        ? 'Saving...'
                                        : 'Connecting...'
                                    : isEdit
                                      ? 'Save Changes'
                                      : 'Connect'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <FileBrowserModal
                isOpen={showBrowser}
                initialPath={homeDir}
                onSelect={handleFilePicked}
                onClose={() => setShowBrowser(false)}
            />
        </>
    )
}

export default ConfigModal
