import { googleJsonRequest, googleVoidRequest } from './google-http';
import type {
  ActivityEvent,
  ActivityParameter,
  AuditActivity,
  AuditSummary,
  GoogleToken,
  ScanOptions,
  TriageRow,
  WorkspaceUser
} from './google-types';
import { scoreGrant } from './risk';

export type { ScanOptions, TriageRow } from './google-types';

function normalizeParamName(name: string): string {
  return name.trim().replace(/[\s-]+/g, '_').toLowerCase();
}

function paramValue(parameter: ActivityParameter | undefined): string | undefined {
  if (!parameter) return undefined;
  if (parameter.value !== undefined) return parameter.value;
  if (parameter.intValue !== undefined) return parameter.intValue;
  if (parameter.boolValue !== undefined) return String(parameter.boolValue);
  if (parameter.multiValue && parameter.multiValue.length > 0) return parameter.multiValue.join(' ');
  if (parameter.multiIntValue && parameter.multiIntValue.length > 0) return parameter.multiIntValue.join(' ');
  return undefined;
}

function eventParams(event: ActivityEvent): Record<string, string> {
  const output: Record<string, string> = {};
  for (const parameter of event.parameters || []) {
    output[normalizeParamName(parameter.name)] = paramValue(parameter) || '';
  }
  return output;
}

export async function listUsers(accessToken: string, options?: { customer?: string; maxUsers?: number }): Promise<WorkspaceUser[]> {
  const users: WorkspaceUser[] = [];
  let pageToken: string | undefined;
  const customer = options?.customer || 'my_customer';
  const maxUsers = options?.maxUsers || Number.POSITIVE_INFINITY;

  do {
    const page = await googleJsonRequest<{ users?: WorkspaceUser[]; nextPageToken?: string }>(
      '/admin/directory/v1/users',
      accessToken,
      {
        query: {
          customer,
          maxResults: 500,
          projection: 'BASIC',
          viewType: 'admin_view',
          pageToken
        }
      }
    );

    for (const user of page.users || []) {
      if (users.length >= maxUsers) break;
      if (!user.suspended && !user.archived) users.push(user);
    }

    pageToken = users.length >= maxUsers ? undefined : page.nextPageToken;
  } while (pageToken);

  return users;
}

export async function listTokensForUser(accessToken: string, userKey: string): Promise<GoogleToken[]> {
  const page = await googleJsonRequest<{ items?: GoogleToken[] }>(
    `/admin/directory/v1/users/${encodeURIComponent(userKey)}/tokens`,
    accessToken
  );
  return page.items || [];
}

export async function listTokenAuditEvents(
  accessToken: string,
  options?: { days?: number; maxPages?: number; eventName?: string }
): Promise<AuditActivity[]> {
  const days = Math.min(Math.max(options?.days || 180, 1), 180);
  const maxPages = options?.maxPages || 10;
  const startTime = new Date(Date.now() - days * 86_400_000).toISOString();
  const activities: AuditActivity[] = [];
  let pageToken: string | undefined;
  let pages = 0;

  do {
    const page = await googleJsonRequest<{ items?: AuditActivity[]; nextPageToken?: string }>(
      '/admin/reports/v1/activity/users/all/applications/token',
      accessToken,
      {
        query: {
          startTime,
          maxResults: 1000,
          pageToken,
          eventName: options?.eventName
        }
      }
    );

    activities.push(...(page.items || []));
    pageToken = page.nextPageToken;
    pages += 1;
  } while (pageToken && pages < maxPages);

  return activities;
}

function upsertAuditSummary(map: Map<string, AuditSummary>, summary: AuditSummary): void {
  const existing = map.get(summary.clientId) || { clientId: summary.clientId };
  const newest = (a?: string, b?: string) => {
    if (!a) return b;
    if (!b) return a;
    return Date.parse(a) >= Date.parse(b) ? a : b;
  };

  map.set(summary.clientId, {
    ...existing,
    ...summary,
    lastActivityAt: newest(existing.lastActivityAt, summary.lastActivityAt),
    lastEventAt: newest(existing.lastEventAt, summary.lastEventAt),
    authorizedAt: newest(existing.authorizedAt, summary.authorizedAt),
    revokedAt: newest(existing.revokedAt, summary.revokedAt)
  });
}

export function summarizeAuditEvents(activities: AuditActivity[]): {
  byClientId: Map<string, AuditSummary>;
  byClientAndUser: Map<string, AuditSummary>;
} {
  const byClientId = new Map<string, AuditSummary>();
  const byClientAndUser = new Map<string, AuditSummary>();

  for (const activity of activities) {
    const time = activity.id?.time;
    const actorEmail = activity.actor?.email;
    for (const event of activity.events || []) {
      const params = eventParams(event);
      const clientId = params.client_id || activity.actor?.applicationInfo?.oauthClientId;
      if (!clientId) continue;

      const eventName = (event.name || '').toLowerCase();
      const summary: AuditSummary = {
        clientId,
        userEmail: actorEmail,
        appName: params.app_name || activity.actor?.applicationInfo?.applicationName,
        clientType: params.client_type,
        lastEventAt: time,
        lastActivityAt: eventName === 'activity' ? time : undefined,
        authorizedAt: eventName === 'authorize' ? time : undefined,
        revokedAt: eventName === 'revoke' ? time : undefined,
        lastMethod: params.method_name,
        lastApi: params.api_name,
        productBucket: params.product_bucket
      };

      upsertAuditSummary(byClientId, summary);
      if (actorEmail) upsertAuditSummary(byClientAndUser, { ...summary, clientId: `${clientId}|${actorEmail.toLowerCase()}` });
    }
  }

  return { byClientId, byClientAndUser };
}

