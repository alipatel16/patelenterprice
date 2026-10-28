import { fetchPage } from '../../data/query';
import { employeeQuery } from './employeeData';
import { withSearchFields } from '../../data/search';
import { getDocs, getCountFromServer, getDoc } from 'firebase/firestore';

// Emulate only the Firestore boundary. Search/token generation and query
// construction below are the production code used by employee screens.
jest.mock('firebase/firestore', () => ({
  collection: (db, name) => ({ db, name }), doc: (db, name, id) => ({ db, name, id }),
  query: (ref, ...constraints) => ({ ...ref, constraints }), where: (...args) => ({ type: 'where', args }), orderBy: (...args) => ({ type: 'orderBy', args }), limit: n => ({ type: 'limit', n }), startAfter: value => ({ type: 'cursor', value }),
  getDocs: jest.fn(), getDoc: jest.fn(), getCountFromServer: jest.fn(), getAggregateFromServer: jest.fn(), count: () => ({}), sum: () => ({}),
}));
it('finds an employee after the first browse page and returns the full search count', async () => {
  const users = Array.from({ length: 37 }, (_, index) => ({ id: `u${String(index).padStart(2, '0')}`, ...withSearchFields('users', { name: index === 36 ? 'Zoya Faraway' : `Employee ${index}`, role: 'employee' }) }));
  const apply = request => {
    let rows = users;
    for (const constraint of request.constraints) {
      if (constraint.type === 'where') { const [key, op, value] = constraint.args; rows = rows.filter(row => op === 'array-contains' ? row[key].includes(value) : row[key] === value); }
      if (constraint.type === 'cursor') rows = rows.filter(row => row.id > constraint.value.id);
      if (constraint.type === 'limit') rows = rows.slice(0, constraint.n);
    }
    return rows;
  };
  getDoc.mockResolvedValue({ exists: () => true, data: () => ({ version: 2, readyCollections: ['users'] }) });
  getDocs.mockImplementation(async request => ({ docs: apply(request).map(row => ({ id: row.id, data: () => row })) }));
  getCountFromServer.mockImplementation(async request => ({ data: () => ({ count: apply(request).length }) }));
  const db = {};
  expect((await fetchPage(db, 'users', employeeQuery())).rows.map(row => row.id)).not.toContain('u36');
  const found = await fetchPage(db, 'users', employeeQuery('zoya'));
  expect(found.rows).toEqual([expect.objectContaining({ id: 'u36', name: 'Zoya Faraway' })]);
  expect(found.total).toBe(1);
});
