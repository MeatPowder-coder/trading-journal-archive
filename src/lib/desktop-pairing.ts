import { query } from '@/lib/db';

function normalizePairingCode(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim().toUpperCase();
}

export async function approveDesktopPairingCode(params: {
  pairingCode: unknown;
  userId: string;
  userEmail?: string | null;
  userName?: string | null;
}) {
  const pairingCode = normalizePairingCode(params.pairingCode);
  if (!pairingCode) {
    return { status: 400, payload: { error: 'pairingCode requerido' } };
  }

  const found = await query(
    `SELECT id, pairing_id, status, expires_at
     FROM desktop_device_sessions
     WHERE pairing_code = $1
     LIMIT 1`,
    [pairingCode]
  );

  if (!found.rows.length) {
    return { status: 404, payload: { error: 'Pairing code no encontrado' } };
  }

  const row = found.rows[0];
  const status = String(row.status || '').toUpperCase();
  const now = Date.now();
  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;

  if (status === 'REVOKED' || status === 'EXPIRED') {
    return { status: 410, payload: { error: `Pairing code ${status.toLowerCase()}` } };
  }

  if (expiresAt > 0 && expiresAt <= now) {
    await query(
      `UPDATE desktop_device_sessions
       SET status = 'EXPIRED',
           updated_at = NOW()
       WHERE id = $1`,
      [row.id]
    );
    return { status: 410, payload: { error: 'Pairing code expirado' } };
  }

  if (status === 'EXCHANGED') {
    return { status: 409, payload: { error: 'Pairing code ya fue usado' } };
  }

  if (status !== 'PENDING' && status !== 'APPROVED') {
    return { status: 409, payload: { error: `Estado inválido: ${status}` } };
  }

  await query(
    `UPDATE desktop_device_sessions
     SET status = 'APPROVED',
         user_id = $2,
         user_email = $3,
         user_name = $4,
         approved_at = COALESCE(approved_at, NOW()),
         updated_at = NOW()
     WHERE id = $1`,
    [row.id, params.userId, params.userEmail || null, params.userName || null]
  );

  return {
    status: 200,
    payload: {
      success: true,
      pairingId: row.pairing_id,
      status: 'APPROVED',
    },
  };
}
