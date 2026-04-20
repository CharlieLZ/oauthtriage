#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { scanWorkspace, revokeGrant, type TriageRow } from '../src/lib/google';
import { toCsv } from '../src/lib/csv';
import { normalizeRevokeOptions, normalizeScanOptions } from '../src/lib/scan-options';

function usage(): void {
  console.log(`OAuthTriage MVP

Commands:
  scan      Scan Google Workspace OAuth grants and write CSV
  sample    Write a sample CSV so you can see the output format
  revoke    Revoke one user's grant for one OAuth client

Examples:
  GOOGLE_ACCESS_TOKEN="ya29..." npm run scan -- --out oauthtriage.csv
  npm run scan -- --token "ya29..." --max-users 25 --out oauthtriage.csv
  npm run cli -- revoke --token "ya29..." --user admin@example.com --client 123.apps.googleusercontent.com --yes

Options:
  --token <access_token>     Short-lived Google Workspace admin access token
  --out <file.csv>           Output CSV path, default oauthtriage-YYYY-MM-DD.csv
  --max-users <n>            Limit users for testing
  --concurrency <n>          Parallel user scans, default 4
  --audit-days <n>           Token audit lookback, max 180, default 180
  --no-audit                 Skip Reports API audit events
  --customer <id>            Workspace customer ID, default my_customer
  --yes                      Required for revoke
`);
}

type ArgMap = Record<string, string | boolean>;

function parseArgs(argv: string[]): { command: string; args: ArgMap } {
  const [maybeCommand, ...rest] = argv;
  const command = maybeCommand && !maybeCommand.startsWith('--') ? maybeCommand : 'scan';
  const tokens = command === maybeCommand ? rest : argv;
  const args: ArgMap = {};

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = tokens[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }

  return { command, args };
}

function str(args: ArgMap, key: string, fallback = ''): string {
  const value = args[key];
  return typeof value === 'string' ? value : fallback;
}

function num(args: ArgMap, key: string, fallback: number): number {
  const value = Number(args[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function sampleRows(): TriageRow[] {
  return [
    {
      risk_level: 'critical',
      risk_score: 96,
      action: 'revoke_or_allowlist',
      app_name: 'Forgotten AI Meeting Bot',
      client_id: '1234567890-abc.apps.googleusercontent.com',
      user_email: 'founder@example.com',
      user_id: '100000000001',
      scope_count: 4,
      sensitive_scope_count: 2,
      sensitive_scopes: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/drive.readonly',
      all_scopes: 'openid email profile https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/drive.readonly',
      anonymous_client: false,
      native_app: false,
      last_activity_at: '',
      authorized_at: '2024-08-01T09:00:00Z',
      last_event_at: '2024-08-01T09:00:00Z',
      last_api: '',
      last_method: '',
      product_bucket: '',
      reasons: 'critical scopes: 2; AI/automation-like app name; no activity seen in audit window; old grant',
      revoke_command: 'oauthtriage revoke --user founder@example.com --client 1234567890-abc.apps.googleusercontent.com'
    },
    {
      risk_level: 'medium',
      risk_score: 43,
      action: 'verify_owner_and_need',
      app_name: 'Zapier',
      client_id: '999999999999-zapier.apps.googleusercontent.com',
      user_email: 'ops@example.com',
      user_id: '100000000002',
      scope_count: 3,
      sensitive_scope_count: 1,
      sensitive_scopes: 'https://www.googleapis.com/auth/spreadsheets',
      all_scopes: 'openid email https://www.googleapis.com/auth/spreadsheets',
      anonymous_client: false,
      native_app: false,
      last_activity_at: '2026-04-18T13:00:00Z',
      authorized_at: '2026-01-20T13:00:00Z',
      last_event_at: '2026-04-18T13:00:00Z',
      last_api: 'sheets.googleapis.com',
      last_method: 'spreadsheets.values.get',
      product_bucket: 'OTHER',
      reasons: 'high scopes: 1; AI/automation-like app name; recently active',
      revoke_command: 'oauthtriage revoke --user ops@example.com --client 999999999999-zapier.apps.googleusercontent.com'
    }
  ];
}

async function main(): Promise<void> {
  const { command, args } = parseArgs(process.argv.slice(2));

  if (args.help || args.h || command === 'help') {
    usage();
    return;
  }

  if (command === 'sample') {
    const out = str(args, 'out', 'samples/oauthtriage-sample.csv');
    writeFileSync(out, toCsv(sampleRows()));
    console.log(`Wrote ${out}`);
    return;
  }

  if (command === 'revoke') {
    if (args.yes !== true) {
      console.error('Revoke requires --yes.');
      process.exit(1);
    }
    const revokeOptions = normalizeRevokeOptions({
      accessToken: str(args, 'token', process.env.GOOGLE_ACCESS_TOKEN || ''),
      user: str(args, 'user'),
      client: str(args, 'client')
    });
    await revokeGrant(revokeOptions.accessToken, revokeOptions.user, revokeOptions.client);
    console.log(`Revoked ${revokeOptions.client} for ${revokeOptions.user}.`);
    return;
  }

  if (command !== 'scan') {
    console.error(`Unknown command: ${command}`);
    usage();
    process.exit(1);
  }

  const today = new Date().toISOString().slice(0, 10);
  const out = str(args, 'out', `oauthtriage-${today}.csv`);
  const scanOptions = normalizeScanOptions({
    accessToken: str(args, 'token', process.env.GOOGLE_ACCESS_TOKEN || ''),
    includeAudit: args['no-audit'] !== true,
    auditDays: num(args, 'audit-days', 180),
    maxUsers: args['max-users'] ? num(args, 'max-users', 100) : undefined,
    concurrency: num(args, 'concurrency', 4),
    customer: str(args, 'customer', 'my_customer')
  });
  const rows = await scanWorkspace({
    ...scanOptions,
    onProgress: (message) => console.error(message)
  });

  writeFileSync(out, toCsv(rows));

  const highCount = rows.filter((row) => row.risk_level === 'critical' || row.risk_level === 'high').length;
  console.log(`Wrote ${out}`);
  console.log(`${rows.length} grants scanned. ${highCount} critical/high rows need review first.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
