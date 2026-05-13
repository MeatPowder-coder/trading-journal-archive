import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { sendTestAlert } from '@/lib/alerts/engine';

export async function POST() {
    try {
        const session = await getAuthSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const result = await sendTestAlert({
            triggeredBy: session.userId,
            triggeredEmail: session.email,
        });

        return NextResponse.json({ success: true, result });
    } catch (err: any) {
        const message = String(err?.message || 'test alert failed');
        const cooldownMatch = message.match(/\((\d+)s restantes\)/i);
        if (cooldownMatch) {
            const remainingSeconds = Number(cooldownMatch[1]);
            return NextResponse.json(
                {
                    success: false,
                    deduplicated: true,
                    remainingSeconds: Number.isFinite(remainingSeconds) ? remainingSeconds : null,
                    error: message,
                },
                { status: 429 }
            );
        }

        return NextResponse.json(
            { success: false, error: message },
            { status: 400 }
        );
    }
}
