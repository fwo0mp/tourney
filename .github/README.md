# GitHub Checks

The workflow at `.github/workflows/e2e-pr.yml`
runs Playwright E2E tests for every pull request.

To enforce "no merge unless tests pass", set branch protection on your target branch
(for example `main`) and mark this status check as required:

- `Playwright E2E`

## Pre-merge Cache Warming

`.github/workflows/warm-dependency-caches.yml`
supports warming dependency caches in `main` scope before merge.

Behavior:

1. It runs automatically for same-repo PRs targeting `main`.
2. It triggers only when dependency lock/config files changed:
   - `uv.lock`
   - `pyproject.toml`
   - `web/package-lock.json`
   - `web/package.json`
