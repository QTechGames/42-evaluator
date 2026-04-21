# 42-Evaluator — Backend Scoring Action

A GitHub Action that evaluates backend implementations
against the 42-Challenge specification. Scores 7 trials
(95 points) plus a stress-test boss encounter
(+10 bonus).

## Usage

Add to your workflow:

```yaml
steps:
  - name: Start your backend
    run: docker compose up -d

  - name: Evaluate
    uses: aasanchez/42-evaluator@master
    with:
      backend-url: 'http://localhost:3000'
      team: 'my-team'
```

## Inputs

| Input            | Default                    | Description                    |
| ---              | ---                        | ---                            |
| `backend-url`    | `http://localhost:3000`    | URL of the backend to evaluate |
| `team`           | `anonymous`                | Team name for results          |
| `launch-secret`  | `default-secret-change-me` | HMAC secret for Trial VII      |
| `concurrency`    | `50`                       | Stress test goroutine count    |
| `rounds`         | `100`                      | Rounds per goroutine           |

## Outputs

| Output         | Description                    |
| ---            | ---                            |
| `score`        | Base score achieved            |
| `max-score`    | Maximum possible base score    |
| `bonus`        | Bonus points achieved          |
| `grand-total`  | Grand total (base + bonus)     |
| `results-path` | Path to results.json artifact  |

## Trials Scored

| Trial    | Name                           | Points | What it tests                                    |
| ---      | ---                            | ---    | ---                                              |
| I        | The Awakening                  | 5      | Health check endpoint                            |
| II       | Catalog of Infinite Chaos      | 15     | Game listing, filtering, sorting, pagination     |
| III      | Artifact Inspection            | 10     | Game detail endpoint                             |
| IV       | Launch Ritual                  | 15     | Game launch with mode validation                 |
| V        | Normalization Gauntlet         | 15     | Multi-format provider data ingestion             |
| VI       | Vault of Infinite Transactions | 20     | Wallet, concurrency, idempotency                 |
| VII      | Seal of Authentication         | 15     | HMAC-SHA256 signing and verification             |
| **Boss** | The Load Warden                | +10    | p95 < 200ms under 50 concurrent users            |

## What Happens

1. Runs the evaluator binary against your backend URL
2. Scores each trial and writes `results.json`
3. Uploads results as a GitHub artifact
4. Posts a score summary as a PR comment
   (on pull requests)

## Local Testing

```bash
./evaluator \
  -url http://localhost:3000 \
  -team my-team \
  -secret default-secret-change-me \
  -output results.json
```

## Rebuilding

From the parent repository (aasanchez/42-challenge):

```bash
make evaluator-publish
```
