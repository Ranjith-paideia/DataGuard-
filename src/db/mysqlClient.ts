import 'dotenv/config';
import mysql, { Pool, PoolOptions, RowDataPacket, ResultSetHeader } from 'mysql2/promise';

let pool: Pool | null = null;

/**
 * Returns a singleton MySQL connection pool.
 * Uses decimalNumbers: true to prevent DECIMAL -> string coercion.
 */
export function getMySqlPool(): Pool {
  if (pool) {
    return pool;
  }

  const config: PoolOptions = {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER || 'dataguard_user',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'dataguard_test',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    decimalNumbers: true,
  };

  pool = mysql.createPool(config);
  return pool;
}

/**
 * Executes a parameterized MySQL query and returns rows.
 * Uses ? placeholders — never interpolates user variables directly into SQL.
 */
export async function executeMySqlQuery<T = any>(
  queryText: string,
  params?: unknown[]
): Promise<T[]> {
  const currentPool = getMySqlPool();
  const [rows] = await currentPool.query<RowDataPacket[]>(queryText, params as any);
  return rows as T[];
}

/**
 * Executes a MySQL INSERT/UPDATE/DELETE and returns the ResultSetHeader.
 */
export async function executeMySqlMutation(
  queryText: string,
  params?: unknown[]
): Promise<ResultSetHeader> {
  const currentPool = getMySqlPool();
  const [result] = await currentPool.query<ResultSetHeader>(queryText, params as any);
  return result;
}

/**
 * Gracefully closes the MySQL connection pool.
 */
export async function closeMySqlPool(): Promise<void> {
  if (pool) {
    try {
      await pool.end();
    } finally {
      pool = null;
    }
  }
}
