function clean(name: string): string {
  return (process.env[name] || '').trim();
}

function normalizeHttpsOrigin(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTPS origin.`);
  }
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.search
    || url.hash
    || (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw new Error(`${name} must be an absolute HTTPS origin with no credentials, path, query or fragment.`);
  }
  return url.origin;
}

export function configuredReadinessServiceOrigin(): string | null {
  const value = clean('READINESS_SERVICE_ORIGIN');
  return value ? normalizeHttpsOrigin(value, 'READINESS_SERVICE_ORIGIN') : null;
}

export function readinessAuditOrigin(presentationOrigin: string): string {
  return configuredReadinessServiceOrigin() || new URL(presentationOrigin).origin;
}

export function readinessUsesRemoteService(presentationOrigin: string): boolean {
  return readinessAuditOrigin(presentationOrigin) !== new URL(presentationOrigin).origin;
}

export function readinessV2EnabledForPresentation(localEnabled: boolean, presentationOrigin: string): boolean {
  if (!readinessUsesRemoteService(presentationOrigin)) return localEnabled;
  return clean('READINESS_REMOTE_V2_ENABLED') === 'true';
}

export function readinessConnectSrc(presentationOrigin: string): string {
  const local = new URL(presentationOrigin).origin;
  const audit = readinessAuditOrigin(presentationOrigin);
  return audit === local ? "'self'" : `'self' ${audit}`;
}

export function readinessRemoteEndpoint(presentationOrigin: string, path: '/readiness/audit' | '/readiness/audit/v2'): string | null {
  if (!readinessUsesRemoteService(presentationOrigin)) return null;
  return `${readinessAuditOrigin(presentationOrigin)}${path}`;
}
