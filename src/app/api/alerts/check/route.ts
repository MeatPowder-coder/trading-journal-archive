import { NextRequest, NextResponse } from 'next/server';
import { runCriticalAlertsCheck } from '@/lib/alerts/engine';
import { isInternalAlertsRequest } from '@/lib/alerts/auth';

function isAuthorized(req: NextRequest) {
    const incoming = req.headers.get('x-alerts-token');
    return isInternalAlertsRequest(incoming);
}

export async function POST(req: NextRequest) {
    try {
        if (!isAuthorized(req)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const summary = await runCriticalAlertsCheck();
        return NextResponse.json({ success: true, summary });
    } catch (err: any) {
        return NextResponse.json(
            { success: false, error: err?.message || 'alerts check failed' },
            { status: 500 }
        );
    }
}
