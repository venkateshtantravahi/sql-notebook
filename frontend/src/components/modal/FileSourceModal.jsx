import { useEffect, useRef, useState } from 'react'
import { FaRegFolderOpen } from 'react-icons/fa'
import { CgFileRemove } from 'react-icons/cg'
import { MdOutlineCancel } from 'react-icons/md'
import { IoMdArrowDropdown } from 'react-icons/io'
import { IoGlobeOutline } from 'react-icons/io5'
import { LuFileText } from 'react-icons/lu'
import useFileSourceModalStore from '../../store/useFileSourceModalStore.js'
import { Field, Input } from '../common/FormField.jsx'
import { StatusMessage } from '../common/StatusMessage.jsx'
import { getFileIcon, formatFileSize } from '../../utils/fileUtils.jsx'
import { useEscapeKey } from '../../hooks/useEscapeKey.js'

// accepted file types
const ACCEPTED_EXTS = ['.csv', '.tsv', '.json', '.ndjson', '.parquet', '.arrow', '.xlsx', '.db']
const ACCEPTED_MIME = [
    'text/csv',
    'text/tab-separated-values',
    'application/json',
    'application/x-ndjson',
    'application/octet-stream',
    'application/vnd.apache.parquet',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
].join(',')

// Local files

function LocalFileTab({ onSuccess }) {
    const [dragging, setDragging] = useState(false)
    const [file, setFile] = useState(null)
    const [status, setStatus] = useState(null) // null | 'uploading' | 'success' | 'error'
    const [statusMsg, setStatusMsg] = useState('')
    const inputRef = useRef(null)

    function acceptFile(f) {
        if (!f) return
        const ext = '.' + f.name.split('.').pop().toLowerCase()
        if (!ACCEPTED_EXTS.includes(ext)) {
            setStatus('error')
            setStatusMsg(`Unsupported file type "${ext}". Accepted: ${ACCEPTED_EXTS.join(', ')}`)
            return
        }
        setFile(f)
        setStatus(null)
        setStatusMsg('')
    }

    function onDrop(e) {
        e.preventDefault()
        setDragging(false)
        acceptFile(e.dataTransfer.files?.[0])
    }

    function onDragOver(e) {
        e.preventDefault()
        setDragging(true)
    }
    function onDragLeave() {
        setDragging(false)
    }

    async function handleUpload() {
        if (!file) return
        setStatus('uploading')
        setStatusMsg('')

        const body = new FormData()
        body.append('file', file, file.name)

        try {
            const res = await fetch('/sources/upload', { method: 'POST', body })
            const data = await res.json()
            if (res.status === 201) {
                setStatus('success')
                setStatusMsg(`Registered as namespace "${data.namespace}"`)
                window.dispatchEvent(new CustomEvent('namespace-added'))
                onSuccess?.()
            } else {
                setStatus('error')
                setStatusMsg(data.error ?? 'Upload failed')
            }
        } catch {
            setStatus('error')
            setStatusMsg('Could not reach backend')
        }
    }

    function reset() {
        setFile(null)
        setStatus(null)
        setStatusMsg('')
        if (inputRef.current) inputRef.current.value = ''
    }

    return (
        <div className="flex flex-col gap-4">
            {/* Drop zone */}
            <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onClick={() => !file && inputRef.current?.click()}
                className={`
                    relative rounded-lg border-2 border-dashed transition-colors
                    flex flex-col items-center justify-center gap-2
                    min-h-[140px] cursor-pointer select-none
                    ${
                        dragging
                            ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                            : file
                              ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 cursor-default'
                              : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-gray-50 dark:hover:bg-gray-800/30'
                    }
                `}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPTED_MIME}
                    className="hidden"
                    onChange={(e) => acceptFile(e.target.files?.[0])}
                />

                {file ? (
                    <div className="flex flex-col items-center gap-1 px-4 py-2 text-center">
                        <span className="text-3xl">{getFileIcon(file.name)}</span>
                        <span className="text-sm font-mono text-gray-800 dark:text-gray-100 font-medium">
                            {file.name}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                            {formatFileSize(file.size)}
                        </span>
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                reset()
                            }}
                            className="mt-1 text-xs text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                        >
                            <CgFileRemove /> remove
                        </button>
                    </div>
                ) : (
                    <>
                        <span className="text-3xl opacity-40">
                            <FaRegFolderOpen />
                        </span>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Drop a file here, or{' '}
                            <span className="text-blue-500 dark:text-blue-400 font-medium">
                                browse
                            </span>
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                            CSV · TSV · JSON · NDJSON · Parquet · Arrow · Excel · SQLite
                        </p>
                    </>
                )}
            </div>

            <StatusMessage status={status} message={statusMsg} />

            {/* Upload button */}
            <button
                onClick={handleUpload}
                disabled={!file || status === 'uploading' || status === 'success'}
                className="
                    w-full py-2 rounded text-sm font-medium transition-colors
                    bg-blue-600 hover:bg-blue-500 text-white
                    disabled:opacity-40 disabled:cursor-not-allowed
                "
            >
                {status === 'uploading'
                    ? 'Uploading…'
                    : status === 'success'
                      ? 'Uploaded'
                      : 'Upload File'}
            </button>
        </div>
    )
}

