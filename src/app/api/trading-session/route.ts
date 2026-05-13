import { NextRequest, NextResponse } from 'next/server';
import {
  getTodayTradingSession,
  isTradingBlockedNow,
  MENTAL_STATES,
  MentalState,
  upsertTodayTradingSession,
} from '@/lib/trading/discipline';

const VALID_MENTAL_STATES: MentalState[] = [...MENTAL_STATES];

export async function GET() {
  try {
    const now = new Date();
    const [session, blockStatus] = await Promise.all([
      getTodayTradingSession(now),
      isTradingBlockedNow(now),
    ]);

    return NextResponse.json({
      sessionDate: now.toISOString().slice(0, 10),
      session,
      blocked: blockStatus.blocked,
      blockedUntil: blockStatus.blockedUntil,
      remainingSeconds: blockStatus.remainingSeconds,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error obteniendo sesión' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const mentalState = typeof body.mentalState === 'string' ? body.mentalState : null;
    const rulesConfirmed = Boolean(body.rulesConfirmed);
    const notes = typeof body.notes === 'string' ? body.notes.trim() : null;
    const overrideUsed = Boolean(body.overrideUsed);

    if (mentalState && !VALID_MENTAL_STATES.includes(mentalState as MentalState)) {
      return NextResponse.json({ error: 'mentalState inválido' }, { status: 400 });
    }

    const session = await upsertTodayTradingSession({
      mentalState: (mentalState as MentalState | null) || null,
      rulesConfirmed,
      notes,
      overrideUsed,
    });

    return NextResponse.json({ success: true, session });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error guardando sesión' }, { status: 500 });
  }
}
