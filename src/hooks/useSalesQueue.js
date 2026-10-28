import { useEffect, useState } from 'react';
import { fetchAggregate, queryKey, subscribeInvalidation } from '../data/query';
import { normalizeSearch, searchState } from '../data/search';
import { indiaDay, untilIndiaMidnight } from '../data/salesQueues';

export function useIndiaDay() {
  const [today, setToday] = useState(() => indiaDay());
  useEffect(() => {
    let timer;
    const update = () => { setToday(indiaDay()); clearTimeout(timer); timer = setTimeout(update, untilIndiaMidnight() + 50); };
    update(); window.addEventListener('focus', update); document.addEventListener('visibilitychange', update);
    return () => { clearTimeout(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); };
  }, []);
  return today;
}
// Counts are separate from sums: a legacy missing numeric field must not drop a
// record from a count. Search and scope changes hide old totals immediately.
export function useQueueTotals(db, collectionName, plans, search = '') {
  const key = queryKey({ plans, search }), term = normalizeSearch(search);
  const [version, refresh] = useState(0), [state, setState] = useState({ key: null, db: null, data: null, error: null });
  useEffect(() => subscribeInvalidation(db, names => {
    if (!names || names.includes(collectionName) || names.includes('appSettings')) refresh(n => n + 1);
  }), [db, collectionName]);
  useEffect(() => {
    let active = true;
    setState({ key, db, version, data: null, error: null });
    if (!db || searchState(search) === 'short') return undefined;
    const load = async () => {
      try {
        const entries = await Promise.all(plans.map(async ({ name, filters, sums = {} }) => {
          const scoped = [...filters, ...(term ? [['searchTokens', 'array-contains', term]] : [])];
          const [count, amounts] = await Promise.all([
            fetchAggregate(db, collectionName, { filters: scoped, requireReady: true }),
            Object.keys(sums).length ? fetchAggregate(db, collectionName, { filters: scoped, aggregates: Object.fromEntries(Object.entries(sums).map(([label, field]) => [label, { op: 'sum', field }])), requireReady: true }) : Promise.resolve({}),
          ]);
          return [name, { ...count, ...amounts }];
        }));
        if (active) setState({ key, db, version, data: Object.fromEntries(entries), error: null });
      } catch (error) { if (active) setState({ key, db, version, data: null, error }); }
    };
    const timer = term ? setTimeout(load, 300) : null;
    if (!term) load();
    return () => { active = false; clearTimeout(timer); };
    // Canonical key includes all filters and sums.
  }, [db, collectionName, key, version]);
  return state.key === key && state.db === db && state.version === version ? state : { data: null, error: null };
}
