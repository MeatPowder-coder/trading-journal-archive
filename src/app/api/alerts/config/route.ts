import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { getEffectiveAlertsConfig, updateAlertsConfigRuntime } from '@/lib/alerts/config';

export async function GET() {
    try {
        const session = await getAuthSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { config, sources } = await getEffectiveAlertsConfig();
        return NextResponse.json({ success: true, config, sources });
    } catch (err: any) {
        return NextResponse.json(
            { success: false, error: err?.message || 'config read failed' },
            { status: 500 }
        );
    }
}

export async function PUT(req: NextRequest) {
    try {
        const session = await getAuthSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json().catch(() => ({}));
        const updated = await updateAlertsConfigRuntime(body, {
            userId: session.userId,
            email: session.email,
        });

        return NextResponse.json({ success: true, config: updated });
    } catch (err: any) {
        return NextResponse.json(
            { success: false, error: err?.message || 'config update failed' },
            { status: 400 }
        );
    }
}

