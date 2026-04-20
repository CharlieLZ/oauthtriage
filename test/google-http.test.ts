import test from 'node:test';
import assert from 'node:assert/strict';
import { googleJsonRequest } from '../src/lib/google-http';

test('googleJsonRequest retries bounded retryable failures and succeeds', async () => {
  const calls: string[] = [];
  const delays: number[] = [];

  const fetchFn: typeof fetch = async () => {
    calls.push('fetch');
    if (calls.length === 1) {
      return new Response(JSON.stringify({ error: { message: 'rate limited' } }), {
        status: 429,
        headers: { 'content-type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ users: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  const payload = await googleJsonRequest<{ users: unknown[] }>(
    '/admin/directory/v1/users',
    'token',
    {
      fetchFn,
      sleep: async (delayMs) => {
        delays.push(delayMs);
      }
    }
  );

  assert.deepEqual(payload, { users: [] });
  assert.equal(calls.length, 2);
  assert.deepEqual(delays, [250]);
});

test('googleJsonRequest does not retry non-retryable failures', async () => {
  let calls = 0;

  const fetchFn: typeof fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: { message: 'bad request' } }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });
  };

  await assert.rejects(
    () => googleJsonRequest('/admin/directory/v1/users', 'token', { fetchFn }),
    /400/
  );

  assert.equal(calls, 1);
});
