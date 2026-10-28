import { buildSearchTokens, withSearchFields, normalizeSearch, searchState } from './search';

test('indexes name word prefixes and national/international phone ends without middle substrings', () => {
  const tokens = buildSearchTokens('customers', { name: 'Ali Patel', phone: '+91 9876543210' });
  expect(tokens).toEqual(expect.arrayContaining(['pa', 'ali pa', '98', '9198', '3210']));
  expect(tokens).not.toContain('ate');
  expect(new Set(tokens).size).toBe(tokens.length);
});
test('normalizes Unicode and whitespace consistently and preserves display data', () => {
  expect(normalizeSearch('  ÉLODIe   Ｐatel ')).toBe('élodie patel');
  expect(buildSearchTokens('products', { name: 'Café Chair', maker: 'Acme', category: 'Office', hsnCode: '9401' })).toEqual(expect.arrayContaining(['ca', 'ch', 'ac', 'of', '94']));
  expect(withSearchFields('customers', { name: 'Élodie Patel' })).toMatchObject({ name: 'Élodie Patel', nameLower: 'élodie patel', searchTokens: expect.arrayContaining(['pa']) });
  expect(normalizeSearch('+91 (98765) 43210')).toBe('919876543210');
  expect(['', ' A ', 'अल'].map(searchState)).toEqual(['browse', 'short', 'search']);
});
test('rejects unsupported token growth rather than silently truncating search', () => {
  expect(() => buildSearchTokens('customers', { name: 'x'.repeat(10000) })).toThrow(/search|token|long/i);
});
