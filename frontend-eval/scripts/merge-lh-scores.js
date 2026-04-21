#!/usr/bin/env node
/**
 * merge-lh-scores.js
 *
 * Reads frontend-results.json (written by score-reporter.ts) and
 * lh-scores.json (written by the lhci step in action.yml), then:
 *  1. Injects Lighthouse-based criteria into Trial IX
 *  2. Evaluates and updates the Lighthouse Sentinel boss entry
 *  3. Recalculates summary totals
 *  4. Overwrites frontend-results.json
 *
 * Usage:
 *   node merge-lh-scores.js <frontend-results.json> <lh-scores.json>
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const LH_A11Y_THRESHOLD = 80;
const LH_PERF_THRESHOLD = 70;
const SENTINEL_THRESHOLD = 90;

const LH_A11Y_PTS = 4;
const LH_PERF_PTS = 3;
const SENTINEL_PTS = 10;

function main() {
  const [, , resultsPath, lhPath] = process.argv;

  if (!resultsPath || !lhPath) {
    console.error(
      'Usage: merge-lh-scores.js <frontend-results.json> <lh-scores.json>',
    );
    process.exit(1);
  }

  const absResults = path.resolve(resultsPath);
  const absLh = path.resolve(lhPath);

  if (!fs.existsSync(absResults)) {
    console.error(`frontend-results.json not found: ${absResults}`);
    process.exit(1);
  }

  if (!fs.existsSync(absLh)) {
    console.warn(`lh-scores.json not found: ${absLh} — skipping Lighthouse merge`);
    process.exit(0);
  }

  const results = JSON.parse(fs.readFileSync(absResults, 'utf-8'));
  const lhScores = JSON.parse(fs.readFileSync(absLh, 'utf-8'));

  const accessibility = Number(lhScores.accessibility ?? 0);
  const performance = Number(lhScores.performance ?? 0);

  // ── Inject Lighthouse criteria into Trial IX ──────────────────────────────
  const ixTrial = results.trials.find((t) => t.trial === 'IX');
  if (!ixTrial) {
    console.warn('Trial IX not found in results — skipping Lighthouse merge');
    process.exit(0);
  }

  const a11yPassed = accessibility >= LH_A11Y_THRESHOLD;
  const perfPassed = performance >= LH_PERF_THRESHOLD;

  ixTrial.criteria.push(
    {
      name: 'lighthouse_accessibility',
      points: a11yPassed ? LH_A11Y_PTS : 0,
      maxPoints: LH_A11Y_PTS,
      passed: a11yPassed,
      message: a11yPassed
        ? ''
        : `accessibility score ${accessibility} < ${LH_A11Y_THRESHOLD}`,
    },
    {
      name: 'lighthouse_performance',
      points: perfPassed ? LH_PERF_PTS : 0,
      maxPoints: LH_PERF_PTS,
      passed: perfPassed,
      message: perfPassed
        ? ''
        : `performance score ${performance} < ${LH_PERF_THRESHOLD}`,
    },
  );

  // Recalculate Trial IX score
  ixTrial.score = ixTrial.criteria.reduce((s, c) => s + c.points, 0);

  // ── Boss: The Lighthouse Sentinel ─────────────────────────────────────────
  const sentinelPassed = performance >= SENTINEL_THRESHOLD;
  results.boss = {
    name: 'The Lighthouse Sentinel',
    points: sentinelPassed ? SENTINEL_PTS : 0,
    maxPoints: SENTINEL_PTS,
    passed: sentinelPassed,
    detail: `performance=${performance} (need ${SENTINEL_THRESHOLD}+) | accessibility=${accessibility}`,
  };

  // ── Recalculate summary ───────────────────────────────────────────────────
  const total = results.trials.reduce((s, t) => s + t.score, 0);
  const maxTotal = results.trials.reduce((s, t) => s + t.maxScore, 0);
  const bonus = sentinelPassed ? SENTINEL_PTS : 0;

  results.summary = {
    total,
    maxTotal,
    bonus,
    grandTotal: total + bonus,
    maxGrandTotal: maxTotal + SENTINEL_PTS,
  };

  fs.writeFileSync(absResults, JSON.stringify(results, null, 2), 'utf-8');
  console.log(
    `[merge-lh] a11y=${accessibility} perf=${performance} → IX score=${ixTrial.score}/${ixTrial.maxScore}, sentinel=${sentinelPassed}`,
  );
}

main();
