import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { resolveDesktopAccessContext } from '@/lib/desktop-auth';
import { desktopCorsPreflight, withDesktopCors } from '@/lib/desktop-cors';

export async function POST(req: NextRequest) {
  try {
    const access = await resolveDesktopAccessContext(req);
    if (!access) {
      return withDesktopCors(req, { error: 'Unauthorized' }, { status: 401 });
    }

    await query(
      `UPDATE desktop_device_sessions
       SET status = 'REVOKED',
           revoked_at = NOW(),
           refresh_token_hash = NULL,
           refresh_expires_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [access.deviceSessionId]
    );

    return withDesktopCors(req, { success: true, status: 'REVOKED' });
  } catch (error: any) {
    return withDesktopCors(
      req,
      { error: error?.message || 'Error revocando sesión desktop' },
      { status: 500 }
    );
  }
}

export function OPTIONS(req: NextRequest) {
  return desktopCorsPreflight(req);
}
