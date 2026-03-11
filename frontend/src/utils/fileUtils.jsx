import { TbFileTypeCsv, TbFileArrowRight, TbFileDatabase } from 'react-icons/tb'
import { BsFiletypeJson, BsFiletypeXlsx } from 'react-icons/bs'
import { LuFileJson } from 'react-icons/lu'
import { FaRegFileAlt, FaRegFolderOpen } from 'react-icons/fa'
import { SiApacheparquet } from 'react-icons/si'

/**
 * Returns a file-type icon element for a given filename based on its extension.
 * Falls back to a folder icon for unrecognised extensions.
 *
 * @param {string} filename
 * @returns {JSX.Element}
 */
export function getFileIcon(filename) {
    const ext = filename?.split('.').pop()?.toLowerCase()
    const icons = {
        csv: <TbFileTypeCsv className="text-green-600 dark:text-green-400" />,
        tsv: <FaRegFileAlt className="text-gray-500 dark:text-gray-400" />,
        json: <BsFiletypeJson className="text-yellow-600 dark:text-yellow-400" />,
        ndjson: <LuFileJson className="text-yellow-600 dark:text-yellow-400" />,
        parquet: <SiApacheparquet className="text-purple-600 dark:text-purple-400" />,
        arrow: <TbFileArrowRight className="text-orange-500 dark:text-orange-400" />,
        xlsx: <BsFiletypeXlsx className="text-emerald-600 dark:text-emerald-400" />,
        xls: <BsFiletypeXlsx className="text-emerald-600 dark:text-emerald-400" />,
        db: <TbFileDatabase className="text-blue-600 dark:text-blue-400" />,
    }
    return icons[ext] ?? <FaRegFolderOpen className="text-gray-500 dark:text-gray-400" />
}

/**
 * Formats a byte count to a human-readable string (B, KB, or MB).
 * Returns an empty string for null/undefined inputs.
 *
 * @param {number|null|undefined} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
    if (bytes == null) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
