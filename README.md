# Drift Sentinel

Drift Sentinel detects breaking schema changes and drift across API endpoints and client applications directly in your CI pipeline.

---

## Part 1: GitHub Actions CI Integration

Part 1 established the baseline GitHub Actions PR-commenting integration:
- Triggered on pull request events (`opened`, `synchronize`, `reopened`).
- Granted `contents: read` and `pull-requests: write` permissions.
- Verified GitHub REST API connectivity by posting an automated test comment using `actions/github-script@v7`.

---

## Part 2: End-to-End Service & Classifier Integration Pipeline

Part 2 completes the automated CI integration in `.github/workflows/drift-sentinel.yml`. It runs unit tests, starts services, verifies runtime behavior, computes flattened response shapes, evaluates drift against baseline shapes using the classifier, and posts dynamic PR comments.

### Workflow Pipeline Breakdown

1. **Repository Checkout & Environment Setup**:
   - Checks out the repository using `actions/checkout@v4`.
   - Sets up Node.js (v20) via `actions/setup-node@v4`.

2. **Dependency Installation**:
   - Runs `npm --prefix demo-api install` to install Demo API dependencies.
   - Runs `npm --prefix observer install` to install Observer service dependencies.

3. **Unit Test Suites**:
   - Runs `npm --prefix demo-api test` for Demo API route and payload tests.
   - Runs `npm --prefix observer test` for Observer storage and validation tests.
   - Runs `npm --prefix classifier test` for shape flattening, enum parsing, and classification logic tests.

4. **Background Service Startup**:
   - Launches Demo API: `nohup node demo-api/src/server.js > demo-api.log 2>&1 &` (port `4000`).
   - Launches Observer: `nohup node observer/src/server.js > observer.log 2>&1 &` (port `5001`).

5. **Readiness Probing & Service Availability**:
   - **Demo API Probe**: Polls `GET http://localhost:4000/users/1` every second with a 30-second timeout. Fails the workflow if Demo API does not become ready.
   - **Observer Probe**: Polls `GET http://localhost:5001/usage` every second with a 30-second timeout.
     - If ready: Sets `OBSERVER_AVAILABLE=true` in the environment.
     - If unavailable: Sets `OBSERVER_AVAILABLE=false` without failing immediately, allowing the pipeline to proceed to the fallback-capable classifier stage.

6. **Runtime Service Verification**:
   - **Observer-dependent checks (`if: env.OBSERVER_AVAILABLE == 'true'`)**:
     - Submits a sample tracking report (`client: web`, `version: 1`, endpoint `GET /users/:id`, paths `user_name` and `orders[].total`) via `POST http://localhost:5001/reports` and validates an HTTP `200` response.
     - Queries `GET http://localhost:5001/usage` and verifies via Node.js assertion that the reads were recorded.
     - *Note*: If Observer is unavailable, these two verification steps are skipped cleanly without failing the workflow.
   - **Demo API check**:
     - Queries `GET http://localhost:4000/users/1` and asserts that valid user data is returned. Always executes.

7. **Shape Extraction & Classifier Execution**:
   - **Baseline Shapes**: Reads `baseline-shapes.json` from the repository root (fails if missing).
   - **Live Response**: Fetches `GET http://localhost:4000/users/1` (fails if unreachable).
   - **Shape Flattening**: Invokes `flattenShape` from `classifier/src/index.js` to build the flattened shape map for `GET /users/:id`.
   - **Usage Map Resolution & Fallback**:
     - **Situation A (Observer available & populated)**: Uses the live populated usage map from `GET http://localhost:5001/usage`.
     - **Situation B (Observer unavailable or empty map)**:
       - If `usage.json` exists and contains a non-empty JSON object (rejecting `null`, primitives, arrays, and `{}`): Loads and uses `usage.json` as the usage map fallback.
       - If neither a populated live usage map nor a valid, non-empty `usage.json` fallback is available: Fails with a clear error (`Neither a populated live usage map nor a valid usage.json fallback is available` or fallback validation failure).
       - *Integrity*: Usage data is never fabricated, and empty fallbacks are rejected.
   - **Shape Comparison**: Invokes `compareShapes(baselineShapes, currentShapes, usageMap)` from `classifier/src/index.js` to compute check results per `docs/formats.md` Section 4.

