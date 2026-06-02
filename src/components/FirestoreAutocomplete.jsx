// src/components/FirestoreAutocomplete.jsx
//
// ─── ON-DEMAND SEARCH AUTOCOMPLETE ────────────────────────────────────────────
//
// A drop-in replacement for MUI <Autocomplete> that searches Firestore on
// every keystroke instead of loading the full collection on mount.
//
// HOW IT WORKS:
//   • Nothing is loaded on mount — 0 reads at form open.
//   • User types 2+ chars → debounced 300 ms → Firestore prefix query fires.
//   • Results (≤15 docs) are cached per search term for the browser session.
//   • Name search   : where('nameLower', '>=', lower), where('nameLower', '<=', lower + '\uf8ff')
//   • Phone search  : where('phone', '>=', term)  (auto-detected if input starts with a digit)
//   • Both run in parallel; results are merged + deduped.
//   • If `value` is pre-set (edit mode), it appears in the list immediately.
//
// REQUIREMENTS:
//   • Documents must have a `nameLower` field  (lowercase of 'name').
//   • Run the one-time migration from DataMigrationUtil.jsx for existing docs.
//   • All future saves must include:  nameLower: formData.name.toLowerCase()
//     (use the helper from normalizeDoc.js)
//
// USAGE:
//   // Customer autocomplete (drop-in for <Autocomplete options={customers} .../>)
//   <FirestoreAutocomplete
//     db={db}
//     collectionName="customers"
//     value={selectedCustomer}
//     onChange={(_, v) => setSelectedCustomer(v)}
//     label="Select Customer *"
//     isOptionEqualToValue={(a, b) => a.id === b.id}
//     renderOption={(props, o) => (
//       <Box component="li" {...props}>
//         <Typography variant="body2" fontWeight={600}>{o.name}</Typography>
//         <Typography variant="caption" color="text.secondary">{o.phone}</Typography>
//       </Box>
//     )}
//   />
//
//   // Product autocomplete
//   <FirestoreAutocomplete
//     db={db}
//     collectionName="products"
//     value={selectedProduct}
//     onChange={(_, v) => handleProductSelect(v)}
//     label="Product *"
//     noPhoneSearch       // products don't have phone numbers
//     renderOption={(props, p) => (
//       <Box component="li" {...props}>
//         <Typography variant="body2">{p.name}</Typography>
//         <Typography variant="caption" color="text.secondary">
//           ₹{p.price} · Stock: {inventory[p.id] || 0}
//         </Typography>
//       </Box>
//     )}
//   />
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Autocomplete, TextField, CircularProgress,
  Typography, Box, InputAdornment,
} from '@mui/material';
import { Search } from '@mui/icons-material';
import {
  collection, query, where, orderBy, limit, getDocs,
} from 'firebase/firestore';

// Module-level per-collection search cache: { 'customers': { 'ram': [...], 'john': [...] } }
const _searchCache = {};

const getCollectionCache = (collectionName) => {
  if (!_searchCache[collectionName]) _searchCache[collectionName] = {};
  return _searchCache[collectionName];
};

// ─── Main Component ────────────────────────────────────────────────────────────

