import { NextRequest, NextResponse } from 'next/server';
import { scanWorkspace } from '../../../lib/google';
import { normalizeScanOptions } from '../../../lib/scan-options';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const scanOptions = normalizeScanOptions({
      accessToken: body.accessToken,
      includeAudit: body.includeAudit,
      auditDays: body.auditDays,
      maxUsers: body.maxUsers,
      concurrency: body.concurrency,
      customer: body.customer
    });

    const rows = await scanWorkspace(scanOptions);

    return NextResponse.json({ rows, count: rows.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.startsWith('Missing ') ? 400 : 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
