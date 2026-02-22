package io.sqlnotebook.executor;

/**
 * Thrown when the QueryExecutor encounters a lifecycle issue (e.g., thread pool failure).
 * Note: Individual SQL errors are captured within QueryResult rather than throwing this exception.
 */
public class QueryExecutorException extends RuntimeException {
    public QueryExecutorException(String message) {
        super(message);
    }

    public QueryExecutorException(String message, Throwable cause) {
        super(message, cause);
    }
}
