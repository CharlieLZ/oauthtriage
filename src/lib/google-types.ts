import type { RiskLevel } from './risk';

export type WorkspaceUser = {
  id: string;
  primaryEmail: string;
  name?: { fullName?: string };
  suspended?: boolean;
  archived?: boolean;
  isAdmin?: boolean;
  orgUnitPath?: string;
};

export type GoogleToken = {
  clientId: string;
  scopes?: string[];
  userKey?: string;
  anonymous?: boolean;
  displayText?: string;
  nativeApp?: boolean;
  kind?: string;
  etag?: string;
};

export type ActivityParameter = {
  name: string;
  value?: string;
  multiValue?: string[];
  intValue?: string;
  multiIntValue?: string[];
  boolValue?: boolean;
  messageValue?: { parameter?: ActivityParameter[] };
  multiMessageValue?: Array<{ parameter?: ActivityParameter[] }>;
};

export type ActivityEvent = {
  type?: string;
  name?: string;
  parameters?: ActivityParameter[];
};

export type AuditActivity = {
  id?: {
    time?: string;
    applicationName?: string;
    customerId?: string;
  };
  actor?: {
    email?: string;
    profileId?: string;
    callerType?: string;
    applicationInfo?: {
      oauthClientId?: string;
      applicationName?: string;
      impersonation?: boolean;
    };
  };
  events?: ActivityEvent[];
};

export type AuditSummary = {
  clientId: string;
  userEmail?: string;
  appName?: string;
  clientType?: string;
  lastActivityAt?: string;
  lastEventAt?: string;
  authorizedAt?: string;
  revokedAt?: string;
  lastMethod?: string;
  lastApi?: string;
  productBucket?: string;
};

export type TriageRow = {
  risk_level: RiskLevel;
  risk_score: number;
  action: string;
  app_name: string;
  client_id: string;
  user_email: string;
  user_id: string;
  scope_count: number;
  sensitive_scope_count: number;
  sensitive_scopes: string;
  all_scopes: string;
  anonymous_client: boolean;
  native_app: boolean;
  last_activity_at: string;
  authorized_at: string;
  last_event_at: string;
  last_api: string;
  last_method: string;
  product_bucket: string;
  reasons: string;
  revoke_command: string;
};

export type ScanOptions = {
  accessToken: string;
  includeAudit?: boolean;
  auditDays?: number;
  maxUsers?: number;
  concurrency?: number;
  customer?: string;
  onProgress?: (message: string) => void;
};
