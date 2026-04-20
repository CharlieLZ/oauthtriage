# OAuthTriage

[![CI](https://github.com/CharlieLZ/oauthtriage/actions/workflows/ci.yml/badge.svg)](https://github.com/CharlieLZ/oauthtriage/actions/workflows/ci.yml)
[![Release](https://github.com/CharlieLZ/oauthtriage/actions/workflows/publish.yml/badge.svg)](https://github.com/CharlieLZ/oauthtriage/actions/workflows/publish.yml)

[中文说明](./README.zh-CN.md)

OAuthTriage is a local-first CLI for triaging risky third-party OAuth grants in Google Workspace.

It scans active users, lists their OAuth grants, enriches them with recent token activity when available, ranks risky grants first, and exports a CSV you can review before revoking access.

## Why local-first

Security tooling loses trust fast when it asks admins to paste powerful tokens into a hosted website.

OAuthTriage starts with a simpler and safer model:

- Run locally
- Keep the access token on the operator's machine
- Export a plain CSV
- Make revocation an explicit separate command

## What it uses

Required Google scopes:

```text
https://www.googleapis.com/auth/admin.directory.user.readonly
https://www.googleapis.com/auth/admin.directory.user.security
https://www.googleapis.com/auth/admin.reports.audit.readonly
```

The Reports scope is optional, but without it `last_activity_at` will often be blank.

## Install

Run directly with `npx`:

```bash
npx oauthtriage sample --out oauthtriage-sample.csv
```

Or install globally:

```bash
npm install -g oauthtriage
oauthtriage sample --out oauthtriage-sample.csv
```

## Scan a Workspace

```bash
GOOGLE_ACCESS_TOKEN="ya29..." npx oauthtriage scan --out oauthtriage.csv
```

Useful options:

```bash
GOOGLE_ACCESS_TOKEN="ya29..." npx oauthtriage scan --max-users 25 --out oauthtriage-test.csv
GOOGLE_ACCESS_TOKEN="ya29..." npx oauthtriage scan --no-audit --out oauthtriage.csv
```

Revoke one grant after review:

```bash
npx oauthtriage revoke \
  --token "ya29..." \
  --user founder@example.com \
  --client 1234567890-abc.apps.googleusercontent.com \
  --yes
```

## Run the local web UI

The Next.js app is included as a local-only companion UI.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Do not deploy the scanner UI as a public hosted service unless you are ready to do proper OAuth verification, secure token storage, audit logging, and customer-facing trust work.

## Output

The CSV is optimized for one job: deciding what to revoke first.

Important columns:

- `risk_level`, `risk_score`
- `action`
- `app_name`, `client_id`, `user_email`
- `sensitive_scopes`
- `last_activity_at`
- `revoke_command`

## Architecture

```text
Admin token
    -> local CLI / local UI
    -> Google Directory API (users + tokens)
    -> Reports API token activity
    -> risk scoring
    -> CSV
```

Core modules:

- `src/lib/scan-options.ts`: normalize and validate external inputs
- `src/lib/google-http.ts`: Google API request wrapper with bounded retries
- `src/lib/google.ts`: Workspace scan orchestration and audit enrichment
- `src/lib/risk.ts`: risk scoring heuristics
- `src/lib/csv.ts`: CSV serialization
- `cli/oauthtriage.ts`: CLI entrypoint

## Development

```bash
npm install
npm test
npm run build
```

Package dry-run:

```bash
npm pack --json --dry-run
```

## Release flow

This repository is set up for tag-based GitHub releases.

- Push a tag like `v0.1.0`
- GitHub Actions runs tests and builds the package
- The workflow creates a GitHub Release and attaches the npm tarball
- npm publish is prepared for trusted publishing when an npm account is connected

## Security model

Things this project intentionally does:

- Fail early on missing required input
- Bound retries for transient Google API failures
- Continue scanning without audit enrichment if the Reports API is unavailable
- Keep revoke as an explicit command instead of an automatic side effect

Things this project intentionally does not do:

- Host your token
- Auto-revoke grants
- Hide what scopes it needs
- Publish internal go-to-market or private ops notes in the public repo

## Notes on public publishing

This repo is safe to open-source only if you keep it free of:

- Real tokens
- Private customer data
- Local absolute paths that reveal personal environment details
- Internal-only pricing, outreach, or unpublished business notes

That content belongs outside the public repository.
