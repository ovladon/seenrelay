export const PREFERRED_PREDICATES = [
  'price.current',
  'availability.current',
  'status.current',
  'version.current',
  'score.current',
  'capacity.current'
] as const;

const preferred = new Set<string>(PREFERRED_PREDICATES);

export function isPreferredPredicate(predicate: string): boolean {
  return preferred.has(predicate);
}

export function predicateGuidance(predicate: string): string | undefined {
  if (isPreferredPredicate(predicate)) return undefined;
  return 'When no source-native locator or deterministic anchor exists, prefer a shared machine predicate. SeenRelay never performs semantic/fuzzy predicate matching.';
}
