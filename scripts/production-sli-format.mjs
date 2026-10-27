import fs from 'node:fs';

const report=JSON.parse(fs.readFileSync('production-sli-report.json','utf8'));
const mode=process.argv[2]||'summary';
if(mode==='summary'){
  console.log('# SeenRelay Production SLO Watch');
  console.log('');
  console.log(`Generated: ${report.generated_at}`);
  console.log(`SLO probe: **${report.slo_ok?'PASS':'BREACH'}**`);
  console.log(`CHECK p99: **${report.check_latency.p99_ms ?? 'missing'} ms** (objective <= ${report.objectives.check_p99_ms_max} ms)`);
  console.log(`Health success: **${(100*report.availability.health_success_fraction).toFixed(2)}%**`);
  console.log(`Service success: **${(100*report.availability.service_success_fraction).toFixed(2)}%**`);
  console.log(`CHECK success: **${(100*report.availability.check_success_fraction).toFixed(2)}%**`);
} else if(mode==='issue'){
  console.log([
    '# Production SLI breach',
    '',
    `Generated: ${report.generated_at}`,
    `CHECK p99: ${report.check_latency.p99_ms ?? 'missing'} ms (objective <= ${report.objectives.check_p99_ms_max} ms)`,
    `Health success: ${(100*report.availability.health_success_fraction).toFixed(2)}%`,
    `Service success: ${(100*report.availability.service_success_fraction).toFixed(2)}%`,
    `CHECK success: ${(100*report.availability.check_success_fraction).toFixed(2)}%`,
    '',
    'Breaches:',
    ...(report.breaches||[]).map((x)=>`- ${x}`),
    '',
    'This is synthetic first-party monitoring and is not external adoption evidence.'
  ].join('\n'));
} else {
  throw new Error('mode must be summary or issue');
}
