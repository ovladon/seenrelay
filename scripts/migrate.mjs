import fs from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

const adminUrl = process.env.DATABASE_ADMIN_URL?.trim();
if (!adminUrl) throw new Error('DATABASE_ADMIN_URL is required for migrations; runtime DATABASE_URL is intentionally not accepted.');
const sql = neon(adminUrl);
const migrationsUrl = new URL('../migrations/', import.meta.url);
const files = (await fs.readdir(migrationsUrl)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();

for (const file of files) {
  const migration = await fs.readFile(new URL(file, migrationsUrl), 'utf8');
  await sql.query(migration);
  console.log(`Migration ${file} applied.`);
}
