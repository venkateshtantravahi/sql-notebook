
export const SqlNotebookLogo = ({ size = 80, dark = false }) => {
    const fg = dark ? "#F8FAFC" : "#111827";
    const accent = "#F59E0B";
    const accent2 = "#FBBF24";
    const subtle = dark
        ? "rgba(245,158,11,0.15)"
        : "rgba(245,158,11,0.08)";

    return (
        <svg
            viewBox="0 0 200 200"
            width={size}
            height={size}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-label="sql-notebook logo"
        >
            {/* Notebook body */}
            <rect x="45" y="35" width="110" height="130" rx="6" fill={subtle} stroke={fg} strokeWidth="3" />

            {/* Notebook rings */}
            {[55, 75, 95, 115, 135].map((y) => (
                <line key={y} x1="42" y1={y} x2="48" y2={y} stroke={fg} strokeWidth="3" strokeLinecap="round" />
            ))}

            {/* SQL keywords */}
            <text x="62" y="68" fontFamily="'JetBrains Mono','Fira Code',monospace" fontSize="11" fontWeight="600" fill={accent}>
                SELECT
            </text>
            <line x1="62" y1="80" x2="118" y2="80" stroke={fg} strokeWidth="2" opacity="0.25" strokeLinecap="round" />
            <text x="62" y="100" fontFamily="'JetBrains Mono','Fira Code',monospace" fontSize="11" fontWeight="600" fill={accent}>
                FROM
            </text>
            <line x1="62" y1="112" x2="130" y2="112" stroke={fg} strokeWidth="2" opacity="0.25" strokeLinecap="round" />

            {/* Run button */}
            <circle cx="140" cy="150" r="18" fill={accent} />
            <polygon points="135,142 135,158 149,150" fill={dark ? "#111" : "#FFF"} />

            {/* Sparkles */}
            <circle cx="160" cy="50" r="3" fill={accent2} />
            <circle cx="170" cy="65" r="2" fill={accent2} />
        </svg>
    );
};

export const SqlNotebookMark = ({ size = 20, dark = false }) => {
    const fg = dark ? "#F8FAFC" : "#111827";
    const accent = "#F59E0B";
    const subtle = dark
        ? "rgba(245,158,11,0.15)"
        : "rgba(245,158,11,0.08)";
    const sw = size <= 20 ? 8 : 6;

    return (
        <svg
            viewBox="0 0 100 100"
            width={size}
            height={size}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-label="sql-notebook"
        >
            {/* Notebook page */}
            <rect x="12" y="8" width="76" height="84" rx="8" fill={subtle} stroke={fg} strokeWidth={sw} />

            {/* Spine dots */}
            <circle cx="12" cy="35" r={size <= 20 ? 5 : 4} fill={accent} />
            <circle cx="12" cy="60" r={size <= 20 ? 5 : 4} fill={accent} />

            {/* Play triangle */}
            <polygon points="40,30 40,70 72,50" fill={accent} />
        </svg>
    );
};

// export default SqlNotebookLogo;