'use client';

import { useMemo, useState } from 'react';
import { toCsv } from '../lib/csv';
import type { TriageRow } from '../lib/google';

export default function Home() {
  const [accessToken, setAccessToken] = useState('');
  const [maxUsers, setMaxUsers] = useState('');
  const [auditDays, setAuditDays] = useState('180');
  const [includeAudit, setIncludeAudit] = useState(true);
  const [rows, setRows] = useState<TriageRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const stats = useMemo(() => {
    const critical = rows.filter((row) => row.risk_level === 'critical').length;
    const high = rows.filter((row) => row.risk_level === 'high').length;
    const medium = rows.filter((row) => row.risk_level === 'medium').length;
    return { critical, high, medium };
  }, [rows]);

  async function scan() {
    setLoading(true);
    setError('');
    setRows([]);
    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken,
          includeAudit,
          auditDays: Number(auditDays || 180),
          maxUsers: maxUsers ? Number(maxUsers) : undefined
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Scan failed');
      setRows(data.rows || []);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : String(scanError));
    } finally {
      setLoading(false);
    }
  }

  function downloadCsv() {
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `oauthtriage-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main>
      <section className="hero">
        <div className="eyebrow">OAuthTriage local-first</div>
        <h1>Find the five zombie OAuth grants before they become your breach path.</h1>
        <p>
          Paste a short-lived Google Workspace admin access token, scan third-party OAuth grants,
          rank them by scope sensitivity and recent token activity, then export a CSV for revocation review.
        </p>
      </section>

      <section className="grid">
        <div className="card">
          <h2>Run a local scan</h2>
          <p className="notice small">
            Keep this as a local tool first. Do not ask strangers to paste admin tokens into a hosted website until OAuth verification,
            security review, logging, and a privacy policy are done.
          </p>
          <label>Google Workspace admin access token</label>
          <textarea
            value={accessToken}
            onChange={(event) => setAccessToken(event.target.value)}
            placeholder="ya29..."
          />
          <label>Max users, optional</label>
          <input value={maxUsers} onChange={(event) => setMaxUsers(event.target.value)} placeholder="25" />
          <label>Audit lookback days, max 180</label>
          <input value={auditDays} onChange={(event) => setAuditDays(event.target.value)} />
          <label>
            <input
              className="checkbox"
              type="checkbox"
              checked={includeAudit}
              onChange={(event) => setIncludeAudit(event.target.checked)}
            />
            Include Reports API token activity events
          </label>
          <button disabled={loading || !accessToken.trim()} onClick={scan}>
            {loading ? 'Scanning...' : 'Scan OAuth grants'}
          </button>
          {error && <p className="small error-text">{error}</p>}
        </div>

        <div className="card">
          <h2>Output</h2>
          <p>
            The CSV is designed for one decision: revoke, allowlist, or verify owner. Start with critical/high rows.
          </p>
          <div className="kpis">
            <div className="kpi"><strong>{stats.critical}</strong><span>critical</span></div>
            <div className="kpi"><strong>{stats.high}</strong><span>high</span></div>
            <div className="kpi"><strong>{stats.medium}</strong><span>medium</span></div>
          </div>
          <button disabled={rows.length === 0} onClick={downloadCsv}>Download CSV</button>
        </div>
      </section>

      {rows.length > 0 && (
        <section className="card results-card">
          <h2>Top risky grants</h2>
          <table>
            <thead>
              <tr>
                <th>Risk</th>
                <th>App</th>
                <th>User</th>
                <th>Sensitive scopes</th>
                <th>Last activity</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 20).map((row, index) => (
                <tr key={`${row.client_id}-${row.user_email}-${index}`}>
                  <td><span className="badge">{row.risk_level} {row.risk_score}</span></td>
                  <td>
                    <div>{row.app_name}</div>
                    <div className="code">{row.client_id}</div>
                  </td>
                  <td>{row.user_email}</td>
                  <td className="code">{row.sensitive_scopes || '—'}</td>
                  <td>{row.last_activity_at || 'not seen'}</td>
                  <td>{row.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