// Remote Source upload
const EMPTY_REMOTE = {
    url: '',
    label: '',
    s3Endpoint: '',
    s3Region: '',
    s3AccessKeyId: '',
    s3SecretAccessKey: '',
}

function RemoteSourceTab({ onSuccess }) {
    const [form, setForm] = useState(EMPTY_REMOTE)
    const [errors, setErrors] = useState({})
    const [showS3, setShowS3] = useState(false)
    const [status, setStatus] = useState(null)
    const [statusMsg, setStatusMsg] = useState('')

    const isS3 = form.url.trim().toLowerCase().startsWith('s3://')

    // auto-open S3 section when user types s3://
    useEffect(() => {
        if (isS3) setShowS3(true)
    }, [isS3])

    function set(field, value) {
        setForm((prev) => ({ ...prev, [field]: value }))
        setErrors((prev) => ({ ...prev, [field]: undefined }))
    }

    function validate() {
        const errs = {}
        const url = form.url.trim()
        if (!url) {
            errs.url = 'URL is required'
        } else if (!/^(https?|s3):\/\//i.test(url)) {
            errs.url = 'URL must start with http://, https://, or s3://'
        }
        return errs
    }

    async function handleAdd() {
        const errs = validate()
        if (Object.keys(errs).length > 0) {
            setErrors(errs)
            return
        }

        setStatus('adding')
        setStatusMsg('')

        const body = {
            url: form.url.trim(),
            label: form.label.trim() || undefined,
        }
        if (showS3 && (form.s3Endpoint || form.s3AccessKeyId)) {
            body.s3Config = {
                endpoint: form.s3Endpoint.trim() || undefined,
                region: form.s3Region.trim() || undefined,
                accessKeyId: form.s3AccessKeyId.trim() || undefined,
                secretAccessKey: form.s3SecretAccessKey.trim() || undefined,
            }
        }

        try {
            const res = await fetch('/sources/remote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const data = await res.json()
            if (res.status === 201) {
                setStatus('success')
                setStatusMsg(`Registered as namespace "${data.namespace}"`)
                window.dispatchEvent(new CustomEvent('namespace-added'))
                onSuccess?.()
            } else {
                setStatus('error')
                setStatusMsg(data.error ?? 'Failed to add remote source')
            }
        } catch {
            setStatus('error')
            setStatusMsg('Could not reach backend')
        }
    }

    return (
        <div className="flex flex-col gap-4">
            <Field label="URL *" error={errors.url}>
                <Input
                    type="text"
                    placeholder="https://example.com/data.parquet  or  s3://bucket/key.csv"
                    value={form.url}
                    onChange={(e) => set('url', e.target.value)}
                />
            </Field>

            <Field label="Label (optional)">
                <Input
                    type="text"
                    placeholder="my_sales_data"
                    value={form.label}
                    onChange={(e) => set('label', e.target.value)}
                />
                <span className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    Used as the namespace name. Auto-generated from URL if blank.
                </span>
            </Field>

            {/* S3 config collapsible */}
            <div className="rounded border border-gray-200 dark:border-gray-700 overflow-hidden">
                <button
                    onClick={() => setShowS3((v) => !v)}
                    className="
                        w-full flex items-center justify-between px-3 py-2
                        text-xs font-medium text-gray-600 dark:text-gray-400
                        bg-gray-50 dark:bg-gray-800/60
                        hover:bg-gray-100 dark:hover:bg-gray-800
                        transition-colors
                    "
                >
                    <span>
                        S3 / MinIO credentials{' '}
                        {isS3 && (
                            <span className="text-blue-500 dark:text-blue-400 ml-1">
                                (recommended for s3://)
                            </span>
                        )}
                    </span>
                    <span
                        className={`transition-transform duration-200 ${showS3 ? 'rotate-180' : ''}`}
                    >
                        <IoMdArrowDropdown />
                    </span>
                </button>

                {showS3 && (
                    <div className="px-3 py-3 flex flex-col gap-3 border-t border-gray-200 dark:border-gray-700">
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Endpoint">
                                <Input
                                    type="text"
                                    placeholder="https://s3.amazonaws.com"
                                    value={form.s3Endpoint}
                                    onChange={(e) => set('s3Endpoint', e.target.value)}
                                />
                            </Field>
                            <Field label="Region">
                                <Input
                                    type="text"
                                    placeholder="us-east-1"
                                    value={form.s3Region}
                                    onChange={(e) => set('s3Region', e.target.value)}
                                />
                            </Field>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Access Key ID">
                                <Input
                                    type="text"
                                    placeholder="AKIAIOSFODNN7EXAMPLE"
                                    value={form.s3AccessKeyId}
                                    onChange={(e) => set('s3AccessKeyId', e.target.value)}
                                />
                            </Field>
                            <Field label="Secret Access Key">
                                <Input
                                    type="password"
                                    placeholder="******************"
                                    value={form.s3SecretAccessKey}
                                    onChange={(e) => set('s3SecretAccessKey', e.target.value)}
                                />
                            </Field>
                        </div>
                    </div>
                )}
            </div>

            <StatusMessage status={status} message={statusMsg} />

            <button
                onClick={handleAdd}
                disabled={status === 'adding' || status === 'success'}
                className="
                    w-full py-2 rounded text-sm font-medium transition-colors
                    bg-blue-600 hover:bg-blue-500 text-white
                    disabled:opacity-40 disabled:cursor-not-allowed
                "
            >
                {status === 'adding'
                    ? 'Adding…'
                    : status === 'success'
                      ? 'Added'
                      : 'Add Remote Source'}
            </button>
        </div>
    )
}

// Main modal

const TABS = [
    { id: 'local', label: 'Local File' },
    { id: 'remote', label: 'Remote Source' },
]

const TAB_ICONS = {
    local: <LuFileText className="inline mr-1" />,
    remote: <IoGlobeOutline className="inline mr-1" />,
}

function FileSourceModal() {
    const { isOpen, close } = useFileSourceModalStore()
    const [activeTab, setActiveTab] = useState('local')
    const overlayRef = useRef(null)

    useEffect(() => {
        if (isOpen) setActiveTab('local')
    }, [isOpen])

    useEscapeKey(isOpen, close)

    function handleOverlayClick(e) {
        if (e.target === overlayRef.current) close()
    }

    // Close after a short delay so user can read the success message
    function handleSuccess() {
        setTimeout(close, 1200)
    }

    if (!isOpen) return null

    return (
        <div
            ref={overlayRef}
            onClick={handleOverlayClick}
            className="fixed inset-0 z-50 bg-black/50 dark:bg-black/70 flex items-center justify-center p-4"
        >
            <div
                className="
                w-full max-w-lg bg-white dark:bg-[#161f2e]
                rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700
                flex flex-col max-h-[90vh]
            "
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                    <div>
                        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                            Add Data Source
                        </h2>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            Upload a file or connect to a remote URL / S3 bucket
                        </p>
                    </div>
                    <button
                        onClick={close}
                        className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-lg leading-none transition-colors"
                    >
                        <MdOutlineCancel />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-100 dark:border-gray-800 px-5">
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`
                                py-3 px-1 mr-5 text-xs font-medium border-b-2 -mb-px transition-colors
                                ${
                                    activeTab === tab.id
                                        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                }
                            `}
                        >
                            {TAB_ICONS[tab.id]}
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab content */}
                <div className="px-5 py-5 overflow-y-auto">
                    {activeTab === 'local' ? (
                        <LocalFileTab onSuccess={handleSuccess} />
                    ) : (
                        <RemoteSourceTab onSuccess={handleSuccess} />
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end px-5 py-3 border-t border-gray-100 dark:border-gray-800">
                    <button
                        onClick={close}
                        className="text-xs px-4 py-2 rounded transition-colors text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    )
}

export default FileSourceModal
