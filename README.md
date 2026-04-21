# 42-Evaluator — Scoring Action

A GitHub Action that evaluates backend and frontend implementations
against the 42-Challenge specification. Scores 7 backend trials
(95 points) + 7 frontend trials (95 points) + two boss encounters
(+10 each).

## Usage

Add to your workflow:

```yaml
steps:
  - name: Start your services
    run: docker compose up -d

  - name: Evaluate
    uses: QTechGames/42-evaluator@master
    with:
      backend-url: 'http://localhost:3000'
      frontend-url: 'http://localhost:5173'
      team: 'my-team'
```

## Inputs

| Input            | Default                    | Description                        |
| ---              | ---                        | ---                                |
| `backend-url`    | `http://localhost:3000`    | URL of the backend to evaluate     |
| `frontend-url`   | `http://localhost:5173`    | URL of the frontend to evaluate    |
| `fe-enabled`     | `true`                     | Set to `false` to skip frontend    |
| `team`           | `anonymous`                | Team name for results              |
| `launch-secret`  | `default-secret-change-me` | HMAC secret for Trial VII          |
| `concurrency`    | `50`                       | Stress test goroutine count        |
| `rounds`         | `100`                      | Rounds per goroutine               |

## Outputs

### Backend

| Output         | Description                    |
| ---            | ---                            |
| `score`        | Base score achieved            |
| `max-score`    | Maximum possible base score    |
| `bonus`        | Bonus points achieved          |
| `grand-total`  | Grand total (base + bonus)     |
| `results-path` | Path to results.json artifact  |

### Frontend

| Output          | Description                         |
| ---             | ---                                 |
| `fe-score`      | Frontend base score achieved        |
| `fe-max-score`  | Maximum possible frontend score     |
| `fe-bonus`      | Frontend bonus points achieved      |
| `fe-grand-total`| Frontend grand total (base + bonus) |

## Backend Trials Scored

| Trial    | Name                           | Points | What it tests                                |
| ---      | ---                            | ---    | ---                                          |
| I        | The Awakening                  | 5      | Health check endpoint                        |
| II       | Catalog of Infinite Chaos      | 15     | Game listing, filtering, sorting, pagination |
| III      | Artifact Inspection            | 10     | Game detail endpoint                         |
| IV       | Launch Ritual                  | 15     | Game launch with mode validation             |
| V        | Normalization Gauntlet         | 15     | Multi-format provider data ingestion         |
| VI       | Vault of Infinite Transactions | 20     | Wallet, concurrency, idempotency             |
| VII      | Seal of Authentication         | 15     | HMAC-SHA256 signing and verification         |
| **Boss** | The Load Warden                | +10    | p95 < 200ms under 50 concurrent users        |

## Frontend Trials Scored

| Trial    | Name                           | Points | What it tests                                |
| ---      | ---                            | ---    | ---                                          |
| I        | The Awakening                  | 5      | App loads, title visible, no JS errors       |
| II       | Catalog of Infinite Chaos      | 15     | Game grid, search, category/provider filters |
| III      | Artifact Inspection            | 10     | Game detail view, back navigation, 404 state |
| IV       | Launch Ritual                  | 15     | Launch flow, mode selector, disabled games   |
| VIII     | State Management & Loading UX  | 20     | Loading states, error boundary, URL params   |
| IX       | Accessibility & Performance    | 15     | Lighthouse a11y ≥ 80, keyboard nav, perf ≥ 70|
| X        | The Wallet Dashboard           | 15     | Balance display, bet interaction, history    |
| **Boss** | The Lighthouse Sentinel        | +10    | Lighthouse performance ≥ 90                  |

## What Happens

1. Runs the evaluator binary against your backend URL
2. Runs Playwright tests against your frontend URL
3. Runs Lighthouse CI and merges scores into Trial IX
4. Scores each trial and writes `results.json` and `frontend-results.json`
5. Uploads results as GitHub artifacts
6. Posts a combined score summary as a PR comment

## Local Testing

```bash
# Backend only
./evaluator \
  -url http://localhost:3000 \
  -team my-team \
  -secret default-secret-change-me \
  -output results.json

# Frontend (from frontend-eval/)
cd frontend-eval
npm install
FRONTEND_URL=http://localhost:5173 npx playwright test
```

## Rebuilding

From the parent repository (QTechGames/42-challenge):

```bash
make evaluator-publish        # rebuilds evaluator binary
make frontend-eval-publish    # republishes Playwright tests
```
