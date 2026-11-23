import 'dotenv/config';
import sql from 'mssql';

let pool: sql.ConnectionPool | null = null;

/**
 * Returns a singleton connection pool to Microsoft SQL Server Express.
 * Strictly adheres to static TCP port connection rules without instanceName.
 */
export async function getPool(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) {
    return pool;
  }

  const port = parseInt(process.env.SQL_PORT || '1433', 10);
  const config: sql.config = {
    server: process.env.SQL_SERVER || 'localhost',
    port,
    user: process.env.SQL_USER || 'dataguard_user',
    password: process.env.SQL_PASSWORD || '',
    database: process.env.SQL_DATABASE || 'DataGuardTest',
    options: {
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };

  // Critical: Do NOT pass instanceName alongside port to avoid Tedious driver conflicts
  pool = await new sql.ConnectionPool(config).connect();
  return pool;
}

/**
 * Executes a parameterized SQL query and returns the recordset.
 * Never interpolates user variables directly into SQL text.
 */
export async function executeQuery<T = any>(
  queryText: string,
  params?: Record<string, unknown>
): Promise<T[]> {
  const currentPool = await getPool();
  const request = currentPool.request();

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'number') {
        if (Number.isInteger(value)) {
          request.input(key, sql.Int, value);
        } else {
          request.input(key, sql.Decimal(10, 2), value);
        }
      } else if (typeof value === 'string') {
        request.input(key, sql.NVarChar, value);
      } else if (typeof value === 'boolean') {
        request.input(key, sql.Bit, value);
      } else if (value instanceof Date) {
        request.input(key, sql.DateTime2, value);
      } else if (value === null || value === undefined) {
        request.input(key, sql.NVarChar, null);
      } else {
        request.input(key, value);
      }
    }
  }

  const result = await request.query<T>(queryText);
  return result.recordset || [];
}

/**
 * Gracefully closes the connection pool.
 * Essential for Playwright test workers to terminate cleanly without hanging.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    try {
      if (pool.connected) {
        await pool.close();
      }
    } finally {
      pool = null;
    }
  }
}

export { sql };
