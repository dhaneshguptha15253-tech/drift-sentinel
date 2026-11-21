# Drift Sentinel

Drift Sentinel detects breaking schema changes and drift across API endpoints and client applications directly in your CI pipeline.

---

## Part 1: GitHub Actions CI Integration

Part 1 established the baseline GitHub Actions PR-commenting integration:
- Triggered on pull request events (`opened`, `synchronize`, `reopened`).
- Granted `contents: read` and `pull-requests: write` permissions.
- Verified GitHub REST API connectivity by posting an automated test comment using `actions/github-script@v7`.

---

## Part 2: Service Verification & Integration Pipeline

Part 2 incorporates automated service testing and live runtime integration verification for the **Demo API** and **Observer** services into the CI workflow (`.github/workflows/drift-sentinel.yml`).

### Workflow Steps Breakdown

1. **Repository Checkout & Environment Setup**:
   - Checks out the branch using `actions/checkout@v4`.
   - Sets up Node.js (v20) via `actions/setup-node@v4`.

2. **Dependency Installation**:
   - Runs `npm --prefix demo-api install` to install Demo API dependencies.
   - Runs `npm --prefix observer install` to install Observer service dependencies.

3. **Unit Test Suites**:
   - Runs `npm --prefix demo-api test` to validate Demo API endpoints, CORS preflights, and mock user generation.
   - Runs `npm --prefix observer test` to validate Observer storage, payload validation, report ingestion, and usage map serialization.

4. **Background Service Startup**:
   - Starts Demo API in the background: `nohup node demo-api/src/server.js > demo-api.log 2>&1 &` (default port: `4000`).
   - Starts Observer in the background: `nohup node observer/src/server.js > observer.log 2>&1 &` (default port: `5001`).

5. **Readiness Probing**:
   - **Demo API Probe**: Polls `GET http://localhost:4000/users/1` until an HTTP `200 OK` is returned, with a 30-second timeout.
   - **Observer Probe**: Polls `GET http://localhost:5001/usage` until an HTTP `200 OK` is returned, with a 30-second timeout.
   - If either service fails to start within the timeout window, process logs are dumped to the CI log and the workflow exits with a failure status.

6. **Live End-to-End Integration Verification**:
   - **Report Ingestion**: Submits a valid client tracking report (`client: web`, `version: 1`, endpoint `GET /users/:id`, paths `user_name` and `orders[].total`) via `POST http://localhost:5001/reports` and validates an HTTP `200` response.
   - **Usage Map Query**: Queries `GET http://localhost:5001/usage` and verifies via Node.js assertion that the submitted client tracking reads were correctly ingested and mapped.
   - **Demo API Query**: Queries `GET http://localhost:4000/users/1` and verifies that a valid user object is returned.

7. **PR Comment (Preserved from Part 1)**:
   - Posts the Part 1 confirmation comment using `actions/github-script@v7`.

---

## Part 3 Status & Pending Tasks: Classifier & Drift Analysis

### Classifier Engine Implementation (Companion PR #8)
The standalone classifier engine is implemented by our teammate in companion **PR #8** under `classifier/`:
- Compares baseline response shapes against current response shapes.
- Evaluates changes against the active usage map to classify schema drift as `breaking`, `warn`, or `safe` according to `docs/formats.md` Section 4.

### Pending Tasks for CI Integration
While the standalone classifier engine is implemented in PR #8, the CI integration is not yet complete. The following items remain pending:

1. **Baseline Fixture (`baseline-shapes.json`)**:
   - Documented flattened baseline response shapes (`docs/formats.md` Section 3) representing the established API contract before PR modifications.
2. **Classifier CI Integration**:
   - Integrating and invoking the classifier within the GitHub Actions workflow (`.github/workflows/drift-sentinel.yml`) once PR #8 is merged into `main`.
3. **Dynamic PR Comment Generation**:
   - Replacing the hardcoded test comment with dynamic analysis output detailing the verdict summary, breaking changes with affected clients/versions, and safe modifications (`docs/formats.md` Section 5).
4. **Usage Fallback (`usage.json`)**:
   - Offline fallback usage map fixture used when a live observer instance is not reachable.

---

## Testing Instructions

### Local Testing

To run the unit test suites and verify the services locally:

```bash
# Run unit tests
npm --prefix demo-api test
npm --prefix observer test

# Run Demo API locally
node demo-api/src/server.js

# Run Observer locally
node observer/src/server.js
```

### CI Testing via Pull Request

1. Push your branch changes to GitHub:
   ```bash
   git add .github/workflows/drift-sentinel.yml README.md
   git commit -m "Update CI workflow with Demo API and Observer integration"
   git push origin ci
   ```
2. Open or update a Pull Request targeting `main`.
3. In GitHub, go to the **Actions** tab to observe the run.
4. Confirm all steps execute successfully:
   - Dependency installations and unit test suites pass.
   - Services start and pass readiness probes within the timeout.
   - End-to-end report submission, `/usage` verification, and `/users/1` queries pass.
   - The test comment is posted to the Pull Request.
