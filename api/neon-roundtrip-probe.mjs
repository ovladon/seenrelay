import process from 'node:process';
import { neon } from '@neondatabase/serverless';

function elapsedMs(start) { return performance.now() - start; }
function cpuMs(start) { const d = process.cpuUsage(start); return (d.user + d.system) / 1000; }

export default async function handler(request, response) {
  if (process.env.VERCEL_ENV === 'production') {
    response.statusCode = 404;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ error: 'NOT_FOUND' }));
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    response.statusCode = 500;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ error: 'DATABASE_URL_NOT_CONFIGURED' }));
    return;
  }

  const sql = neon(databaseUrl);
  await sql.query('SELECT 1 AS ok');

  const sequential = [];
  for (let i = 0; i < 8; i += 1) {
    const wallStart = performance.now();
    const cpuStart = process.cpuUsage();
    const rows = await sql.query('SELECT $1::int AS n', [i + 1]);
    sequential.push({
      elapsed_ms: elapsedMs(wallStart),
      cpu_ms: cpuMs(cpuStart),
      scalar_verified: Number(rows[0]?.n) === i + 1
    });
  }

  const batchWallStart = performance.now();
  const batchCpuStart = process.cpuUsage();
  const batchRows = await sql.query('SELECT generate_series(1, 8)::int AS n');
  const batch = {
    elapsed_ms: elapsedMs(batchWallStart),
    cpu_ms: cpuMs(batchCpuStart),
    row_count: batchRows.length,
    scalar_verified: batchRows.length === 8 && Number(batchRows[0]?.n) === 1 && Number(batchRows[7]?.n) === 8
  };

  const values = sequential.map((x) => x.elapsed_ms);
  const cpuValues = sequential.map((x) => x.cpu_ms);
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

  response.statusCode = 200;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.end(JSON.stringify({
    schema: 'seenrelay-neon-roundtrip-probe-v1',
    environment: process.env.VERCEL_ENV || 'unknown',
    vercel_region: process.env.VERCEL_REGION || 'unknown',
    sequential_count: sequential.length,
    sequential_elapsed_ms: values,
    sequential_cpu_ms: cpuValues,
    sequential_elapsed_mean_ms: mean(values),
    sequential_cpu_mean_ms: mean(cpuValues),
    batch,
    raw_database_url_emitted: false
  }));
}
