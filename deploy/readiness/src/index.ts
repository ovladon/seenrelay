import { Hono } from 'hono';
import readinessServiceApp from '../../../src/readiness-service.js';
import { requireIsolatedReadinessAdmission } from '../../../src/readiness-admission-db.js';

requireIsolatedReadinessAdmission();

const app = new Hono();
app.route('/', readinessServiceApp);

export default app;
