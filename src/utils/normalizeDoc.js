import { withSearchFields } from '../data/search';
export const normalizeCustomer = form => withSearchFields('customers', form);
export const normalizeProduct = form => withSearchFields('products', form);
export const normalizeDoc = (form, collectionName = 'documents') => withSearchFields(collectionName, form);