async function mapLimit<T, R>(items: T[], concurrency: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
  return results;
}

function actionForRiskLevel(level: TriageRow['risk_level']): TriageRow['action'] {
  if (level === 'critical' || level === 'high') return 'revoke_or_allowlist';
  if (level === 'medium') return 'verify_owner_and_need';
  return 'keep_if_expected';
}

function buildScanErrorRow(user: WorkspaceUser, error: string): TriageRow {
  return {
    risk_level: 'medium',
    risk_score: 50,
    action: 'check_permissions',
    app_name: 'SCAN_ERROR',
    client_id: '',
    user_email: user.primaryEmail,
    user_id: user.id,
    scope_count: 0,
    sensitive_scope_count: 0,
    sensitive_scopes: '',
    all_scopes: '',
    anonymous_client: false,
    native_app: false,
    last_activity_at: '',
    authorized_at: '',
    last_event_at: '',
    last_api: '',
    last_method: '',
    product_bucket: '',
    reasons: error,
    revoke_command: ''
  };
}

export async function scanWorkspace(options: ScanOptions): Promise<TriageRow[]> {
  const includeAudit = options.includeAudit !== false;
  const auditDays = options.auditDays || 180;
  const concurrency = options.concurrency || 4;

  options.onProgress?.('Listing active users...');
  const users = await listUsers(options.accessToken, { customer: options.customer, maxUsers: options.maxUsers });

  options.onProgress?.(`Found ${users.length} active users. Listing OAuth grants...`);
  const tokenGroups = await mapLimit(users, concurrency, async (user, index) => {
    options.onProgress?.(`Scanning ${index + 1}/${users.length}: ${user.primaryEmail}`);
    try {
      const tokens = await listTokensForUser(options.accessToken, user.primaryEmail);
      return { user, tokens, error: undefined as string | undefined };
    } catch (error) {
      return { user, tokens: [] as GoogleToken[], error: error instanceof Error ? error.message : String(error) };
    }
  });

  let auditByClientId = new Map<string, AuditSummary>();
  let auditByClientAndUser = new Map<string, AuditSummary>();
  if (includeAudit) {
    options.onProgress?.(`Reading token audit events for last ${auditDays} days...`);
    try {
      const audit = summarizeAuditEvents(await listTokenAuditEvents(options.accessToken, { days: auditDays }));
      auditByClientId = audit.byClientId;
      auditByClientAndUser = audit.byClientAndUser;
    } catch (error) {
      options.onProgress?.(`Audit logs unavailable; continuing without last-activity data. ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const rows: TriageRow[] = [];

  for (const group of tokenGroups) {
    if (group.error) {
      rows.push(buildScanErrorRow(group.user, group.error));
      continue;
    }

    for (const token of group.tokens) {
      const clientId = token.clientId || '';
      const exactAudit = auditByClientAndUser.get(`${clientId}|${group.user.primaryEmail.toLowerCase()}`);
      const appAudit = auditByClientId.get(clientId);
      const audit = exactAudit || appAudit;
      const scopes = token.scopes || [];

      const finding = scoreGrant({
        displayText: token.displayText || audit?.appName || clientId,
        scopes,
        anonymous: token.anonymous,
        nativeApp: token.nativeApp,
        lastActivityAt: audit?.lastActivityAt,
        authorizedAt: audit?.authorizedAt
      });

      rows.push({
        risk_level: finding.level,
        risk_score: finding.score,
        action: actionForRiskLevel(finding.level),
        app_name: token.displayText || audit?.appName || '(unknown app)',
        client_id: clientId,
        user_email: group.user.primaryEmail,
        user_id: token.userKey || group.user.id,
        scope_count: scopes.length,
        sensitive_scope_count: finding.sensitiveScopes.length,
        sensitive_scopes: finding.sensitiveScopes.join(' '),
        all_scopes: scopes.join(' '),
        anonymous_client: Boolean(token.anonymous),
        native_app: Boolean(token.nativeApp),
        last_activity_at: audit?.lastActivityAt || '',
        authorized_at: audit?.authorizedAt || '',
        last_event_at: audit?.lastEventAt || '',
        last_api: audit?.lastApi || '',
        last_method: audit?.lastMethod || '',
        product_bucket: audit?.productBucket || '',
        reasons: finding.reasons.join('; '),
        revoke_command: clientId ? `oauthtriage revoke --user ${group.user.primaryEmail} --client ${clientId}` : ''
      });
    }
  }

  return rows.sort((a, b) => b.risk_score - a.risk_score || a.app_name.localeCompare(b.app_name));
}

export async function revokeGrant(accessToken: string, userKey: string, clientId: string): Promise<void> {
  await googleVoidRequest(
    `/admin/directory/v1/users/${encodeURIComponent(userKey)}/tokens/${encodeURIComponent(clientId)}`,
    accessToken,
    { method: 'DELETE', retries: 0 }
  );
}
