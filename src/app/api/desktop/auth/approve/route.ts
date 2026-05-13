import { NextRequest } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { desktopCorsPreflight, withDesktopCors } from '@/lib/desktop-cors';
import { approveDesktopPairingCode } from '@/lib/desktop-pairing';

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthSession();
    if (!auth) {
      return withDesktopCors(req, { error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const result = await approveDesktopPairingCode({
      pairingCode: body?.pairingCode,
      userId: auth.userId,
      userEmail: auth.email || null,
      userName: auth.name || null,
    });
    return withDesktopCors(req, result.payload, { status: result.status });
  } catch (error: any) {
    return withDesktopCors(
      req,
      { error: error?.message || 'Error aprobando pairing' },
      { status: 500 }
    );
  }
}

export function OPTIONS(req: NextRequest) {
  return desktopCorsPreflight(req);
}
