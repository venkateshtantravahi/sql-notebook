package io.sqlnotebook.federation;

import org.apache.calcite.config.NullCollation;
import org.apache.calcite.sql.SqlDialect;

/**
 * Minimal Calcite SQL dialect for DuckDB.
 *
 * DuckDB is close to standard SQL but uses double-quoted identifiers and
 * sorts NULLs high (NULLS LAST in ASC, NULLS FIRST in DESC — opposite of most
 * databases). This dialect ensures Calcite generates compatible pushdown SQL.
 *
 * Why UNKNOWN product type?
 *   Calcite's DatabaseProduct enum has no DUCKDB entry (as of 1.38).
 *   UNKNOWN is the correct fallback: it still enables Calcite to use our
 *   identifier quoting and null-collation settings.
 */
public class DuckDbSqlDialect extends SqlDialect {

    public static final SqlDialect DEFAULT = new DuckDbSqlDialect(
            EMPTY_CONTEXT
                    .withDatabaseProduct(DatabaseProduct.UNKNOWN)
                    .withIdentifierQuoteString("\"")
                    .withNullCollation(NullCollation.HIGH)
    );

    public DuckDbSqlDialect(Context context) {
        super(context);
    }

    /** DuckDB does not support CHAR SET clauses — suppress them in generated SQL. */
    @Override
    public boolean supportsCharSet() {
        return false;
    }
}
