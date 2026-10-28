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

it('indexes separately entered phone numbers without combining their digits or hiding the record', () => {
  const tokens = buildSearchTokens('customers', { name: 'Test Customer', phone: '9876543210 / 8765432109' });
  expect(tokens).toEqual(expect.arrayContaining(['98', '3210', '87', '2109']));
  expect(tokens).not.toContain('98765432108765432109');
  expect(buildSearchTokens('sales', { customerPhone: '9876543210-8765432109' })).toEqual(expect.arrayContaining(['98', '87', '2109']));
  expect(buildSearchTokens('customers', { phone: '+91-98765-43210' })).toEqual(expect.arrayContaining(['98', '3210']));
  expect(() => buildSearchTokens('customers', { phone: '12345678901234567890' })).toThrow(/phone length/);
});

it('finds an exchange item by any word prefix across the server result set', () => {
  expect(buildSearchTokens('sales', { exchangeItem: 'Wooden Dining Table' })).toEqual(expect.arrayContaining(['di', 'ta']));
});

it('indexes the quoteNumber field actually saved by CreateQuotation without rewriting it', () => {
  const source = { quoteNumber: 'QT-PE-2026-0042', customerName: 'Synthetic Customer' };
  const indexed = withSearchFields('quotations', source);
  expect(indexed.quoteNumber).toBe(source.quoteNumber);
  expect(indexed.searchTokens).toEqual(expect.arrayContaining(['qt-pe-2026-0042', 'qt-pe-2026-00']));
});
