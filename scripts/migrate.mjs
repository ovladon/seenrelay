import fs from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const sql = neon(process.env.DATABASE_URL);
const migrationsUrl = new URL('../migrations/', import.meta.url);
const files = (await fs.readdir(migrationsUrl)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();

for (const file of files) {
  const migration = await fs.readFile(new URL(file, migrationsUrl), 'utf8');
  await sql.query(migration);
  console.log(`Migration ${file} applied.`);
}
