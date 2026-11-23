import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import mysql from 'mysql2/promise';

async function main(): Promise<void> {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER || 'dataguard_user',
    password: process.env.MYSQL_PASSWORD || '',
    multipleStatements: true,
  });

  console.log('[setup-mysql] Connected to MySQL server.');

  const schemaPath = join(__dirname, '..', 'db', 'mysql', 'schema.sql');
  const seedPath = join(__dirname, '..', 'db', 'mysql', 'seed.sql');

  const schemaSql = readFileSync(schemaPath, 'utf-8');
  const seedSql = readFileSync(seedPath, 'utf-8');

  console.log('[setup-mysql] Applying schema...');
  await connection.query(schemaSql);

  console.log('[setup-mysql] Applying seed data...');
  await connection.query(seedSql);

  console.log('[setup-mysql] MySQL setup complete.');
  await connection.end();
}

main().catch((err) => {
  console.error('[setup-mysql] Setup failed:', err);
  process.exit(1);
});
