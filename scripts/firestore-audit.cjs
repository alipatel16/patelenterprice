#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const READS = new Set(['getDocs', 'getDocsFromServer', 'getDocsFromCache', 'onSnapshot', 'getDoc', 'getDocFromServer', 'getDocFromCache', 'getCountFromServer', 'getAggregateFromServer']);
const WRITES = new Set(['addDoc', 'updateDoc', 'setDoc', 'deleteDoc', 'writeBatch', 'runTransaction']);
function auditSource(code, filename) {
  const ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx'] });
  const sdk = new Map(), wrappers = new Map(), result = [];
  traverse(ast, { ImportDeclaration(p) {
    const source = p.node.source.value;
    for (const spec of p.node.specifiers) {
      const imported = spec.type === 'ImportDefaultSpecifier' ? (/usePagedCollection(?:\.js)?$/.test(source) ? 'usePagedCollection' : null) : spec.imported?.name;
      if (['fetchPage', 'fetchAdministrativePage', 'usePagedCollection'].includes(imported)) wrappers.set(spec.local.name, 'bounded-shared-query');
      if (imported === 'fetchAggregate') wrappers.set(spec.local.name, 'aggregate');
      if (['getKnownDocument', 'getKnownSnapshot'].includes(imported)) wrappers.set(spec.local.name, 'known-id');
    }
    if (p.node.source.value !== 'firebase/firestore') return;
    for (const spec of p.node.specifiers) if (spec.type === 'ImportSpecifier') sdk.set(spec.local.name, spec.imported.name);
  } });
  function hasLimit(node, scope, visited = new Set()) {
    if (!node || typeof node !== 'object') return false;
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && sdk.get(node.callee.name) === 'limit') return true;
    if (node.type === 'Identifier' && !visited.has(node.name)) {
      const binding = scope.getBinding(node.name), init = binding?.path?.node?.init;
      if (init) { const next = new Set(visited); next.add(node.name); if (hasLimit(init, binding.path.scope, next)) return true; }
    }
    return Object.entries(node).some(([key, value]) => !['loc', 'start', 'end', 'extra'].includes(key) &&
      (Array.isArray(value) ? value.some(item => hasLimit(item, scope, visited)) : value && typeof value === 'object' ? hasLimit(value, scope, visited) : false));
  }
  traverse(ast, { CallExpression(p) {
    if (p.node.callee.type !== 'Identifier') return;
    if (wrappers.has(p.node.callee.name)) {
      result.push({ file: filename, line: p.node.loc.start.line, api: p.node.callee.name, kind: 'read', disposition: wrappers.get(p.node.callee.name) });
      return;
    }
    const name = sdk.get(p.node.callee.name);
    if (!READS.has(name) && !WRITES.has(name)) return;
    let disposition;
    if (WRITES.has(name)) disposition = 'raw-write';
    else if (['getDoc', 'getDocFromServer', 'getDocFromCache'].includes(name)) disposition = 'known-id';
    else if (name.includes('Aggregate') || name.includes('Count')) disposition = 'aggregate';
    else if (hasLimit(p.node.arguments[0], p.scope)) disposition = 'bounded-page';
    else disposition = 'unbounded';
    // The shared builder appends limit(pageSize) to a dynamic constraints array;
    // its boundedness is covered by the query transport/regression suite.
    if (filename === 'src/data/query.js' && name === 'getDocs') disposition = 'bounded-shared-query';
    if (filename === 'src/data/writes.js' && name === 'runTransaction') disposition = 'atomic-source-adapter';
    result.push({ file: filename, line: p.node.loc.start.line, api: name, kind: WRITES.has(name) ? 'write' : 'read', disposition });
  }, ReferencedIdentifier(p) {
    const name = sdk.get(p.node.name);
    if ((!READS.has(name) && !WRITES.has(name)) || p.parentPath.isImportSpecifier()) return;
    if (p.parentPath.isCallExpression() && p.parent.callee === p.node) return;
    let disposition = WRITES.has(name) ? 'raw-write' : name.startsWith('getDoc') && !name.startsWith('getDocs') ? 'known-id' : 'unbounded';
    if (filename === 'src/data/writes.js' && name === 'runTransaction') disposition = 'atomic-source-adapter';
    if (filename === 'src/data/reportJobs.js' && name === 'runTransaction') disposition = 'explicit-atomic-report-job';
    if (!result.some(row => row.line === p.node.loc.start.line && row.api === name)) result.push({ file: filename,
      line: p.node.loc.start.line, api: name, via: 'driver', kind: WRITES.has(name) ? 'write' : 'read', disposition });
  } });
  return result;
}
function auditTree(root) {
  const rows = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (/\.(js|jsx)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) rows.push(...auditSource(fs.readFileSync(filename, 'utf8'), path.relative(root, filename).split(path.sep).join('/')));
    }
  }
  visit(path.join(root, 'src'));
  return { rows, violations: rows.filter(row => ['unbounded', 'raw-write'].includes(row.disposition)) };
}
module.exports = { auditSource, auditTree };
if (require.main === module) {
  const result = auditTree(path.resolve(__dirname, '..'));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.violations.length) process.exitCode = 1;
}
