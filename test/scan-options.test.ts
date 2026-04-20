import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRevokeOptions, normalizeScanOptions } from '../src/lib/scan-options';

test('normalizeScanOptions trims strings and clamps numeric inputs', () => {
  const options = normalizeScanOptions({
    accessToken: '  token-123  ',
    includeAudit: true,
    auditDays: '999',
    maxUsers: '0',
    concurrency: '999',
    customer: '  my_customer  '
  });

  assert.equal(options.accessToken, 'token-123');
  assert.equal(options.includeAudit, true);
  assert.equal(options.auditDays, 180);
  assert.equal(options.maxUsers, undefined);
  assert.equal(options.concurrency, 8);
  assert.equal(options.customer, 'my_customer');
});

test('normalizeScanOptions fails early when access token is missing', () => {
  assert.throws(
    () => normalizeScanOptions({ accessToken: '   ' }),
    /Missing access token/
  );
});

test('normalizeRevokeOptions requires token user and client', () => {
  assert.throws(
    () => normalizeRevokeOptions({ accessToken: 'token', user: '', client: 'abc' }),
    /Missing user/
  );
  assert.throws(
    () => normalizeRevokeOptions({ accessToken: 'token', user: 'admin@example.com', client: '' }),
    /Missing client/
  );
});
