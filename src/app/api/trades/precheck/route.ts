import { NextResponse } from 'next/server';
import {
  getLatestAccountBalanceUsdt,
  getMaxRiskAmount,
  getTodayTradingSession,
  isTradingBlockedNow,
} from '@/lib/trading/discipline';

export async function GET() {
  try {
    const now = new Date();
    const [balance, blockInfo, session] = await Promise.all([
      getLatestAccountBalanceUsdt(),
      isTradingBlockedNow(now),
      getTodayTradingSession(now),
    ]);

    return NextResponse.json({
      balanceUsdt: balance,
      maxRisk: getMaxRiskAmount(balance),
      blocked: blockInfo.blocked,
      blockedUntil: blockInfo.blockedUntil,
      remainingSeconds: blockInfo.remainingSeconds,
      session,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error de precheck' }, { status: 500 });
  }
}
