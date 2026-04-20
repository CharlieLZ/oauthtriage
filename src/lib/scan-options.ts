export const DEFAULT_AUDIT_DAYS = 180;
export const DEFAULT_CONCURRENCY = 4;
export const MAX_AUDIT_DAYS = 180;
export const MAX_CONCURRENCY = 8;

type RawValue = unknown;

export type NormalizedScanOptions = {
  accessToken: string;
  includeAudit: boolean;
  auditDays: number;
  maxUsers?: number;
  concurrency: number;
  customer: string;
};

export type NormalizedRevokeOptions = {
  accessToken: string;
  user: string;
  client: string;
};

function readString(value: RawValue): string {
  return String(value ?? '').trim();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readPositiveInt(value: RawValue): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function requireValue(name: string, value: RawValue): string {
  const text = readString(value);
  if (!text) throw new Error(`Missing ${name}.`);
  return text;
}

export function normalizeScanOptions(input: {
  accessToken: RawValue;
  includeAudit?: RawValue;
  auditDays?: RawValue;
  maxUsers?: RawValue;
  concurrency?: RawValue;
  customer?: RawValue;
}): NormalizedScanOptions {
  const accessToken = requireValue('access token', input.accessToken);
  const auditDays = clamp(readPositiveInt(input.auditDays) ?? DEFAULT_AUDIT_DAYS, 1, MAX_AUDIT_DAYS);
  const maxUsers = readPositiveInt(input.maxUsers);
  const concurrency = clamp(readPositiveInt(input.concurrency) ?? DEFAULT_CONCURRENCY, 1, MAX_CONCURRENCY);
  const customer = readString(input.customer) || 'my_customer';

  return {
    accessToken,
    includeAudit: input.includeAudit !== false,
    auditDays,
    maxUsers,
    concurrency,
    customer
  };
}

export function normalizeRevokeOptions(input: {
  accessToken: RawValue;
  user: RawValue;
  client: RawValue;
}): NormalizedRevokeOptions {
  return {
    accessToken: requireValue('access token', input.accessToken),
    user: requireValue('user', input.user),
    client: requireValue('client', input.client)
  };
}
