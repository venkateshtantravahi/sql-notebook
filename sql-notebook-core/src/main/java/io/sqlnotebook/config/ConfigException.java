package io.sqlnotebook.config;

/**
 * Custom runtime exception thrown when there is an error loading,
 * parsing, or validating the database configuration.
 */
public class ConfigException extends RuntimeException {
    /**
     * Constructs a new exception with a specific error message.
     * * @param message Descriptive error details.
     */
    public ConfigException(String message) {
        super(message);
    }
}
