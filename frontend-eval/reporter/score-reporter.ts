/**
 * Custom Playwright reporter that aggregates test results into
 * frontend-results.json, mirroring the schema of the Go backend
 * evaluator's results.json.
 *
 * Each test must annotate itself with:
 *   testInfo.annotations.push({
 *     type: 'score',
 *     description: JSON.stringify({ trial, criterion, maxPts }),
 *   });
 *
 * Pass  → points = maxPts
 * Fail/Timeout/Skipped → points = 0
 */
import type {
  Reporter,
  TestCase,
  TestResult,
  FullResult,
} from '@playwright/test/reporter';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ── Types ──────────────────────────────────────────────────────────────────

interface ScoreAnnotation {
  trial: string;
  criterion: string;
  maxPts: number;
}

interface CriterionResult {
  name: string;
  points: number;
  maxPoints: number;
  passed: boolean;
  message: string;
}

interface TrialResult {
  trial: string;
  name: string;
  score: number;
  maxScore: number;
  criteria: CriterionResult[];
}

interface BossResult {
  name: string;
  points: number;
  maxPoints: number;
  passed: boolean;
  detail: string;
}

interface Summary {
  total: number;
  maxTotal: number;
  bonus: number;
  grandTotal: number;
  maxGrandTotal: number;
}

interface FrontendResults {
  evaluator: string;
  version: string;
  team: string;
  targetUrl: string;
  skipped: boolean;
  executedAt: string;
  completedAt: string;
  durationSeconds: number;
  summary: Summary;
  trials: TrialResult[];
  boss: BossResult;
}

// ── Trial registry ─────────────────────────────────────────────────────────
// Every trial is pre-registered so the output always contains all 7 entries
// even if a test file errors out entirely.

const TRIAL_NAMES: Record<string, string> = {
  'I(FE)': 'The Awakening',
  'II(FE)': 'Catalog of Infinite Chaos',
  'III(FE)': 'Artifact Inspection',
  'IV(FE)': 'Launch Ritual',
  VIII: 'State & Loading UX',
  IX: 'Accessibility & Performance',
  X: 'Wallet & Betting',
};

// Max scores per trial (Lighthouse-based criteria added by merge-lh-scores.js)
const TRIAL_MAX: Record<string, number> = {
  'I(FE)': 5,
  'II(FE)': 15,
  'III(FE)': 10,
  'IV(FE)': 15,
  VIII: 20,
  IX: 15, // 8 from Playwright + 7 injected by merge-lh-scores.js
  X: 15,
};

const TRIAL_ORDER = [
  'I(FE)',
  'II(FE)',
  'III(FE)',
  'IV(FE)',
  'VIII',
  'IX',
  'X',
];

// ── Reporter implementation ────────────────────────────────────────────────

class ScoreReporter implements Reporter {
  private readonly startTime: Date = new Date();
  private readonly criteria: Map<string, CriterionResult[]> = new Map();
  private testError = '';

  onTestEnd(test: TestCase, result: TestResult): void {
    const annotation = test.annotations.find((a) => a.type === 'score');
    if (!annotation?.description) return;

    let parsed: ScoreAnnotation;
    try {
      parsed = JSON.parse(annotation.description) as ScoreAnnotation;
    } catch {
      return;
    }

    const passed =
      result.status === 'passed' ||
      // Treat expected failures as passed (shouldn't occur in eval context)
      result.status === 'expected';

    const message =
      result.status === 'failed' || result.status === 'timedOut'
        ? this.extractMessage(result)
        : '';

    const criterion: CriterionResult = {
      name: parsed.criterion,
      points: passed ? parsed.maxPts : 0,
      maxPoints: parsed.maxPts,
      passed,
      message,
    };

    const trialCriteria = this.criteria.get(parsed.trial) ?? [];
    trialCriteria.push(criterion);
    this.criteria.set(parsed.trial, trialCriteria);
  }

  async onEnd(result: FullResult): Promise<void> {
    const completedAt = new Date();
    const durationSeconds =
      (completedAt.getTime() - this.startTime.getTime()) / 1000;

    const skipped = process.env['FRONTEND_AVAILABLE'] === 'false';

    const trials = TRIAL_ORDER.map((trialId): TrialResult => {
      const criteria = this.criteria.get(trialId) ?? [];
      const score = criteria.reduce((s, c) => s + c.points, 0);

      return {
        trial: trialId,
        name: TRIAL_NAMES[trialId] ?? trialId,
        score: skipped ? 0 : score,
        maxScore: TRIAL_MAX[trialId] ?? 0,
        criteria: skipped ? [] : criteria,
      };
    });

    const total = trials.reduce((s, t) => s + t.score, 0);
    const maxTotal = Object.values(TRIAL_MAX).reduce((s, v) => s + v, 0);

    const boss: BossResult = {
      name: 'The Lighthouse Sentinel',
      points: 0,
      maxPoints: 10,
      passed: false,
      // merge-lh-scores.js fills in the actual scores after lhci runs
      detail: skipped ? 'skipped — frontend not available' : 'pending lhci',
    };

    const output: FrontendResults = {
      evaluator: '42-challenge-frontend',
      version: '1.0.0',
      team: process.env['TEAM'] ?? 'anonymous',
      targetUrl: process.env['FRONTEND_URL'] ?? 'http://localhost:5173',
      skipped,
      executedAt: this.startTime.toISOString(),
      completedAt: completedAt.toISOString(),
      durationSeconds,
      summary: {
        total,
        maxTotal,
        bonus: 0,
        grandTotal: total,
        maxGrandTotal: maxTotal + 10,
      },
      trials,
      boss,
    };

    const outputPath = path.join(
      process.env['GITHUB_WORKSPACE'] ?? process.cwd(),
      'frontend-results.json',
    );

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

    const statusLine =
      result.status === 'passed'
        ? '✓ All frontend tests passed'
        : `Frontend eval complete: ${total}/${maxTotal} pts`;

    // eslint-disable-next-line no-console
    console.log(`\n[FE-EVAL] ${statusLine}`);
    // eslint-disable-next-line no-console
    console.log(`[FE-EVAL] Results written to ${outputPath}\n`);

    if (this.testError) {
      // eslint-disable-next-line no-console
      console.error(`[FE-EVAL] Errors: ${this.testError}`);
    }
  }

  private extractMessage(result: TestResult): string {
    for (const error of result.errors) {
      if (error.message) return error.message.split('\n')[0] ?? '';
    }

    return 'test failed';
  }
}

export default ScoreReporter;
