import readinessServiceApp from '../../../src/readiness-service.js';
import { requireIsolatedReadinessAdmission } from '../../../src/readiness-admission-db.js';

requireIsolatedReadinessAdmission();

export default readinessServiceApp;
