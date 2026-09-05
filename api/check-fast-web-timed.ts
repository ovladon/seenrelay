import process from 'node:process';
import checkFast from './check-fast.js';

export default {
  async fetch(request: Request): Promise<Response> {
    const started = performance.now();
    const cpuStarted = process.cpuUsage();
    const response = await checkFast(request);
    const cpu = process.cpuUsage(cpuStarted);
    const cpuMs = Math.max(0.001, (cpu.user + cpu.system) / 1000);
    const appMs = Math.max(0.001, performance.now() - started);
    response.headers.set('server-timing', `app;dur=${appMs.toFixed(3)}, cpu;dur=${cpuMs.toFixed(3)}`);
    response.headers.set('x-seenrelay-lab-check-timing', 'v1');
    response.headers.set('x-seenrelay-lab-check-commit', process.env.VERCEL_GIT_COMMIT_SHA || 'unknown');
    return response;
  },
};
