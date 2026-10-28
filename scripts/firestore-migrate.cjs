#!/usr/bin/env node
'use strict';
const SOURCE_COLLECTIONS = ['customers', 'products', 'inventory', 'purchases', 'sales', 'quotations', 'giftInvoices', 'giftSets', 'brandHierarchies', 'complaints', 'users', 'attendanceLogs', 'checklistInstances', 'checklistTemplates', 'salaryReports', 'settings', 'appSettings'];
const PROJECTS = ['patel-enterprise-prod', 'patelfurniture-prod'];
const VERSION = 2;
const budgetError = () => Object.assign(new Error('Migration paused before its request budget was exceeded.'), { code: 'migration/budget' });
function makeBudget(limits = {}) {
  for (const key of ['reads', 'writes']) if (!Number.isSafeInteger(limits[key]) || limits[key] < 0) throw Error('Explicit nonnegative read and write budgets are required');
  const used = { reads: 0, writes: 0 };
  return { limits, used, can(kind, amount) { return Number.isSafeInteger(amount) && amount >= 0 && used[kind] + amount <= limits[kind]; },
    consume(kind, amount) { if (!this.can(kind, amount)) throw budgetError(); used[kind] += amount; } };
}
function recordPlan(collection, id, data) {
  const { loadDataModule } = require('./data-module.cjs');
  const { withSearchFields } = loadDataModule('search');
  const { deriveSaleState, deriveComplaintState, buildEmiDueDocuments, buildReportContributions } = loadDataModule('projections');
  const { buildEmployeeSummaryChanges } = loadDataModule('employeeSummaries');
  const next = withSearchFields(collection, { ...data, ...(collection === 'sales' ? deriveSaleState(data) : {}),
    ...(collection === 'complaints' ? deriveComplaintState(data) : {}),
    _writeRevision: (data._writeRevision || 0) + 1, _projectionVersion: VERSION });
  const dues = collection === 'sales' ? buildEmiDueDocuments(id, next) : [];
  const reports = collection === 'sales' ? buildReportContributions(id, next) : [];
  const employees = buildEmployeeSummaryChanges(collection, id, null, next);
  const writes = 1 + dues.length + reports.length + employees.length + (reports.length ? 1 : 0);
  return { next, dues, reports, employees, writes, reads: 2 + reports.length + employees.length + (reports.length ? 1 : 0),
    issues: next.reconciliationIssues || next.complaintDateIssues || [] };
}
async function runMigration({ source, target, project = 'offline', collections = SOURCE_COLLECTIONS,
  checkpoint = null, budget: limits, apply = false, onCheckpoint = async () => {} }) {
  const mode = apply ? 'apply' : 'dry-run';
  if (!source?.readPage || (apply && !target?.backfill)) throw Error('Migration requires a bounded source and an apply target');
  if (!Array.isArray(collections) || new Set(collections).size !== collections.length || collections.some(c => !SOURCE_COLLECTIONS.includes(c))) throw Error('Unsupported migration collections');
  if (checkpoint && (checkpoint.version !== VERSION || checkpoint.project !== project || checkpoint.mode !== mode || JSON.stringify(checkpoint.collections) !== JSON.stringify(collections))) throw Error('Checkpoint does not match project, schema, collections or mode');
  const budget = makeBudget(limits);
  const state = checkpoint ? structuredClone(checkpoint) : { version: VERSION, project, mode, collections, collectionIndex: 0, cursor: null,
    processed: 0, proposedSourceWrites: 0, proposedWrites: 0, applied: 0, skipped: 0, errors: [], issues: [], readyCollections: [] };
  state.complete = false; state.reason = null;
  const save = async () => { state.usage = { ...budget.used }; await onCheckpoint(structuredClone(state)); };
  try {
    while (state.collectionIndex < collections.length) {
      const collection = collections[state.collectionIndex];
      // Reserve the query's maximum before requesting it, including empty-query cost.
      const pageSize = Math.min(15, budget.limits.reads - budget.used.reads);
      if (pageSize < 1) throw budgetError();
      budget.consume('reads', pageSize);
      const rows = await source.readPage(collection, state.cursor, pageSize);
      if (!Array.isArray(rows) || rows.length > pageSize) throw Error('Source violated bounded page contract');
      for (const row of rows) {
        try {
          if (collection === 'appSettings' && row.id === 'dataAccessV2') { state.skipped++; }
          else if (row.data?._projectionVersion === VERSION && row.data?.searchVersion === VERSION) { state.skipped++; }
          else {
            const plan = recordPlan(collection, row.id, row.data);
            if (apply) {
              if (!budget.can('writes', plan.writes) || !budget.can('reads', plan.reads)) throw budgetError();
              // The target reads CURRENT source in a fresh transaction; never applies backup data.
              const result = await target.backfill(collection, row.id, budget);
              if (result.applied) state.applied++; else state.skipped++;
            }
            state.proposedSourceWrites++; state.proposedWrites += plan.writes;
            if (plan.issues.length) state.issues.push({ collection, id: row.id, codes: plan.issues });
          }
        } catch (error) {
          if (error.code === 'migration/budget') throw error;
          state.errors.push({ collection, id: row.id, code: error.code || 'migration/invalid-source' });
        }
        state.cursor = row.id; state.processed++; await save();
      }
      if (rows.length < pageSize) {
        if (!state.errors.some(error => error.collection === collection)) state.readyCollections.push(collection);
        state.collectionIndex++; state.cursor = null; await save();
      }
    }
    state.complete = true;
    const dependencies = { sales: ['emiDues', 'reportProductPeriods', 'reportEmployeePeriods', 'reportJobRows'],
      attendanceLogs: ['attendanceMonths'], checklistInstances: ['checklistDays'] };
    state.readyCollections = [...new Set([...state.readyCollections,
      ...Object.entries(dependencies).flatMap(([sourceName, derived]) => state.readyCollections.includes(sourceName) ? derived : [])])];
  } catch (error) {
    if (error.code !== 'migration/budget') throw error;
    state.reason = 'budget';
  }
  await save(); return state;
}
module.exports = { SOURCE_COLLECTIONS, PROJECTS, VERSION, makeBudget, recordPlan, runMigration };
if (require.main === module) {
  require('./migration-cli.cjs').main(process.argv.slice(2)).catch(error => {
    // Never print headers, tokens or source records from SDK/HTTP errors.
    process.stderr.write(`Migration stopped: ${error.code || 'invalid-operation'}: ${error.safeMessage || 'Review the command, checkpoint and private diagnostic report.'}\n`);
    process.exitCode = 1;
  });
}