8. **Dynamic PR Comment Generation**:
   - Formats the classifier output according to `docs/formats.md` Section 5:
     - First line: verdict summary (`BREAKING`, `WARN`, or `SAFE`).
     - One line per breaking change detailing endpoint, path, change type, and affected clients.
     - One line per warning (e.g. enum additions).
     - List of changes marked safe.
     - If no changes are detected, outputs confirmation that schemas match baseline shapes.
   - Safely passes output between steps by saving markdown to `$RUNNER_TEMP/drift-comment.md` and raw results to `$RUNNER_TEMP/drift-results.json` (also publishing to `$GITHUB_STEP_SUMMARY`).

9. **Dynamic PR Comment Posting**:
   - Uses `actions/github-script@v7` to read `$RUNNER_TEMP/drift-comment.md` and post it to the pull request via `github.rest.issues.createComment`.

---

### Observer Fallback & `usage.json` Handling

The pipeline handles Observer availability and fallbacks dynamically:
* **Situation A (Observer is available and populated)**:
  - Observer passes readiness on port 5001 (`OBSERVER_AVAILABLE=true`).
  - Report ingestion and `/usage` verification steps execute.
  - The classifier fetches and utilizes the live populated usage map from `http://localhost:5001/usage`.
* **Situation B (Observer is unavailable or returns an empty usage map)**:
  - Observer readiness probe marks `OBSERVER_AVAILABLE=false` without failing the workflow, or Observer returns an empty map (`{}`).
  - Observer-dependent tests (`POST /reports` and `GET /usage`) are skipped when Observer is unavailable.
  - The workflow proceeds to Demo API verification and the Classifier step.
  - **If `usage.json` fallback exists**: The classifier loads and validates `usage.json` (requiring a non-empty JSON object and rejecting `null`, primitives, arrays, or `{}`), using it to complete classification and dynamic PR commenting.
  - **If neither a populated live usage map nor a valid, non-empty `usage.json` fallback exists**: The classifier step halts with:
    `Neither a populated live usage map nor a valid usage.json fallback is available. Cannot proceed with classification.` (or an explicit validation error if `usage.json` contains an empty object or invalid structure).
    This prevents silent false-positives and ensures usage data is never fabricated.
  - **Fallback Fixture (`usage.json`)**: A static `usage.json` fallback fixture is included in the repository root containing the verified field reads for `client-web` v1 and v2 per `docs/formats.md`. When the Observer is unavailable or returns an empty usage map, the pipeline seamlessly falls back to this fixture to perform offline classification.

---

## Testing Instructions

### Local Unit Testing

To run the unit test suites locally across all services:

```bash
# Run Demo API tests
npm --prefix demo-api test

# Run Observer tests
npm --prefix observer test

# Run Classifier tests
npm --prefix classifier test
```

### Local Service Execution

```bash
# Start Demo API (port 4000)
node demo-api/src/server.js

# Start Observer service (port 5001)
node observer/src/server.js
```

### CI Testing via Pull Request

1. Stage and push your workflow and documentation changes:
   ```bash
   git add .github/workflows/drift-sentinel.yml README.md
   git commit -m "Complete Part 2 CI integration with classifier and dynamic PR comment"
   git push origin ci
   ```
2. Open or update a Pull Request targeting `main`.
3. Monitor the workflow execution under the repository's **Actions** tab.
4. Verify that:
   - All unit test suites pass (`demo-api`, `observer`, `classifier`).
   - Both services pass readiness probes.
   - Live shape extraction, baseline loading, and classification execute cleanly.
   - The dynamic Drift Sentinel comment appears in the Pull Request conversation thread.
