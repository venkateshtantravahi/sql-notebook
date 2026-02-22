package io.sqlnotebook.connection;

/**
 * Runtime exception thrown when the ConnectionRegistry encounters an issue,
 * such as an invalid namespace or a database connectivity failure.
 */
public class ConnectionRegistryException extends RuntimeException {
    /**
     * Constructs an exception with a specific error message.
     */
    public ConnectionRegistryException(String message) {
        super(message);
    }

    /**
     * Constructs an exception with an error message and the underlying cause.
     * Useful for wrapping SQLException while preserving the original stack trace.
     */
    public ConnectionRegistryException(String message, Throwable cause) {
        super(message, cause);
    }
}
