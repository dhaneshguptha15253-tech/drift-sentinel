# Drift Sentinel

Drift Sentinel detects breaking schema changes and drift across API endpoints and client applications directly in your CI pipeline.

---

## Part 1: GitHub Actions CI Integration

Part 1 sets up the core GitHub Actions workflow foundation to post comments on pull requests.

### Workflow Overview (`.github/workflows/drift-sentinel.yml`)

The workflow file is configured at `.github/workflows/drift-sentinel.yml` and performs the following:

- **Triggers (`on.pull_request`)**:
  - `opened`: Runs when a new pull request is opened.
  - `synchronize`: Runs when new commits are pushed to an existing pull request branch.
  - `reopened`: Runs when a previously closed pull request is reopened.

- **Permissions**:
  - `contents: read`: Allows reading repository code.
  - `pull-requests: write`: Grants write access to the GitHub REST API to post comments on the pull request.

- **Job & Steps (`drift-sentinel-comment`)**:
  - Runs on `ubuntu-latest`.
  - Uses `actions/github-script@v7` to authenticate via the workflow's `GITHUB_TOKEN` and call the Octokit REST API:
    ```javascript
    await github.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: context.issue.number,
      body: message
    });
    ```
  - Posts a hardcoded verification comment confirming that the PR-commenting integration is functional before downstream analysis (shape comparison and usage maps) is introduced in subsequent parts.

---

## Testing Instructions

Follow these steps to test and verify the Part 1 workflow:

### 1. Prerequisites & Repository Settings
1. In your GitHub repository, navigate to **Settings** > **Actions** > **General**.
2. Under **Workflow permissions**, verify that workflows have read and write permissions (or that the default permissions allow the workflow's explicit `pull-requests: write` permission to operate).

### 2. Triggering the Workflow via Pull Request
1. **Push your branch to GitHub**:
   ```bash
   git add .github/workflows/drift-sentinel.yml README.md
   git commit -m "Add Part 1 Drift Sentinel workflow and documentation"
   git push origin <your-branch-name>
   ```
2. **Open a Pull Request**:
   - Navigate to the GitHub repository and open a pull request from `<your-branch-name>` targeting `main`.
   - The event type is `opened`.
3. **Verify the CI Run**:
   - Go to the **Actions** tab of the repository.
   - You should see the workflow run named **Drift Sentinel PR Comment** triggered by the pull request.
   - Click the run to view logs for the job `drift-sentinel-comment` and step `Post hardcoded test comment`.
4. **Verify the PR Comment**:
   - Return to the **Conversation** tab of the pull request.
   - Confirm that `github-actions[bot]` posted the following comment:
     > ## Drift Sentinel — CI test
     >
     > The GitHub Actions PR-comment integration is working.
     >
     > This is the Part 1 test comment. Shape comparison and usage-aware
     > breaking-change analysis will be added in the next stage.

### 3. Testing Additional Events
- **Synchronize (`synchronize`)**: Push a new commit to the open PR branch. Verify that the workflow re-runs and posts the test comment for the update.
- **Reopen (`reopened`)**: Close the pull request, then click **Reopen pull request**. Verify that the workflow triggers and posts the test comment.
