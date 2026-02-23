import { useEffect, useRef } from 'react'

function AboutModal({ isOpen, onClose }) {
    const overlayRef = useRef(null)

    useEffect(() => {
        if (!isOpen) return
        function handle(e) {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handle)
        return () => document.removeEventListener('keydown', handle)
    }, [isOpen, onClose])

    function handleOverlayClick(e) {
        if (e.target === overlayRef.current) onClose()
    }

    if (!isOpen) return null

    return (
        <div
            ref={overlayRef}
            onClick={handleOverlayClick}
            className="
        fixed inset-0 z-50
        bg-black/50 dark:bg-black/70
        flex items-center justify-center p-4
      "
        >
            <div className="
        w-full max-w-sm
        bg-white dark:bg-gray-900
        rounded-lg shadow-2xl
        border border-gray-200 dark:border-gray-700
        overflow-hidden
      ">
                {/* Logo + name */}
                <div className="
          flex flex-col items-center gap-3
          px-6 py-8
          border-b border-gray-100 dark:border-gray-800
        ">
                    <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg">
                        <span className="text-white text-xl font-bold">S</span>
                    </div>
                    <div className="text-center">
                        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
                            sql-notebook
                        </h2>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            Version 0.1.0
                        </p>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 text-center max-w-xs leading-relaxed">
                        A lightweight SQL notebook for querying multiple databases
                        from a single interface. Write SQL, see results, explore schema.
                    </p>
                </div>

                {/* Meta */}
                <div className="px-6 py-4 flex flex-col gap-2">
                    {[
                        { label: 'Backend',  value: 'Java 21 + Jetty 12' },
                        { label: 'Frontend', value: 'React 18 + Vite'    },
                        { label: 'License',  value: 'MIT'                 },
                    ].map(({ label, value }) => (
                        <div key={label} className="flex items-center justify-between">
                            <span className="text-xs text-gray-400 dark:text-gray-500">{label}</span>
                            <span className="text-xs font-mono text-gray-600 dark:text-gray-400">{value}</span>
                        </div>
                    ))}
                </div>

                {/* Close */}
                <div className="px-6 pb-5">
                    <button
                        onClick={onClose}
                        className="
              w-full py-2 rounded text-xs font-medium
              bg-gray-100 dark:bg-gray-800
              text-gray-600 dark:text-gray-400
              hover:bg-gray-200 dark:hover:bg-gray-700
              transition-colors
            "
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    )
}

export default AboutModal