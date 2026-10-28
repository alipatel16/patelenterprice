// Additive schema: display fields are never rewritten. Keep migration and writes
// on this same generator so readiness means all indexed records are searchable.
const TEXT_FIELDS = ['name', 'title', 'maker', 'category', 'hsnCode', 'email',
  'customerName', 'customerEmail', 'supplierName', 'invoiceNumber', 'quotationNumber', 'quoteNumber',
  'complaintNumber', 'invoiceNo', 'quotationNo', 'complaintNo', 'brand', 'brandName',
  'giftSetName', 'productName', 'employeeName', 'salespersonName', 'referenceNumber', 'exchangeItem'];
const PHONE_FIELDS = ['phone', 'customerPhone', 'supplierPhone', 'employeePhone'];
export const SEARCH_SCHEMA_VERSION = 2;
export const SEARCH_LIMITS = { fieldCharacters: 160, tokens: 2000, tokenBytes: 100000 };

export function normalizeSearch(raw) {
  const value = String(raw ?? '').normalize('NFKC').toLocaleLowerCase('en-IN').trim().replace(/\s+/gu, ' ');
  return /^\+?[\d\s().-]+$/u.test(value) ? value.replace(/\D/g, '') : value;
}
export function searchState(raw) {
  const length = Array.from(normalizeSearch(raw)).length;
  return length === 0 ? 'browse' : length < 2 ? 'short' : 'search';
}
export function buildSearchTokens(collectionName, data = {}) {
  const tokens = new Set();
  const add = text => {
    const chars = Array.from(text);
    if (chars.length > SEARCH_LIMITS.fieldCharacters) throw new Error(`Unsupported search field length in ${collectionName}`);
    for (let i = 2; i <= chars.length; i++) tokens.add(chars.slice(0, i).join(''));
  };
  for (const field of TEXT_FIELDS) {
    const text = normalizeSearch(data[field]);
    if (!text) continue;
    add(text);
    text.split(/[\s\p{P}]+/u).filter(Boolean).forEach(add);
  }
  for (const field of PHONE_FIELDS) {
    const raw = String(data[field] ?? '').normalize('NFKC');
    const combined = raw.replace(/\D/g, '');
    // Legacy forms allow several numbers in one field. A hyphen remains phone
    // formatting unless the combined value is too long to be one phone number.
    const numbers = combined.length > 15 ? raw.split(/[/\\|,;\-]+/u) : [raw];
    for (const number of numbers) {
      const digits = number.replace(/\D/g, '');
      if (!digits) continue;
      if (digits.length > 15) throw new Error(`Unsupported search phone length in ${collectionName}`);
      const forms = new Set([digits]);
      if (digits.length === 12 && digits.startsWith('91')) forms.add(digits.slice(2));
      if (digits.length === 10) forms.add(`91${digits}`);
      for (const form of forms) {
        add(form);
        for (let i = 2; i <= form.length; i++) tokens.add(form.slice(-i));
      }
    }
  }
  const result = [...tokens].sort();
  // UTF-8 has at most 4 bytes per Unicode code point; use a conservative bound.
  const bytes = result.reduce((n, token) => n + Array.from(token).length * 4, 0);
  if (result.length > SEARCH_LIMITS.tokens || bytes > SEARCH_LIMITS.tokenBytes) throw new Error(`Search token budget exceeded in ${collectionName}`);
  return result;
}
export function withSearchFields(collectionName, data = {}) {
  return { ...data, nameLower: normalizeSearch(data.name),
    ...(data.maker !== undefined ? { makerLower: normalizeSearch(data.maker) } : {}),
    searchTokens: buildSearchTokens(collectionName, data), searchVersion: SEARCH_SCHEMA_VERSION };
}
