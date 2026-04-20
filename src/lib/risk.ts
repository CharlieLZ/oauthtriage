export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';

export type RiskFinding = {
  level: RiskLevel;
  score: number;
  reasons: string[];
  sensitiveScopes: string[];
};

const CRITICAL_SCOPE_PATTERNS: RegExp[] = [
  /\/auth\/gmail\.send$/i,
  /\/auth\/gmail\.modify$/i,
  /\/auth\/gmail\.readonly$/i,
  /\/auth\/gmail\.settings\.basic$/i,
  /\/auth\/gmail\.settings\.sharing$/i,
  /\/auth\/drive$/i,
  /\/auth\/drive\.metadata$/i,
  /\/auth\/drive\.readonly$/i,
  /\/auth\/admin\./i,
  /\/auth\/cloud-platform$/i,
  /\/auth\/script\./i,
  /\/auth\/apps\.groups\./i,
  /\/auth\/ediscovery/i,
  /\/auth\/vault/i
];

const HIGH_SCOPE_PATTERNS: RegExp[] = [
  /\/auth\/calendar$/i,
  /\/auth\/calendar\.events$/i,
  /\/auth\/contacts/i,
  /\/auth\/directory/i,
  /\/auth\/chat\./i,
  /\/auth\/forms/i,
  /\/auth\/spreadsheets/i,
  /\/auth\/documents/i,
  /\/auth\/presentations/i,
  /\/auth\/tasks/i
];

const AI_OR_AUTOMATION_NAME_PATTERNS: RegExp[] = [
  /ai/i,
  /agent/i,
  /assistant/i,
  /copilot/i,
  /gpt/i,
  /claude/i,
  /gemini/i,
  /zapier/i,
  /make\.com/i,
  /n8n/i,
  /automation/i,
  /workflow/i,
  /bot/i,
  /extension/i
];

const LOW_RISK_SCOPES = new Set([
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
]);

export function classifyScopes(scopes: string[]): {
  critical: string[];
  high: string[];
  low: string[];
  unknown: string[];
} {
  const critical: string[] = [];
  const high: string[] = [];
  const low: string[] = [];
  const unknown: string[] = [];

  for (const rawScope of scopes || []) {
    const scope = rawScope.trim();
    if (!scope) continue;
    if (LOW_RISK_SCOPES.has(scope)) {
      low.push(scope);
    } else if (CRITICAL_SCOPE_PATTERNS.some((pattern) => pattern.test(scope))) {
      critical.push(scope);
    } else if (HIGH_SCOPE_PATTERNS.some((pattern) => pattern.test(scope))) {
      high.push(scope);
    } else {
      unknown.push(scope);
    }
  }

  return { critical, high, low, unknown };
}

export function daysSince(isoDate?: string | null): number | null {
  if (!isoDate) return null;
  const timestamp = Date.parse(isoDate);
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
}

export function scoreGrant(input: {
  displayText: string;
  scopes: string[];
  anonymous?: boolean;
  nativeApp?: boolean;
  lastActivityAt?: string | null;
  authorizedAt?: string | null;
}): RiskFinding {
  const reasons: string[] = [];
  let score = 0;

  const classified = classifyScopes(input.scopes);
  const sensitiveScopes = [...classified.critical, ...classified.high];

  if (classified.critical.length > 0) {
    score += 70 + Math.min(20, classified.critical.length * 5);
    reasons.push(`critical scopes: ${classified.critical.length}`);
  }

  if (classified.high.length > 0) {
    score += 35 + Math.min(20, classified.high.length * 4);
    reasons.push(`high scopes: ${classified.high.length}`);
  }

  if (classified.unknown.length >= 3) {
    score += 10;
    reasons.push('many non-basic scopes');
  }

  if (input.anonymous) {
    score += 20;
    reasons.push('anonymous/unregistered OAuth client');
  }

  if (input.nativeApp) {
    score += 8;
    reasons.push('native/installed app token');
  }

  if (AI_OR_AUTOMATION_NAME_PATTERNS.some((pattern) => pattern.test(input.displayText || ''))) {
    score += 12;
    reasons.push('AI/automation-like app name');
  }

  const lastActivityDays = daysSince(input.lastActivityAt);
  const authorizedDays = daysSince(input.authorizedAt);

  if (lastActivityDays === null) {
    score += 18;
    reasons.push('no activity seen in audit window');
  } else if (lastActivityDays > 90) {
    score += 15;
    reasons.push(`inactive for ${lastActivityDays}+ days`);
  } else if (lastActivityDays <= 14) {
    score -= 8;
    reasons.push('recently active');
  }

  if (authorizedDays !== null && authorizedDays > 365) {
    score += 10;
    reasons.push('old grant');
  }

  score = Math.max(0, Math.min(100, score));

  let level: RiskLevel = 'low';
  if (score >= 80) level = 'critical';
  else if (score >= 55) level = 'high';
  else if (score >= 25) level = 'medium';

  if (reasons.length === 0) reasons.push('basic or low-risk scopes only');

  return { level, score, reasons, sensitiveScopes };
}
