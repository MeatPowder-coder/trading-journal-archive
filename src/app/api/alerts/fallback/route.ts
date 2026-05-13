import { NextRequest, NextResponse } from 'next/server';
import { getN8nFallbackEnabled, setN8nFallbackEnabled } from '@/lib/alerts/engine';
import { isInternalAlertsRequest } from '@/lib/alerts/auth';

function isAuthorized(req: NextRequest) {
    const incoming = req.headers.get('x-alerts-token');
    return isInternalAlertsRequest(incoming);
}

export async function GET(req: NextRequest) {
    try {
        if (!isAuthorized(req)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const enabled = await getN8nFallbackEnabled();
        return NextResponse.json({ success: true, enabled });
    } catch (err: any) {
        return NextResponse.json(
            { success: false, error: err?.message || 'fallback status failed' },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        if (!isAuthorized(req)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json().catch(() => ({}));
        const enabled = Boolean(body?.enabled);
        await setN8nFallbackEnabled(enabled);

        return NextResponse.json({ success: true, enabled });
    } catch (err: any) {
        return NextResponse.json(
            { success: false, error: err?.message || 'fallback toggle failed' },
            { status: 500 }
        );
    }
}
