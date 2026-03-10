import { useEffect, useState } from 'react'
import { SqlNotebookLogo } from './SqlNotebookLogo'

// SplashScreen — loading screen shown while the app initialises.
// Fades out once `ready` is true, then calls `onDone` to signal unmount.
// Animation: logo drop-in (200ms) → wordmark fade (400ms) → progress bar (600ms) → exit.
function SplashScreen({ ready, onDone }) {
    const [logoVisible, setLogoVisible] = useState(false)
    const [wordVisible, setWordVisible] = useState(false)
    const [barProgress, setBarProgress] = useState(0)
    const [exiting, setExiting] = useState(false)

    // Entry sequence
    useEffect(() => {
        const t1 = setTimeout(() => setLogoVisible(true), 80)
        const t2 = setTimeout(() => setWordVisible(true), 380)
        const t3 = setTimeout(() => setBarProgress(15), 580)
        const t4 = setTimeout(() => setBarProgress(40), 900)
        const t5 = setTimeout(() => setBarProgress(65), 1400)
        const t6 = setTimeout(() => setBarProgress(80), 2200)
        return () => [t1, t2, t3, t4, t5, t6].forEach(clearTimeout)
    }, [])

    // Exit when ready — onDone is an inline callback, adding it to deps would cause re-runs
    useEffect(() => {
        if (!ready) return
        // Snap bar to 100% then fade out
        setBarProgress(100)
        const t1 = setTimeout(() => setExiting(true), 300)
        const t2 = setTimeout(() => onDone?.(), 800)
        return () => [t1, t2].forEach(clearTimeout)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready])

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--splash-bg, #0f1117)',
                transition: exiting ? 'opacity 500ms ease' : 'none',
                opacity: exiting ? 0 : 1,
                pointerEvents: exiting ? 'none' : 'all',
            }}
        >
            {/*  Logo drop-in */}
            <div
                style={{
                    transform: logoVisible ? 'translateY(0)' : 'translateY(-18px)',
                    opacity: logoVisible ? 1 : 0,
                    transition:
                        'transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 320ms ease',
                    marginBottom: 16,
                }}
            >
                {/* Logo mark — full detailed logo for splash */}
                <div
                    style={{
                        width: 120,
                        height: 120,
                        borderRadius: 24,
                        background: 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)',
                        border: '1px solid rgba(148,163,184,0.12)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.3)',
                    }}
                >
                    <SqlNotebookLogo size={80} dark={true} />
                </div>
            </div>

            {/* Wordmark  */}
            <div
                style={{
                    opacity: wordVisible ? 1 : 0,
                    transform: wordVisible ? 'translateY(0)' : 'translateY(6px)',
                    transition: 'opacity 360ms ease, transform 360ms ease',
                    marginBottom: 40,
                    textAlign: 'center',
                }}
            >
                <div
                    style={{
                        fontFamily: '"SF Mono", "Fira Code", "JetBrains Mono", monospace',
                        fontSize: 15,
                        fontWeight: 500,
                        letterSpacing: '0.12em',
                        color: '#94a3b8',
                        textTransform: 'uppercase',
                    }}
                >
                    sql-notebook
                </div>
                <div
                    style={{
                        fontFamily: 'system-ui, sans-serif',
                        fontSize: 11,
                        color: '#475569',
                        marginTop: 4,
                        letterSpacing: '0.04em',
                    }}
                >
                    Loading workspace…
                </div>
            </div>

            {/* Progress bar  */}
            <div
                style={{
                    opacity: wordVisible ? 1 : 0,
                    transition: 'opacity 300ms ease',
                    width: 200,
                }}
            >
                {/* Track */}
                <div
                    style={{
                        width: '100%',
                        height: 2,
                        background: 'rgba(148,163,184,0.12)',
                        borderRadius: 2,
                        overflow: 'hidden',
                    }}
                >
                    {/* Fill */}
                    <div
                        style={{
                            height: '100%',
                            width: `${barProgress}%`,
                            background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                            borderRadius: 2,
                            transition:
                                barProgress === 100
                                    ? 'width 280ms ease-in-out'
                                    : 'width 600ms cubic-bezier(0.4, 0, 0.2, 1)',
                            boxShadow: '0 0 8px rgba(96,165,250,0.6)',
                        }}
                    />
                </div>
            </div>
        </div>
    )
}

export default SplashScreen