const FirestoreAutocomplete = ({
  // ── Required ──
  db,
  collectionName,
  value,
  onChange,
  label,

  // ── Search config ──
  searchField    = 'nameLower',   // Firestore field for name prefix search
  phoneField     = 'phone',       // Firestore field for phone prefix search
  noPhoneSearch  = false,         // set true for collections without phone (e.g. products)
  minChars       = 2,
  maxResults     = 30,
  debounceMs     = 300,

  // ── MUI Autocomplete passthrough ──
  getOptionLabel,
  renderOption,
  isOptionEqualToValue = (a, b) => a.id === b.id,
  size              = 'small',
  fullWidth         = true,
  disabled          = false,
  error             = false,
  helperText,
  placeholder,
  sx,

  // ── Extra filters (array of Firestore where constraints) ──
  extraConstraints = [],
}) => {
  const [inputValue,   setInputValue]   = useState('');
  const [options,      setOptions]      = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [open,         setOpen]         = useState(false);
  const debounceTimer  = useRef(null);
  const activeQueryRef = useRef(0);       // cancel stale responses

  // ── Seed current value into options immediately (edit mode support) ────────
  useEffect(() => {
    if (value && !options.find(o => o.id === value.id)) {
      setOptions(prev => [value, ...prev.filter(o => o.id !== value.id)]);
    }
  }, [value]);

  // ── Firestore prefix search ────────────────────────────────────────────────
  const search = useCallback(async (raw) => {
    const term  = raw.trim();
    const lower = term.toLowerCase();

    if (term.length < minChars) {
      setOptions(value ? [value] : []);
      setLoading(false);
      return;
    }

    // Cache hit?
    const colCache = getCollectionCache(collectionName);
    if (colCache[lower]) {
      const cached = colCache[lower];
      // Always keep current value visible
      const merged = value && !cached.find(o => o.id === value.id)
        ? [value, ...cached]
        : cached;
      setOptions(merged);
      setLoading(false);
      return;
    }

    // Firestore query
    setLoading(true);
    const queryId = ++activeQueryRef.current;

    try {
      const isPhone = /^\d/.test(term);

      const buildQuery = (field, val) =>
        getDocs(query(
          collection(db, collectionName),
          ...extraConstraints,
          where(field, '>=', val),
          where(field, '<=', val + '\uf8ff'),
          orderBy(field),
          limit(maxResults),
        ));

      const queries = [buildQuery(searchField, lower)];
      if (!noPhoneSearch && isPhone) queries.push(buildQuery(phoneField, term));

      const snaps = await Promise.all(queries);

      // Bail if a newer query has already started
      if (queryId !== activeQueryRef.current) return;

      // Merge + deduplicate
      const seen    = new Set();
      const results = [];
      for (const snap of snaps) {
        for (const doc of snap.docs) {
          if (!seen.has(doc.id)) {
            seen.add(doc.id);
            results.push({ id: doc.id, ...doc.data() });
          }
        }
      }

      // Cache the result
      colCache[lower] = results;

      // Always keep current value visible even if it's not in results
      const final = value && !seen.has(value.id) ? [value, ...results] : results;
      setOptions(final);
    } catch (err) {
      console.error('[FirestoreAutocomplete] search error:', err);
    } finally {
      if (queryId === activeQueryRef.current) setLoading(false);
    }
  }, [db, collectionName, searchField, phoneField, noPhoneSearch, minChars, maxResults, value, extraConstraints]);

  // ── Debounce input changes ─────────────────────────────────────────────────
  const handleInputChange = useCallback((_, newInput, reason) => {
    setInputValue(newInput);
    if (reason === 'reset') return; // user selected an option — don't re-search

    clearTimeout(debounceTimer.current);
    if (newInput.trim().length < minChars) {
      setOptions(value ? [value] : []);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceTimer.current = setTimeout(() => search(newInput), debounceMs);
  }, [search, minChars, debounceMs, value]);

  // Cleanup debounce on unmount
  useEffect(() => () => clearTimeout(debounceTimer.current), []);

  // ── Render ─────────────────────────────────────────────────────────────────
  const defaultGetOptionLabel = useCallback(
    (o) => (o?.name ? `${o.name}${o.phone ? ` — ${o.phone}` : ''}` : ''),
    []
  );

  const defaultRenderOption = useCallback((props, o) => (
    <Box component="li" {...props} key={o.id}>
      <Box>
        <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.3 }}>
          {o.name}
        </Typography>
        {o.phone && (
          <Typography variant="caption" color="text.secondary">{o.phone}</Typography>
        )}
      </Box>
    </Box>
  ), []);

  const isTyping    = inputValue.trim().length >= minChars;
  const showHint    = open && !isTyping && !value;
  const noResults   = open && isTyping && !loading && options.length === 0;

  return (
    <Autocomplete
      fullWidth={fullWidth}
      size={size}
      disabled={disabled}
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      options={options}
      loading={loading}
      value={value}
      inputValue={inputValue}
      onInputChange={handleInputChange}
      onChange={onChange}
      getOptionLabel={getOptionLabel || defaultGetOptionLabel}
      renderOption={renderOption || defaultRenderOption}
      isOptionEqualToValue={isOptionEqualToValue}
      filterOptions={(x) => x}  // disable built-in filter — Firestore handles it
      noOptionsText={
        noResults
          ? 'No results found'
          : showHint
          ? `Type ${minChars}+ characters to search…`
          : 'Type to search…'
      }
      sx={sx}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          size={size}
          error={error}
          helperText={helperText}
          placeholder={placeholder || `Search ${collectionName}…`}
          InputProps={{
            ...params.InputProps,
            startAdornment: (
              <>
                <InputAdornment position="start">
                  <Search fontSize="small" color="disabled" />
                </InputAdornment>
                {params.InputProps.startAdornment}
              </>
            ),
            endAdornment: (
              <>
                {loading && <CircularProgress color="inherit" size={16} sx={{ mr: 0.5 }} />}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
};

export default FirestoreAutocomplete;

// ─── Cache management helpers (exported for use in save flows) ────────────────

/**
 * Invalidate the search cache for a specific collection.
 * Call after adding a new customer/product so the next search is fresh.
 *
 * @example
 *   // After addDoc(collection(db, 'customers'), ...):
 *   invalidateSearchCache('customers');
 */
export const invalidateSearchCache = (collectionName) => {
  _searchCache[collectionName] = {};
};