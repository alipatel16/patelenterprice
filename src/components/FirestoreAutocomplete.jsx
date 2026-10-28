import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Autocomplete, TextField, CircularProgress } from '@mui/material';
import { usePagedCollection } from '../hooks/usePagedCollection';
import { searchState } from '../data/search';
import { invalidateCollections, invalidateLegacyCollections } from '../data/query';

/** Shared indexed search: 2 normalized characters, 300ms debounce, 15 options.
 * extraConstraints is retained as an alias for serializable filter triples.
 * Legacy per-field/minChars/debounce overrides are intentionally superseded by
 * the universal contract; selected edit values remain visible without reads.
 */
export default function FirestoreAutocomplete({ db, collectionName, value, onChange, label,
  maxResults = 15, extraConstraints = [], filters = extraConstraints, sort = [['nameLower', 'asc']],
  getOptionLabel = option => option?.name ? `${option.name}${option.phone ? ` — ${option.phone}` : ''}` : '',
  renderOption, isOptionEqualToValue = (a, b) => a.id === b.id, size = 'small', fullWidth = true,
  disabled = false, error = false, helperText, placeholder, sx, onOptionsChange }) {
  const [inputValue, setInputValue] = useState('');
  const [search, setSearch] = useState('');
  const cap = Math.min(15, Math.max(1, Number(maxResults) || 15));
  const result = usePagedCollection(searchState(search) === 'search' ? db : null, collectionName,
    { search, filters, sort, pageSize: cap, includeTotal: false });
  const options = useMemo(() => {
    const rows = result.rows.filter(row => row.id !== value?.id);
    return (value ? [value, ...rows] : rows).slice(0, cap);
  }, [result.rows, value, cap]);
  const notify = useRef(onOptionsChange); notify.current = onOptionsChange;
  useEffect(() => { notify.current?.(options); }, [options]);
  return <Autocomplete fullWidth={fullWidth} size={size} disabled={disabled} sx={sx}
    options={options} value={value || null} inputValue={inputValue} onChange={onChange}
    onInputChange={(_, text, reason) => {
      setInputValue(text);
      if (reason !== 'reset') setSearch(text);
    }} loading={result.loading} getOptionLabel={getOptionLabel} renderOption={renderOption}
    isOptionEqualToValue={isOptionEqualToValue} filterOptions={rows => rows}
    noOptionsText={result.error?.message || (searchState(search) === 'search' ? 'No results found' : 'Type 2+ characters to search…')}
    renderInput={params => <TextField {...params} label={label} size={size}
      error={error || !!result.error} helperText={result.error?.message || helperText}
      placeholder={placeholder || `Search ${collectionName}…`}
      InputProps={{ ...params.InputProps, endAdornment: <>{result.loading && <CircularProgress size={16} />}{params.InputProps.endAdornment}</> }} />}
  />;
}
export function invalidateSearchCache(collectionName, db) {
  if (db) invalidateCollections(db, [collectionName]);
  else invalidateLegacyCollections([collectionName]);
}
