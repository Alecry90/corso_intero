import { CATALOG_GROUPS } from './catalog-taxonomy.js';

export function sanitizeNavigationSignals(value) {
  const groupScores = {};
  for (const { id } of CATALOG_GROUPS) {
    const score = value?.groupScores?.[id];
    if (Number.isInteger(score) && score > 0 && score <= 1000) groupScores[id] = score;
  }
  const recentProductIds = [...new Set(Array.isArray(value?.recentProductIds)
    ? value.recentProductIds.filter(id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(id)) : [])].slice(0, 20);
  return { groupScores, recentProductIds };
}
