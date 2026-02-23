import { useState, useEffect, useRef } from 'react'
import useConfigModalStore from '../../store/useConfigModalStore.js'

// ── constants ────────────────────────────────────────────────────────────────

const DB_TYPES = [
    { value: 'mysql',      label: 'MySQL',       defaultPort: 3306  },
    { value: 'postgres',   label: 'PostgreSQL',  defaultPort: 5432  },
    { value: 'sqlite',     label: 'SQLite',      defaultPort: null  },
    { value: 'oracle',     label: 'Oracle',      defaultPort: 1521  },
    { value: 'mssql',      label: 'SQL Server',  defaultPort: 1433  },
]

const EMPTY_FORM = {
    namespace: '',
    type:      'mysql',
    host:      'localhost',
    port:      '3306',
    database:  '',
    username:  '',
    password:  '',
    poolSize:  '10',
}

// ── small input component ────────────────────────────────────────────────────

function Field({ label, error, children }) {
    return (
        <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                {label}
            </label>
            {children}
            {error && (
                <span className="text-xs text-red-500 dark:text-red-400">{error}</span>
            )}
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
        focus:border-transparent
        transition-colors
        ${className}
      `}
            {...props}
        />
    )
}

// ── validation ───────────────────────────────────────────────────────────────

function validate(form) {
    const errors = {}

    if (!form.namespace.trim())
        errors.namespace = 'Namespace name is required'
    else if (!/^[a-z0-9_]+$/.test(form.namespace))
        errors.namespace = 'Only lowercase letters, numbers and underscores'

    if (form.type !== 'sqlite') {
        if (!form.host.trim())
            errors.host = 'Host is required'
        if (!form.port || isNaN(form.port) || +form.port < 1 || +form.port > 65535)
            errors.port = 'Port must be between 1 and 65535'
        if (!form.username.trim())
            errors.username = 'Username is required'
    }

    if (!form.database.trim())
        errors.database = form.type === 'sqlite' ? 'File path is required' : 'Database name is required'

    if (!form.poolSize || isNaN(form.poolSize) || +form.poolSize < 1 || +form.poolSize > 50)
        errors.poolSize = 'Pool size must be between 1 and 50'

    return errors
}

// ── main component ───────────────────────────────────────────────────────────

function ConfigModal() {
    const { isOpen, close } = useConfigModalStore()
    const [form, setForm]     = useState(EMPTY_FORM)
    const [errors, setErrors] = useState({})
    const [status, setStatus] = useState(null) // null | 'testing' | 'saving' | 'success' | 'error'
    const [statusMsg, setStatusMsg] = useState('')
    const overlayRef = useRef(null)
    const isSQLite   = form.type === 'sqlite'

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            setForm(EMPTY_FORM)
            setErrors({})
            setStatus(null)
            setStatusMsg('')
        }
    }, [isOpen])

    // Close on Escape
    useEffect(() => {
        if (!isOpen) return
        function handle(e) {
            if (e.key === 'Escape') close()
        }
        document.addEventListener('keydown', handle)
        return () => document.removeEventListener('keydown', handle)
    }, [isOpen, close])

    // Close on overlay click
    function handleOverlayClick(e) {
        if (e.target === overlayRef.current) close()
    }

    // Update field and auto-fill port when type changes
    function handleChange(field, value) {
        setForm(prev => {
            const next = { ...prev, [field]: value }
            if (field === 'type') {
                const dbType = DB_TYPES.find(d => d.value === value)
                next.port = dbType?.defaultPort?.toString() ?? ''
            }
            return next
        })
        // Clear error for this field on change
        setErrors(prev => ({ ...prev, [field]: undefined }))
    }

    function handleTestConnection() {
        const errs = validate(form)
        if (Object.keys(errs).length > 0) {
            setErrors(errs)
            return
        }
        // TODO: POST /connections/test in feat/connection-manager
        setStatus('testing')
        setStatusMsg('')
        setTimeout(() => {
            setStatus('success')
            setStatusMsg('Connection successful')
        }, 1200)
    }

    function handleConnect() {
        const errs = validate(form)
        if (Object.keys(errs).length > 0) {
            setErrors(errs)
            return
        }
        // TODO: POST /connections in feat/connection-manager
        setStatus('saving')
        setStatusMsg('')
        setTimeout(() => {
            setStatus('success')
            setStatusMsg('Connection saved — restart backend to apply')
            setTimeout(close, 1500)
        }, 800)
    }

    if (!isOpen) return null

    return (
        <div
            ref={overlayRef}
            onClick={handleOverlayClick}
            className="
        fixed inset-0 z-50
        bg-black/50 dark:bg-black/70
        flex items-center justify-center
        p-4
      "
        >
            <div className="
        w-full max-w-md
        bg-white dark:bg-gray-900
        rounded-lg shadow-2xl
        border border-gray-200 dark:border-gray-700
        flex flex-col
        max-h-[90vh] overflow-y-auto
      ">
                {/* Header */}
                <div className="
          flex items-center justify-between
          px-5 py-4
          border-b border-gray-100 dark:border-gray-800
        ">
                    <div>
                        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                            Add Database Connection
                        </h2>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            Configure a new namespace to query against
                        </p>
                    </div>
                    <button
                        onClick={close}
                        className="
              text-gray-400 hover:text-gray-600
              dark:text-gray-500 dark:hover:text-gray-300
              text-lg leading-none transition-colors
            "
                    >
                        ✕
                    </button>
                </div>

                {/* Form */}
                <div className="px-5 py-4 flex flex-col gap-4">

                    {/* Namespace + Type row */}
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Namespace name *" error={errors.namespace}>
                            <Input
                                type="text"
                                placeholder="prod_mysql"
                                value={form.namespace}
                                onChange={e => handleChange('namespace', e.target.value)}
                            />
                        </Field>
                        <Field label="Database type *">
                            <select
                                value={form.type}
                                onChange={e => handleChange('type', e.target.value)}
                                className="
                  w-full px-3 py-2 rounded text-sm font-mono
                  bg-gray-50 dark:bg-gray-800
                  border border-gray-200 dark:border-gray-700
                  text-gray-800 dark:text-gray-100
                  focus:outline-none focus:ring-2 focus:ring-blue-500
                  focus:border-transparent transition-colors
                "
                            >
                                {DB_TYPES.map(d => (
                                    <option key={d.value} value={d.value}>{d.label}</option>
                                ))}
                            </select>
                        </Field>
                    </div>

                    {/* Host + Port — hidden for SQLite */}
                    {!isSQLite && (
                        <div className="grid grid-cols-3 gap-3">
                            <div className="col-span-2">
                                <Field label="Host *" error={errors.host}>
                                    <Input
                                        type="text"
                                        placeholder="localhost"
                                        value={form.host}
                                        onChange={e => handleChange('host', e.target.value)}
                                    />
                                </Field>
                            </div>
                            <Field label="Port *" error={errors.port}>
                                <Input
                                    type="number"
                                    placeholder="3306"
                                    value={form.port}
                                    onChange={e => handleChange('port', e.target.value)}
                                />
                            </Field>
                        </div>
                    )}

                    {/* Database / file path */}
                    <Field
                        label={isSQLite ? 'File path *' : 'Database name *'}
                        error={errors.database}
                    >
                        <Input
                            type="text"
                            placeholder={isSQLite ? '/path/to/database.db' : 'mydb'}
                            value={form.database}
                            onChange={e => handleChange('database', e.target.value)}
                        />
                    </Field>

                    {/* Username + Password — hidden for SQLite */}
                    {!isSQLite && (
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Username *" error={errors.username}>
                                <Input
                                    type="text"
                                    placeholder="root"
                                    value={form.username}
                                    onChange={e => handleChange('username', e.target.value)}
                                />
                            </Field>
                            <Field label="Password">
                                <Input
                                    type="password"
                                    placeholder="••••••••"
                                    value={form.password}
                                    onChange={e => handleChange('password', e.target.value)}
                                />
                            </Field>
                        </div>
                    )}

                    {/* Pool size */}
                    <Field label="Connection pool size" error={errors.poolSize}>
                        <Input
                            type="number"
                            placeholder="10"
                            value={form.poolSize}
                            onChange={e => handleChange('poolSize', e.target.value)}
                        />
                    </Field>

                    {/* Status message */}
                    {statusMsg && (
                        <div className={`
              text-xs px-3 py-2 rounded font-mono
              ${status === 'success'
                            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                            : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                        }
            `}>
                            {statusMsg}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="
          flex items-center justify-between
          px-5 py-4
          border-t border-gray-100 dark:border-gray-800
        ">
                    <button
                        onClick={handleTestConnection}
                        disabled={status === 'testing' || status === 'saving'}
                        className="
              text-xs px-4 py-2 rounded transition-colors
              border border-gray-200 dark:border-gray-700
              text-gray-600 dark:text-gray-400
              hover:bg-gray-50 dark:hover:bg-gray-800
              hover:text-gray-800 dark:hover:text-gray-200
              disabled:opacity-50 disabled:cursor-not-allowed
            "
                    >
                        {status === 'testing' ? 'Testing...' : 'Test Connection'}
                    </button>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={close}
                            className="
                text-xs px-4 py-2 rounded transition-colors
                text-gray-500 dark:text-gray-400
                hover:bg-gray-100 dark:hover:bg-gray-800
              "
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConnect}
                            disabled={status === 'testing' || status === 'saving'}
                            className="
                text-xs px-4 py-2 rounded transition-colors
                bg-blue-600 hover:bg-blue-500
                text-white font-medium
                disabled:opacity-50 disabled:cursor-not-allowed
              "
                        >
                            {status === 'saving' ? 'Connecting...' : 'Connect'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default ConfigModal