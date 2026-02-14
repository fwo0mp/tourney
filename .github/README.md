# GitHub Checks

The workflow at `/Users/brendon/.codex/worktrees/13e2/tourney/.github/workflows/e2e-pr.yml`
runs Playwright E2E tests for every pull request.

To enforce "no merge unless tests pass", set branch protection on your target branch
(for example `main`) and mark this status check as required:

- `Playwright E2E`
