package io.sqlnotebook.connection;

public class ConnectionRegistryException extends RuntimeException {
    public ConnectionRegistryException(String message) {
        super(message);
    }

    public ConnectionRegistryException(String message, Throwable cause) {
        super(message, cause);
    }
}
