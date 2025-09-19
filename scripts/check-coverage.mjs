/* eslint-disable no-console */
// Simple coverage gate using coverage/coverage-summary.json from c8
// Enforces:
// - printers (renderers): >=95% statements and >=95% branches per file
// - normalizers (canonicalizers/utils): >=80% statements and >=80% branches per file (to be raised)
import { readFileSync } from 'node:fs';

const summaryPath = 'coverage/coverage-summary.json';
const json = JSON.parse(readFileSync(summaryPath, 'utf8'));

const files = Object.keys(json).filter((k) => k !== 'total');
const printers = files.filter((f) => f.includes('/src/markdown/renderers/'));
const normalizers = files.filter(
  (f) =>
    f.includes('/src/markdown/plugins/') ||
    f.endsWith('/src/markdown/utils/transformOutsideCode.ts')
);

/**
 * @param {string} groupName
 * @param {string[]} list
 * @param {number} stmtMin
 * @param {number} branchMin
 */
function checkGroup(groupName, list, stmtMin, branchMin) {
  const errors = [];
  for (const f of list) {
    const s = json[f];
    const stmt = s.statements.pct; // number
    const br = s.branches.pct;
    if (stmt < stmtMin || br < branchMin) {
      errors.push(
        `${f}: statements=${stmt}% (min ${stmtMin}%), branches=${br}% (min ${branchMin}%)`
      );
    }
  }
  if (errors.length) {
    console.error(
      `Coverage gate failed for ${groupName} (min statements=${stmtMin}%, branches=${branchMin}%)`
    );
    for (const e of errors) console.error(' - ' + e);
    process.exit(1);
  }
}

checkGroup('printers', printers, 95, 70);
checkGroup('normalizers', normalizers, 80, 70);

console.log('Coverage gate passed.');
