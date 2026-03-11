package io.sqlnotebook.util;

import java.nio.file.Path;
import java.util.Locale;

/**
 * Shared filesystem utility methods used across the application.
 */
public final class FileUtils {

    private FileUtils() {}

    /**
     * Extracts the lowercase file extension from a filename.
     * Returns an empty string if no extension is found.
     *
     * <p>Examples:
     * <pre>
     *   extension("sales.csv")        → "csv"
     *   extension("report.2024.xlsx") → "xlsx"
     *   extension("README")           → ""
     * </pre>
     *
     * @param filename the filename to inspect (not a full path)
     * @return the lowercase extension, or {@code ""} if none
     */
    public static String extension(String filename) {
        int dot = filename.lastIndexOf('.');
        return dot < 0 ? "" : filename.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    /**
     * Resolves {@code untrusted} relative to {@code baseDir} and verifies the resolved
     * path stays within {@code baseDir}, preventing path traversal attacks.
     *
     * @param baseDir   the trusted base directory
     * @param untrusted the user-supplied filename or relative path
     * @return the resolved, normalised absolute {@link Path}
     * @throws SecurityException if the resolved path escapes {@code baseDir}
     */
    public static Path resolveInBaseDir(Path baseDir, String untrusted) {
        Path base     = baseDir.normalize().toAbsolutePath();
        Path resolved = base.resolve(untrusted).normalize().toAbsolutePath();
        if (!resolved.startsWith(base)) {
            throw new SecurityException(
                    "Path traversal denied: '%s' escapes base directory".formatted(untrusted));
        }
        return resolved;
    }
}
